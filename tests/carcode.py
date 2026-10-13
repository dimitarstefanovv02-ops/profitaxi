# Регистрация с код за кола – и когато кодът е сложен по грешка в „Промо код“
import asyncio
from playwright.async_api import async_playwright
B = 'http://localhost:8765'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}); pg.set_default_timeout(8000); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '/app'); await pg.evaluate('localStorage.clear()'); await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(600)
        await pg.fill('input[autocomplete=username], input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        car = await pg.evaluate("async () => { const s = await import('/js/store.js'); const c = s.createCar({ type: 'rent', name: 'Toyota Corolla', plate: 'PB1829AE' }); s.logout(); return c; }")
        await pg.goto(B + '/app#/register'); await pg.wait_for_timeout(500)
        await pg.fill('input[autocomplete=name]', 'Нов Шофьор'); await pg.fill('input[autocomplete=username], input[type=email]', 'nov@test.bg'); await pg.fill('input[type=password]', '123456')
        await pg.fill('input[type=tel]', '0877555666')
        await pg.fill('input[placeholder="напр. START2"]', car['invite'])  # кодът – по грешка в промо кода
        await pg.select_option('select >> nth=0', 'Пловдив'); await pg.wait_for_timeout(150); await pg.select_option('select >> nth=1', index=1)
        await pg.click('button.option:has-text("Под наем")')
        if await pg.locator('button:has-text("Изпрати код")').count():
            await pg.click('button:has-text("Изпрати код")'); await pg.wait_for_timeout(300)
            code = await pg.evaluate("async()=>{const s=await import('/js/store.js'); return s.sendSmsCode('0877555666').demoCode}")
            await pg.fill('input[inputmode=numeric]', code); await pg.click('button:has-text("Потвърди")'); await pg.wait_for_timeout(300)
        await pg.click('input[type=checkbox]'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
        ok('Без грешка „Няма такъв промо код“', 'промо' not in (await pg.locator('.err').all_inner_texts() or [''])[0].lower() if await pg.locator('.err').count() else True)
        print('after reg', pg.url, await pg.evaluate("localStorage.getItem('profitaxi.joinCode')"), car['invite'])
        # първа настройка → Започни
        for _ in range(6):
            if await pg.locator('text=Напред').count(): await pg.click('text=Напред'); await pg.wait_for_timeout(250)
        if await pg.locator('text=Започни').count(): await pg.click('text=Започни'); await pg.wait_for_timeout(1500)
        ok('След първата настройка шофьорът е в колата', '/cars/' + car['id'] in pg.url, pg.url)
        mem = await pg.evaluate(f"async () => {{ const s = await import('/js/store.js'); return s.myCars().map(c => c.id); }}")
        ok('Колата е в неговия списък', car['id'] in mem, mem)
        ok('Без грешки', not errs, errs[:2])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
asyncio.run(main())
