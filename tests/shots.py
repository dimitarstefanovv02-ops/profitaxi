# Снимки на приложението за сайта (демо шофьор, 24 октомври 2026, 18:30)
import asyncio, datetime
from playwright.async_api import async_playwright
SHOTS = [('home', '#/home', None), ('shifts', '#/shifts', None), ('stats', '#/stats', None), ('costs', '#/costs', None),
         ('profile', '#/profile', None), ('reservations', '#/reservations', None),
         ('time', '#/stats', 'time'), ('numpad', '#/shift/new', 'numpad'), ('records', '#/stats', 'records')]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for theme in ('light', 'dark'):
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, color_scheme=theme, permissions=['notifications'])
            pg = await ctx.new_page()
            await pg.clock.install(time=datetime.datetime(2026, 10, 24, 18, 30))
            await pg.goto('http://localhost:8765/app'); await pg.evaluate('localStorage.clear()'); await pg.goto('http://localhost:8765/app')
            await pg.evaluate("localStorage.setItem('profitaxi.dueShown', '2026-10-24')")
            await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
            await pg.goto('http://localhost:8765/app#/costs'); await pg.wait_for_timeout(600)
            if await pg.locator('.notify-box .btn').count(): await pg.click('.notify-box .btn'); await pg.wait_for_timeout(500)
            await pg.evaluate("localStorage.setItem('profitaxi.notified', JSON.stringify([]))")
            for name, route, mode in SHOTS:
                await pg.goto('http://localhost:8765/app' + route); await pg.wait_for_timeout(900)
                if mode == 'time':
                    await pg.evaluate("window.scrollTo(0, document.querySelector('.wd-bars').closest('.card').offsetTop - 16)")
                if mode == 'records':
                    await pg.evaluate("window.scrollTo(0, document.querySelector('.rec').closest('.card').offsetTop - 16)")
                if mode == 'numpad':
                    await pg.click('[data-sec=inc] .f-row >> nth=0'); await pg.keyboard.type('148'); await pg.wait_for_timeout(400)
                await pg.wait_for_timeout(300)
                await pg.screenshot(path=f'img/screen-{name}-{theme}.jpg', type='jpeg', quality=80)
                if mode == 'numpad': await pg.keyboard.press('Escape')
            await ctx.close()
        await b.close()
asyncio.run(main())
