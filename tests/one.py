# Изданието One Taxi (/onetaxi): марка, вход само за One, регистрация с код
import asyncio, sys
from playwright.async_api import async_playwright
R = []
def ok(name, cond, info=''):
    R.append(('PASS  ' if cond else 'FAIL  ') + name + (f'  [{info}]' if info != '' else ''))
async def main():
    base = 'http://localhost:8765'
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844}); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(base + '/onetaxi'); await pg.evaluate('localStorage.clear()'); await pg.goto(base + '/onetaxi#/login'); await pg.wait_for_timeout(600)
        ok('/onetaxi е изданието One', await pg.evaluate("document.documentElement.dataset.brand") == 'one')
        ok('Логото One × ProfiTaxi на входа', await pg.locator('.collab img[src="/icons/one-red.svg"]').count() == 1)
        ok('Червеният бутон', 'rgb(237, 29, 36)' in await pg.evaluate("getComputedStyle(document.querySelector('.btn-primary')).backgroundColor"))
        ok('Иконата е на One', 'one-' in await pg.evaluate("document.querySelector('link[rel=apple-touch-icon]').href"))
        await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(400)
        ok('Шофьор от друга фирма не влиза', 'само за шофьорите на One' in await pg.inner_text('.err') and '#/login' in pg.url)
        await pg.fill('input[type=email]', 'one@demo.bg'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
        ok('Шофьор на One влиза', '#/home' in pg.url, pg.url)
        ok('Логото One на началния екран', await pg.locator('.one-mini').count() == 1)
        await pg.wait_for_timeout(700); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        if await pg.locator('.tour').count(): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.evaluate("localStorage.removeItem('profitaxi.session')"); await pg.goto(base + '/onetaxi#/register'); await pg.wait_for_timeout(500)
        ok('Регистрацията е заключена за One Taxi, Пловдив', await pg.locator('.one-locked').count() == 1 and await pg.locator('select').count() == 0)
        await pg.fill('input[autocomplete=name]', 'Тест One'); await pg.fill('input[type=email]', 'test.one@test.bg'); await pg.fill('input[type=password]', '123456')
        await pg.fill('input[placeholder="Кодът от One Taxi"]', 'GRESHEN'); await pg.click('.option >> nth=0'); await pg.click('input[type=checkbox]'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(300)
        ok('Грешен код се отказва', 'Невалиден код' in await pg.inner_text('.err'))
        await pg.fill('input[placeholder="Кодът от One Taxi"]', 'one2026'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        comp = await pg.evaluate("(()=>{const db=JSON.parse(localStorage.getItem('profitaxi.v5'));const u=db.users.find(x=>x.email==='test.one@test.bg');return u&&u.city+'|'+u.company})()")
        ok('С код се създава акаунт в One Taxi, Пловдив', comp == 'Пловдив|ONE Такси – 032 22 22', comp)
        # чужд акаунт, вече влязъл в /app, не вижда /onetaxi
        await pg.goto(base + '/app#/login'); await pg.evaluate("localStorage.removeItem('profitaxi.session')"); await pg.goto(base + '/app#/login'); await pg.wait_for_timeout(400)
        await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
        await pg.goto(base + '/onetaxi#/home'); await pg.wait_for_timeout(600)
        ok('Влязъл шофьор от друга фирма вижда „Само за шофьорите на One Taxi“', 'Само за шофьорите на One Taxi' in await pg.inner_text('#app'))
        ok('Без грешки', not errs, errs[:2])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(r.startswith('FAIL') for r in R)} / {len(R)}")
asyncio.run(main())
