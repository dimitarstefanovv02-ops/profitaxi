# Обща кола през общата база (сървърът): права и видимост. Сървър: node tools/dev.mjs 8766
import asyncio
from playwright.async_api import async_playwright
base = 'http://localhost:8766'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
INIT = "try{localStorage.setItem('profitaxi.live','1');sessionStorage.setItem('profitaxi.oneIntro','1')}catch(e){}"
S = "const s = await import('/js/store.js');"

async def device(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.set_default_timeout(10000)
    return pg, errs

async def register(pg, name, email, phone):
    await pg.goto(base + '/app#/register'); await pg.wait_for_timeout(500)
    return await pg.evaluate(S.join(["async () => {", f"""
      const c = s.sendSmsCode('{phone}'); s.verifySmsCode('{phone}', c.demoCode);
      const r = await s.register({{ name: '{name}', email: '{email}', password: 'parola1', phone: '{phone}', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'own' }});
      if (r.error) return r.error; s.updateProfile({{ onboarded: true }}); return r.user.id; }}"""]))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        a, ea = await device(b); g, eg = await device(b)
        aid = await register(a, 'Собственик Колев', 'own1@t.bg', '0888100001')
        gid = await register(g, 'Шофьор Генов', 'drv1@t.bg', '0888100002')
        ok('Двама регистрирани', len(aid) > 5 and len(gid) > 5, (aid, gid))
        # Шофьорът записва смяна с приход
        await g.evaluate(S.join(["async () => {", "const sh = s.startShift(1000); sh.kmEnd = 1180; sh.income.cash = 150; sh.end = new Date().toISOString(); s.saveShift(sh); await s.syncNow(); }"]))
        # Собственикът – кола под наем + разход по колата
        car = await a.evaluate(S.join(["async () => {", "const c = s.createCar({ type: 'rent', name: 'Skoda', plate: 'PB1' }); s.saveCost({ carId: c.id, name: 'ГО', category: 'insurance', amount: 300, period: 'year', startDate: '2026-01-01' }); await s.syncNow(); await s.syncNow(); return c; }"]))
        ok('Колата е в облака', bool(car and car.get('invite')))
        r = await g.evaluate(S.join(["async () => {", f"return await s.joinCar('{car['invite']}'); }}"]))
        ok('Шофьорът се присъединява с кода', r.get('ok') and r.get('carId') == car['id'], r)
        gv = await g.evaluate(S.join(["async () => {", f"await s.syncNow(); const c = s.myCars()[0]; return {{ invite: c && c.invite, costs: s.myData().costs.filter(x => x.carId).map(x => x.name) }}; }}"]))
        ok('Шофьорът не вижда кода за покана', not gv['invite'], gv['invite'])
        ok('При кола под наем шофьорът не вижда застраховката на собственика', gv['costs'] == [], gv['costs'])
        # Собственикът задава наем; вижда смените без пари
        await a.evaluate(S.join(["async () => {", f"await s.syncNow(); s.setMemberRent('{car['id']}', '{gid}', {{ amount: 140, period: 'week', from: '2026-10-01' }}); await s.syncNow(); }}"]))
        av = await a.evaluate(S.join(["async () => {", f"await s.syncNow(); const d = s.carDrivers('{car['id']}', '2026-01-01', '2030-01-01')[0]; const raw = (await import('/js/store.js')); return {{ d, sh: JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('profitaxi.live.app') && !k.endsWith('.base')))).shifts.filter(x => x.userId === '{gid}') }}; }}"]))
        ok('Собственикът вижда км на шофьора (180)', av['d']['km'] == 180 and av['d']['shifts'] == 1, (av['d']['km'], av['d']['shifts']))
        ok('Смените на шофьора стигат до собственика без пари', len(av['sh']) == 1 and 'income' not in av['sh'][0] and 'expenses' not in av['sh'][0], list(av['sh'][0].keys()) if av['sh'] else None)
        rent = await g.evaluate(S.join(["async () => {", "await s.syncNow(); const c = s.myData().costs.find(x => x.system === 'carrent'); return c && [c.amount, c.period]; }"]))
        ok('Шофьорът получава наема 140 €/седм.', rent == [140, 'week'], rent)
        # Шофьорът не може да промени колата
        bad = await g.evaluate(S.join(["async () => {", f"const st = await import('/js/sync.js'); const r = await st.call('push', {{ set: {{ 'cars:{car['id']}': {{ id: '{car['id']}', ownerId: '{gid}', type: 'rent', members: [] }} }}, del: [] }}); return r; }}"]))
        ok('Шофьорът не може да си присвои колата', 'cars:' + car['id'] in (bad.get('rejected') or []), bad)
        # Дневник на колата: „Платих“ от шофьора, потвърждение от собственика, глоба само от собственика
        pr = await g.evaluate(S.join(["async () => {", f"const l = s.addCarLog({{ carId: '{car['id']}', kind: 'pay', amount: 140 }}); await s.syncNow(); return l.id; }}"]))
        badf = await g.evaluate(S.join(["async () => {", f"const st = await import('/js/sync.js'); return await st.call('push', {{ set: {{ 'carlog:x1': {{ id: 'x1', carId: '{car['id']}', kind: 'fine', by: '{gid}', driverId: '{gid}', amount: -500 }} }}, del: [] }}); }}"]))
        ok('Шофьорът не може да си пише глоба/запис от името на собственика', 'carlog:x1' in (badf.get('rejected') or []), badf)
        fake = await g.evaluate(S.join(["async () => {", f"const st = await import('/js/sync.js'); return await st.call('push', {{ set: {{ 'carlog:x2': {{ id: 'x2', carId: '{car['id']}', kind: 'pay', by: '{gid}', driverId: '{gid}', amount: 140, status: 'ok' }} }}, del: [] }}); }}"]))
        st2 = await a.evaluate(S.join(["async () => {", "await s.syncNow(); return s.carLogs('" + car['id'] + "').filter((l) => l.kind === 'pay').map((l) => [l.id, l.status]); }"]))
        ok('Собственикът вижда „Платих“ (сам потвърдено не става)', sorted(x[1] for x in st2) == ['claimed', 'claimed'], st2)
        await a.evaluate(S.join(["async () => {", f"s.confirmPay('{pr}'); s.addCarLog({{ carId: '{car['id']}', kind: 'fine', driverId: '{gid}', amount: 50, text: 'скорост' }}); await s.syncNow(); }}"]))
        gl = await g.evaluate(S.join(["async () => {", "await s.syncNow(); return { pay: s.myLogs('pay').map((l) => l.status).sort(), fine: s.myData().costs.filter((c) => c.category === 'fine').map((c) => c.amount) }; }"]))
        ok('При шофьора: потвърдено + глобата е в разходите му', gl['pay'] == ['claimed', 'ok'] and gl['fine'] == [50], gl)
        at = await g.evaluate(S.join(["async () => {", f"const st = await import('/js/sync.js'); const p = s.getProfile(); await st.call('push', {{ set: {{ 'profiles:{gid}': {{ ...p, accountType: 'fleet' }} }}, del: [] }}); localStorage.removeItem(Object.keys(localStorage).find((k) => k.endsWith('.base')) || 'x'); await s.syncNow(); return (await st.call('pull', {{}})).fields['profiles:{gid}'].accountType || 'driver'; }}"]))
        ok('Шофьорът не може сам да си смени вида на акаунта', at == 'driver', at)
        ok('Без грешки', not ea and not eg, (ea + eg)[:2])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
asyncio.run(main())
