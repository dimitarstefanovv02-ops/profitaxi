# Два акаунта на един телефон (шофьор + собственик): остават влезли, смяна с едно натискане, „Изход“ минава на другия.
import asyncio, sys
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
LIVE = len(sys.argv) > 2 and sys.argv[2] == 'live'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}); errs = []; pg.set_default_timeout(8000)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '/app'); await pg.evaluate(f"localStorage.clear(); localStorage.setItem('profitaxi.installed','1'); localStorage.setItem('profitaxi.fwalk','1'); {'localStorage.setItem(`profitaxi.live`,`1`);' if LIVE else ''}")
        await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(500)
        ok('Без влезли акаунти – обикновен вход', await pg.locator('.acct-saved').count() == 0)
        # 1) шофьор
        reg = lambda name, email, phone, kind: f"""async () => {{ const s = await import('/js/store.js'); const c = await s.sendSmsCode('{phone}'); if (c && c.demoCode) await s.verifySmsCode('{phone}', c.demoCode);
          const r = await s.register({{ name: '{name}', email: '{email}', password: 'parola1', phone: '{phone}', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'rent', accountType: '{kind}' }}); return r.error || null; }}"""
        e = await pg.evaluate(reg('Иво Шофьоров', 'ivo.drv@t.bg', '0888700001', 'driver'))
        ok('Регистрация шофьор', e is None, e)
        await pg.evaluate("async () => { const s = await import('/js/store.js'); s.updateProfile({ onboarded: true, tour: 'done' }); }")
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(900)
        await pg.evaluate("async () => { const s = await import('/js/store.js'); const st = s.startShift(100000); s.saveShift({ ...st, note: 'смяна-на-иво' }); }")
        # 2) „Добави акаунт“ от Профил
        await pg.goto(B + '/app#/me'); await pg.wait_for_timeout(700)
        ok('Профил: ред „Добави акаунт“', await pg.locator('.big-link:has-text("Добави акаунт")').count() == 1)
        await pg.click('.big-link:has-text("Добави акаунт")'); await pg.wait_for_timeout(300)
        await pg.click('.acct-row.add'); await pg.wait_for_timeout(900)
        ok('Отваря входа с влезлия акаунт отгоре', 'login' in pg.url and await pg.locator('.acct-saved .acct-row:has-text("Иво Шофьоров")').count() == 1, pg.url)
        await pg.goto(B + '/app#/register'); await pg.wait_for_timeout(500)
        e = await pg.evaluate(reg('Петко Собственик', 'petko.own@t.bg', '0888700002', 'fleet'))
        ok('Регистрация собственик (вторият акаунт)', e is None, e)
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(1000)
        ok('Собственикът вижда „Автопарк“ и зелената иконка', await pg.locator('h1:has-text("Автопарк")').count() == 1 and await pg.evaluate("document.documentElement.dataset.appIcon") == 'fleet')
        # 3) смяна с едно натискане
        await pg.goto(B + '/app#/me'); await pg.wait_for_timeout(700)
        ok('Профил: „Смени акаунт“ с името на другия', 'Иво · шофьор' in await pg.locator('.big-link:has-text("Смени акаунт")').inner_text())
        await pg.click('.big-link:has-text("Смени акаунт")'); await pg.wait_for_timeout(300)
        n = await pg.locator('.sheet .acct-row:not(.add)').count()
        ok('Листът показва и двата акаунта с иконките им', n == 2 and await pg.locator('.sheet .acct-row img[src="/icons/fleet-192.png"]').count() == 1, n)
        await pg.click('.sheet .acct-row:has-text("Иво Шофьоров")'); await pg.wait_for_timeout(1500)
        u = await pg.evaluate("async () => { const s = await import('/js/store.js'); return [s.currentUser()?.name, s.myData().shifts.some((x) => x.note === 'смяна-на-иво')]; }")
        ok('Смяна към шофьора без парола – данните му са там', u == ['Иво Шофьоров', True], u)
        ok('Шофьорът е на „Днес“ с тъмната иконка', await pg.evaluate("document.documentElement.dataset.appIcon") == 'driver' and await pg.locator('.nav').count() == 1)
        await pg.goto(B + '/app#/me'); await pg.wait_for_timeout(600)
        await pg.click('.big-link:has-text("Смени акаунт")'); await pg.wait_for_timeout(300)
        await pg.click('.sheet .acct-row:has-text("Петко Собственик")'); await pg.wait_for_timeout(1500)
        u = await pg.evaluate("async () => { const s = await import('/js/store.js'); return [s.currentUser()?.name, s.myData().shifts.length]; }")
        ok('Обратно към собственика – без смените на шофьора', u[0] == 'Петко Собственик' and u[1] == 0, u)
        # 4) известие за другия акаунт (?as=)
        did = await pg.evaluate("async () => { const s = await import('/js/store.js'); return s.savedAccounts().find((a) => !a.fleet).id; }")
        await pg.goto(B + f'/app#/home?as={did}'); await pg.wait_for_timeout(1500)
        u = await pg.evaluate("async () => { const s = await import('/js/store.js'); return s.currentUser()?.name; }")
        ok('Известие за шофьорския акаунт (?as=) минава на него', u == 'Иво Шофьоров' and 'as=' not in pg.url, [u, pg.url])
        # 5) „Изход“ минава на другия акаунт; после остава само един
        await pg.goto(B + '/app#/settings'); await pg.wait_for_timeout(600)
        await pg.click('text=Изход'); await pg.wait_for_timeout(1500)
        u = await pg.evaluate("async () => { const s = await import('/js/store.js'); return [s.currentUser()?.name, s.savedAccounts().map((a) => a.name)]; }")
        ok('„Изход“ от шофьора → минава на собственика', u == ['Петко Собственик', ['Петко Собственик']], u)
        await pg.goto(B + '/app#/settings'); await pg.wait_for_timeout(600)
        await pg.click('text=Изход'); await pg.wait_for_timeout(900)
        ok('Последният „Изход“ → входът, без запомнени акаунти', 'login' in pg.url and await pg.locator('.acct-saved').count() == 0, pg.url)
        # 6) влизане отново като шофьор
        await pg.fill('input[autocomplete=username]', 'ivo.drv@t.bg'); await pg.fill('input[type=password]', 'parola1'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Вход с парола работи както преди', await pg.evaluate("async () => { const s = await import('/js/store.js'); return s.currentUser()?.name; }") == 'Иво Шофьоров')
        ok('Без хоризонтално превъртане', await pg.evaluate("document.documentElement.scrollWidth") <= 390)
        ok('Без грешки в JS', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print('FAILS:', sum(1 for r in R if r.startswith('FAIL')), '/', len(R))
asyncio.run(main())
