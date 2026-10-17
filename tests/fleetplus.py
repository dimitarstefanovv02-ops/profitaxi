# Собственик: цел и прогноза за месеца, обслужване по км, договор, Excel за счетоводителя, обява; иконката на приложението.
import asyncio
from playwright.async_api import async_playwright
B = 'http://localhost:8765'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
J = "const s = await import('/js/store.js'); const u = await import('/js/util.js'); const t = u.todayStr();"

async def login(pg, email, pw='demo123'):
    await pg.evaluate("async () => { const s = await import('/js/store.js'); s.logout(); }")
    await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(400)
    await pg.fill('input[autocomplete=username], input[type=email]', email); await pg.fill('input[type=password]', pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []; pg.set_default_timeout(8000)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # иконките при регистрация
        await pg.goto(B + '/app'); await pg.evaluate("localStorage.clear(); localStorage.setItem('profitaxi.fwalk','1'); localStorage.setItem('profitaxi.installed','1')"); await pg.goto(B + '/avtopark#/register'); await pg.wait_for_timeout(600)
        srcs = await pg.eval_on_selector_all('.acct-opt img', 'e => e.map(x => x.getAttribute("src"))')
        ok('Регистрация: двете иконки на приложението', srcs == ['/icons/icon-192.png', '/icons/fleet-192.png'], srcs)
        await pg.click('button.option:has-text("Собственик на коли")'); await pg.wait_for_timeout(150)
        man = await pg.evaluate("[document.querySelector('link[rel=manifest]').getAttribute('href'), document.querySelector('link[rel=apple-touch-icon]').getAttribute('href')]")
        ok('Избран собственик → иконата и манифестът на собственика', man == ['/manifest-fleet.webmanifest', '/icons/fleet-touch-icon.png'], man)
        ok('„Къде са колите“ вместо „Къде караш“', await pg.locator('h3:has-text("Къде са колите")').count() == 1)
        await pg.click('button.option:has-text("Шофьор")'); await pg.wait_for_timeout(150)
        ok('Обратно шофьор → обикновената иконка', await pg.evaluate("document.querySelector('link[rel=manifest]').getAttribute('href')") == '/manifest.webmanifest')
        r = await pg.evaluate("fetch('/manifest-fleet.webmanifest').then(r => r.json()).then(j => [j.short_name, j.icons.length])")
        ok('Манифест на собственика', r == ['Чисто Автопарк', 3], r)
        # собственик с кола и шофьор
        await pg.goto(B + '/avtopark#/login'); await pg.wait_for_timeout(300)
        car = await pg.evaluate(f"""async () => {{ {J}
          const c = s.sendSmsCode('0888111222'); s.verifySmsCode('0888111222', c.demoCode);
          const r = await s.register({{ name: 'Петко Колев', email: 'petko@fleet.bg', password: 'parola1', phone: '0888111222', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'own', accountType: 'fleet' }});
          if (r.error) throw new Error(r.error);
          const a = s.createCar({{ type: 'rent', name: 'Skoda Octavia', plate: 'РВ1234АК' }});
          s.saveCost({{ carId: a.id, name: 'Каско', category: 'casco', amount: 900, period: 'year', startDate: u.addDays(t, -200) }});
          const b2 = s.createCar({{ type: 'rent', name: 'Dacia Logan', plate: 'РВ3456МК' }});
          return [a, b2]; }}""")
        a, free = car
        await pg.evaluate("localStorage.setItem('profitaxi.fwalk','1')")
        ok('Влязъл собственик → иконата на собственика', await pg.evaluate("document.documentElement.dataset.appIcon") == 'fleet')
        await login(pg, 'georgi@demo.bg'); await pg.goto(B + '/app#/join/' + a['invite']); await pg.wait_for_timeout(800)
        gid = await pg.evaluate(f"async () => {{ {J} return s.currentUser().id; }}")
        ok('Шофьор → обикновената иконка', await pg.evaluate("document.documentElement.dataset.appIcon") == 'driver')
        await pg.evaluate(f"""async () => {{ {J}
          const sh = s.myData().shifts.filter((x) => x.start.slice(0, 10) >= u.addDays(t, -20)); sh.forEach((x) => s.deleteShift(x.id));
          const st = new Date(u.addDays(t, -1) + 'T08:00:00'); s.saveShift({{ start: st.toISOString(), end: new Date(st.getTime() + 9 * 36e5).toISOString(), kmStart: 120000, kmEnd: 129400, income: {{ cash: 100, card: 20, app: 0, tips: 0 }}, expenses: [], note: '', carId: '{a['id']}' }}); }}""")
        await login(pg, 'petko@fleet.bg', 'parola1')
        await pg.evaluate(f"""async () => {{ {J} s.setMemberRent('{a['id']}', '{gid}', {{ amount: 140, period: 'week', from: u.addDays(t, -14) }}); s.setHandover('{a['id']}', '{gid}', 120000, u.addDays(t, -14));
          s.addCarLog({{ carId: '{a['id']}', kind: 'pay', driverId: '{gid}', amount: 140, date: u.addDays(t, -14) }}); s.addCarLog({{ carId: '{a['id']}', kind: 'deposit', driverId: '{gid}', amount: 300, date: u.addDays(t, -14) }});
          s.updateCar('{a['id']}', {{ serviceEvery: 10000, serviceAtKm: 120000 }}); }}""")
        await pg.goto(B + '/avtopark#/home'); await pg.wait_for_timeout(900)
        # 1) цел
        await pg.click('.fs-goal-btn'); await pg.wait_for_timeout(300)
        for k in '500': await pg.click(f'.np-key[aria-label="{k}"]')
        await pg.click('.np-actions .btn-primary'); await pg.wait_for_timeout(500)
        ok('Цел за месеца: запазена и показана', await pg.evaluate(f"async () => {{ {J} return s.getProfile().fleetGoal; }}") == 500 and await pg.locator('.fs-bar').count() == 1, await pg.locator('.fs-goal-btn').inner_text())
        ok('Цел: „до целта“ в картата', 'до целта' in await pg.locator('.fs-lines').inner_text() or 'постигната' in await pg.locator('.fs-lines').inner_text(), await pg.locator('.fs-lines').inner_text())
        # 2) прогноза
        fc = await pg.locator('.fs-lines').inner_text()
        ok('Прогноза до края на месеца', 'Очаквано до' in fc or await pg.evaluate("new Date().getDate() === new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate()"), fc)
        # 3) обслужване по км: 129 400 от 130 000 → в „Днес“
        td = await pg.locator('.today-strip').inner_text()
        ok('Обслужване по км излиза в „Днес“ (след 600 км)', 'обслужване след 600 км' in td, td[:200])
        await pg.goto(B + '/avtopark#/cars/' + a['id']); await pg.wait_for_timeout(800)
        await pg.evaluate("document.querySelector('.acc-dl').open = true")
        ok('Обслужване в „Срокове“ на колата', 'след 600 км' in await pg.locator('.svc-row').inner_text())
        await pg.evaluate("document.querySelector('.acc-dl').open = true"); await pg.click('.svc-row'); await pg.wait_for_timeout(300)
        await pg.fill('.svc-done input', '120'); await pg.click('.svc-done button'); await pg.wait_for_timeout(500)
        r = await pg.evaluate(f"""async () => {{ {J} const c = s.myCars().find((x) => x.id === '{a['id']}'); return [c.serviceAtKm, s.carCosts(c.id).some((x) => x.category === 'service' && x.amount === 120)]; }}""")
        ok('„Обслужена“ → нов старт от километража и разход', r == [129400, True], r)
        # 4) договор
        await pg.click('.drv-row.tap'); await pg.wait_for_timeout(400)
        async with ctx.expect_page() as pi:
            await pg.click('.sheet button:has-text("Договор")')
        doc = await pi.value; await doc.wait_for_load_state(); txt = await doc.inner_text('body')
        ok('Договор: име, номер, наем и депозит', 'ДОГОВОР ЗА НАЕМ' in txt and 'РВ1234АК' in txt and '140' in txt and '300' in txt and 'Георги' in txt, txt[:120])
        await doc.close(); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # 5) Excel за счетоводителя
        await pg.goto(B + '/avtopark#/home'); await pg.wait_for_timeout(800)
        await pg.click('.rep-row:has-text("Excel")'); await pg.wait_for_timeout(300)
        await pg.click('.sheet .seg-btn >> nth=0')
        async with pg.expect_download() as di:
            await pg.click('.sheet button:has-text("Свали Excel")')
        d = await di.value; path = await d.path(); csv = open(path, encoding='utf-8-sig').read()
        ok('Excel: колите, наемът и разходите', 'РВ1234АК' in csv and 'Наем' in csv and 'Печалба' in csv and 'Постоянни разходи' in csv, csv[:160].replace('\n', ' | '))
        # 6) обява за свободната кола
        await pg.goto(B + '/avtopark#/cars/' + free['id']); await pg.wait_for_timeout(700)
        await pg.click('.ad-btn'); await pg.wait_for_timeout(300)
        ad = await pg.input_value('.sheet textarea')
        ok('Обява: колата, номерът и телефонът', 'Dacia Logan' in ad and 'РВ3456МК' in ad and '0888111222' in ad, ad.replace('\n', ' | '))
        await pg.keyboard.press('Escape')
        await pg.goto(B + '/avtopark#/home'); await pg.wait_for_timeout(700)
        ok('Свободна кола в „Днес“ има „Обява“', await pg.locator('.td-row:has-text("Dacia Logan") button:has-text("Обява")').count() == 1)
        h = await pg.evaluate("document.documentElement.scrollWidth")
        ok('Без хоризонтално превъртане', h <= 390, h)
        ok('Без грешки в JS', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print('FAILS:', sum(1 for r in R if r.startswith('FAIL')), '/', len(R))
asyncio.run(main())
