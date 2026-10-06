# Обща база: двама шофьори на различни устройства + админ. Сървър: node tools/dev.mjs 8766
import asyncio, json, sys
from playwright.async_api import async_playwright

base = 'http://localhost:8766'
fails = []; total = 0
def check(ok, name, extra=''):
    global total; total += 1
    print(('PASS ' if ok else 'FAIL ') + ' ' + name + (f'  [{extra}]' if extra != '' else ''))
    if not ok: fails.append(name)

INIT = "try{localStorage.setItem('profitaxi.live','1');sessionStorage.setItem('profitaxi.oneIntro','1');localStorage.setItem('profitaxi.adminTour','done')}catch(e){}"
S = "const s = await import('/js/store.js');"

async def device(b, w=390):
    ctx = await b.new_context(viewport={'width': w, 'height': 844})
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, pg, errs

async def register(pg, name, email, phone):
    await pg.goto(base + '/app#/register'); await pg.wait_for_timeout(400)
    return await pg.evaluate(S.join(["async () => {", f"""
      const c = s.sendSmsCode('{phone}'); s.verifySmsCode('{phone}', c.demoCode);
      const r = await s.register({{ name: '{name}', email: '{email}', password: 'parola1', phone: '{phone}', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'own' }});
      return r.error || r.user.id; }}"""]))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c1, d1, e1 = await device(b)
        c2, d2, e2 = await device(b)
        c3, d1b, e3 = await device(b)   # същият шофьор на втори телефон
        id1 = await register(d1, 'Иван Тестов', 'ivan.t@mail.bg', '0888111222')
        check(len(id1) > 5, 'Регистрация на шофьор 1 в облака', id1)
        id2 = await register(d2, 'Мария Тестова', 'maria.t@mail.bg', '0888333444')
        check(len(id2) > 5 and id2 != id1, 'Регистрация на шофьор 2', id2)
        dup = await register(d2, 'Друг', 'IVAN.T@mail.bg', '0888555666')
        check('имейл' in dup, 'Втори акаунт със същия имейл е отказан', dup)
        dupph = await register(d2, 'Друг', 'drug@mail.bg', '0888 111 222')
        check('телефон' in dupph, 'Втори акаунт със същия телефон е отказан', dupph)
        # шофьорът 2 отново влиза (опитът за регистрация не го е изкарал)
        await d2.goto(base + '/app#/home'); await d2.wait_for_timeout(500)

        # шофьор 1 записва смяна и разход
        await d1.goto(base + '/app#/home'); await d1.wait_for_timeout(500)
        await d1.evaluate(S.join(["async () => {", """
          s.updateProfile({ onboarded: true, tour: 'done' });
          const sh = s.startShift(1000); sh.end = new Date().toISOString(); sh.kmEnd = 1200; sh.income = { cash: 120, card: 80, app: 0, tips: 5 };
          s.saveShift(sh);
          s.saveCost({ cat: 'fuel', amount: 40, date: new Date().toISOString().slice(0,10), kind: 'once' });
        }"""]))
        await d1.wait_for_timeout(1200)
        st = await d1.evaluate(S.join(["async () => {", "return s.syncState; }"]))
        check(not st['pending'], 'Промените са качени', st)

        # същият шофьор на друг телефон
        await d1b.goto(base + '/app#/login'); await d1b.wait_for_timeout(400)
        await d1b.fill('input[type=email]', 'ivan.t@mail.bg'); await d1b.fill('input[type=password]', 'parola1')
        await d1b.click('button[type=submit]'); await d1b.wait_for_timeout(1000)
        n = await d1b.evaluate(S.join(["async () => {", "const d = s.myData(); return [d.shifts.length, d.costs.length, d.user.name]; }"]))
        check(n[0] == 1 and n[1] >= 1 and n[2] == 'Иван Тестов', 'Вход от втори телефон: смяната и разходът са там', n)
        check(await d1b.locator('.demo-box').count() == 0, 'Без демо полето за вход в режим на живо')
        bad = await d1b.evaluate(S.join(["async () => {", "s.logout(); return (await s.login('ivan.t@mail.bg','greshna')).error; }"]))
        check(bad == 'Грешен имейл или парола', 'Грешна парола се отказва', bad)

        # шофьор 2 не вижда данните на шофьор 1
        await d2.evaluate(S.join(["async () => {", "await s.syncNow(); }"]))
        seen = await d2.evaluate(S.join(["async () => {", "const d = s._debug.db; return [d.users.length, d.shifts.length, d.costs.length, Object.keys(d.profiles).length]; }"]))
        check(seen == [1, 0, 0, 1], 'Шофьор 2 вижда само своите данни', seen)
        # шофьор 2 се опитва да запише смяна на шофьор 1 – сървърът отказва
        r = await d2.evaluate(S.join(["async () => {", f"""
          const tok = localStorage.getItem('profitaxi.tok.app');
          const res = await fetch('/api/db', {{ method:'POST', body: JSON.stringify({{ op:'push', token: tok, set: {{ 'shifts:xx': {{ id:'xx', userId:'{id1}', income:{{cash:999}} }}, 'users:{id1}': {{ id:'{id1}', name:'Хакер' }} }}, del: [] }}) }});
          return await res.json(); }}"""]))
        check(sorted(r.get('rejected', [])) == sorted(['shifts:xx', f'users:{id1}']), 'Чужди записи се отказват от сървъра', r)
        r = await d2.evaluate(S.join(["async () => {", """
          const tok = localStorage.getItem('profitaxi.tok.app');
          const me = s.currentUser(); const res = await fetch('/api/db', { method:'POST', body: JSON.stringify({ op:'push', token: tok, set: { ['users:' + me.id]: { ...me, status: 'active', subscription: { plan: 'paid', validUntil: '2099-01-01' }, role: 'admin' } }, del: [] }) });
          await res.json(); await s.syncNow(); const u = s.currentUser(); return [u?.role, u?.subscription?.validUntil]; }"""]))
        check(r[0] == 'driver' and r[1] != '2099-01-01', 'Шофьорът не може да си смени ролята и абонамента', r)
        nologin = await d2.evaluate("async () => (await (await fetch('/api/db', { method:'POST', body: JSON.stringify({ op:'pull', token:'nope' }) })).json())")
        check('error' in nologin, 'Без вход няма данни', nologin)

        # шофьор 2 пише въпрос
        await d2.evaluate(S.join(["async () => {", "s.sendTicket({ topic: 'other', text: 'Тест от Мария' }); }"]))
        await d2.wait_for_timeout(1000)

        # админ
        ca, a, ea = await device(b, 1280)
        await a.goto(base + '/admin'); await a.wait_for_timeout(500)
        check(await a.locator('.demo-box').count() == 0, 'Админ: без демо пароли на входа')
        await a.fill('input[type=email]', 'admin@profitaxi.bg'); await a.fill('input[type=password]', 'admin123')
        await a.click('button[type=submit]'); await a.wait_for_timeout(1200)
        drivers = await a.evaluate(S.join(["async () => {", "return s.admin.drivers().map(u => u.name).sort(); }"]))
        check(drivers == ['Иван Тестов', 'Мария Тестова'], 'Админът вижда двамата тестови шофьори (без демо)', drivers)
        d = await a.evaluate(S.join(["async () => {", f"const d = s.admin.driverData('{id1}'); return [d.shifts.length, d.costs.length]; }}"]))
        check(d[0] == 1 and d[1] >= 1, 'Админът вижда смяната и разхода на шофьор 1', d)
        await a.goto(base + '/admin#/drivers'); await a.wait_for_timeout(800)
        check(await a.locator('text=Иван Тестов').count() > 0, 'Шофьорът е в списъка „Шофьори“')
        t = await a.evaluate(S.join(["async () => {", "return s.admin.tickets().map(t => t.thread[0].text); }"]))
        check('Тест от Мария' in t, 'Въпросът на шофьор 2 стига до админа', t)
        # админът отговаря и праща съобщение
        await a.evaluate(S.join(["async () => {", """
          const t = s.admin.tickets().find(x => x.thread[0].text === 'Тест от Мария'); s.admin.replyTicket(t.id, 'Здравей, ето отговора');
          s.admin.sendMessage({ title: 'Здравейте', text: 'Тестово съобщение до всички', target: null }); }"""]))
        await a.wait_for_timeout(1200)
        await d2.evaluate(S.join(["async () => {", "await s.syncNow(); }"]))
        r = await d2.evaluate(S.join(["async () => {", "return [s.myTickets()[0]?.thread.map(m => m.text), s.myMessages().map(m => m.title), s.myUnreadTickets()]; }"]))
        check('Здравей, ето отговора' in (r[0] or []) and 'Здравейте' in r[1], 'Шофьорът получава отговора и съобщението', r)
        # шофьорът чете съобщението → админът вижда, че е прочетено
        await d2.evaluate(S.join(["async () => {", "s.myMessages().forEach(m => s.readMessage(m.id)); }"]))
        await d2.wait_for_timeout(1000)
        await a.evaluate(S.join(["async () => {", "await s.syncNow(); }"]))
        rb = await a.evaluate(S.join(["async () => {", f"return s._debug.db.messages.find(m => m.title === 'Здравейте')?.readBy; }}"]))
        check(rb == [id2], 'Админът вижда кой е прочел съобщението', rb)
        # админът спира шофьор 1 → шофьорът вижда, че е спрян
        await a.evaluate(S.join(["async () => {", f"s.admin.setStatus ? s.admin.setStatus('{id1}', 'blocked') : null; return !!s.admin.setStatus; }}"]))
        await a.wait_for_timeout(1000)
        await d1.evaluate(S.join(["async () => {", "await s.syncNow(); }"]))
        acc = await d1.evaluate(S.join(["async () => {", "return s.accessState(s.currentUser()); }"]))
        check(acc == 'blocked', 'Спиране от админа стига до шофьора', acc)
        # нов админ от панела
        r = await a.evaluate(S.join(["async () => {", "return s.admin.saveAdmin({ email: 'pomosht@mail.bg', name: 'Помощник', password: 'pomosht1', adminRole: 'support' }); }"]))
        await a.wait_for_timeout(1000)
        cb, a2, eb = await device(b, 1280)
        await a2.goto(base + '/admin'); await a2.wait_for_timeout(400)
        r = await a2.evaluate(S.join(["async () => {", "const r = await s.adminLogin('pomosht@mail.bg', 'pomosht1'); return r.error || s.adminRole(); }"]))
        check(r == 'support', 'Нов админ, създаден от панела, може да влезе', r)
        # изтриване на акаунт
        r = await d2.evaluate(S.join(["async () => {", "const r = await s.deleteMyAccount(); return r?.error || 'ok'; }"]))
        await a.evaluate(S.join(["async () => {", "await s.syncNow(); }"]))
        drivers = await a.evaluate(S.join(["async () => {", "return s.admin.drivers().map(u => u.name); }"]))
        check(r == 'ok' and drivers == ['Иван Тестов'], 'Изтрит акаунт изчезва и от админа', [r, drivers])
        # без интернет: записва се на телефона и се качва после
        await c1.set_offline(True)
        await d1.evaluate(S.join(["async () => {", "s.saveCost({ cat: 'wash', amount: 7, date: new Date().toISOString().slice(0,10), kind: 'once' }); }"]))
        await d1.wait_for_timeout(800)
        await c1.set_offline(False)
        await d1.evaluate("() => window.dispatchEvent(new Event('online'))"); await d1.wait_for_timeout(1500)
        await a.evaluate(S.join(["async () => {", "await s.syncNow(); }"]))
        d = await a.evaluate(S.join(["async () => {", f"return s.admin.driverData('{id1}').costs.map(c => c.amount); }}"]))
        check(7 in d, 'Без интернет: разходът се качва, щом връзката се върне', d)
        check(not (e1 + e2 + e3 + ea + eb), 'Без грешки в JS', e1 + e2 + e3 + ea + eb)
        await b.close()
    print(f'FAILS: {len(fails)} / {total}')
    sys.exit(1 if fails else 0)
asyncio.run(main())
