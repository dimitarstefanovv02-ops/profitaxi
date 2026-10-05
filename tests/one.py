# Изданието One Taxi (/onetaxi): марка, вход само за One, регистрация с код
import asyncio, sys
from playwright.async_api import async_playwright
R = []
def ok(name, cond, info=''):
    R.append(('PASS  ' if cond else 'FAIL  ') + name + (f'  [{info}]' if info != '' else ''))
async def main():
    base = 'http://localhost:8765'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # Въвеждащият ефект „сливане“ се показва при първо отваряне и изчезва сам
        c0 = await b.new_context(viewport={'width': 390, 'height': 844}); p0 = await c0.new_page()
        await p0.goto(base + '/app/onetaxi#/login'); await p0.wait_for_timeout(500)
        ok('Ефектът One × ProfiTaxi се показва при отваряне', await p0.locator('#one-intro').count() == 1)
        await p0.wait_for_timeout(6400)
        ok('Ефектът изчезва сам', await p0.locator('#one-intro').count() == 0)
        await p0.reload(); await p0.wait_for_timeout(400)
        ok('Ефектът не се повтаря в същото посещение', await p0.locator('#one-intro').count() == 0)
        await c0.close()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.add_init_script("try { sessionStorage.setItem('profitaxi.oneIntro', '1') } catch (e) {}"); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(base + '/app/onetaxi'); await pg.evaluate('localStorage.clear()'); await pg.goto(base + '/app/onetaxi#/login'); await pg.wait_for_timeout(600)
        ok('/app/onetaxi е изданието One', await pg.evaluate("document.documentElement.dataset.brand") == 'one')
        ok('Логото One × ProfiTaxi на входа', await pg.locator('.collab img[src="/icons/one-lockup.svg"]').count() == 1)
        ok('Червеният бутон', 'rgb(237, 29, 36)' in await pg.evaluate("getComputedStyle(document.querySelector('.btn-primary')).backgroundColor"))
        ok('Иконата е на One', 'one-' in await pg.evaluate("document.querySelector('link[rel=apple-touch-icon]').href"))
        await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(400)
        ok('Шофьор от друга фирма не влиза', 'само за шофьорите на One' in await pg.inner_text('.err') and '#/login' in pg.url)
        await pg.fill('input[type=email]', 'one@demo.bg'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
        ok('Шофьор на One влиза', '#/home' in pg.url, pg.url)
        ok('Лентата One × ProfiTaxi е горе', await pg.locator('.collab-bar').count() == 1)
        for r in ['money', 'me', 'profile', 'car']:
            await pg.goto(base + '/app/onetaxi#/' + r); await pg.wait_for_timeout(300)
            if await pg.locator('.collab-bar').count() != 1: ok(f'Лента One × ProfiTaxi на {r}', False)
        ok('Лентата One × ProfiTaxi е на всяка страница', not any('Лента One' in r for r in R))
        await pg.goto(base + '/app/onetaxi#/home'); await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(700); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        if await pg.locator('.tour').count(): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.evaluate("localStorage.removeItem('profitaxi.session')"); await pg.goto(base + '/app/onetaxi#/register'); await pg.wait_for_timeout(500)
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
        await pg.goto(base + '/app/onetaxi#/home'); await pg.wait_for_timeout(600)
        ok('Влязъл шофьор от друга фирма вижда „Само за шофьорите на One Taxi“', 'Само за шофьорите на One Taxi' in await pg.inner_text('#app'))
        ok('Без грешки', not errs, errs[:2])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(r.startswith('FAIL') for r in R)} / {len(R)}")
asyncio.run(main())
