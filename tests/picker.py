# Календар и часовник вместо системните полета за дата и час
import asyncio, sys, math
from playwright.async_api import async_playwright
B = 'http://localhost:8765'
fails = []
def ok(n, c, x=''):
    print(('PASS ' if c else 'FAIL ') + n + (f'  [{x}]' if x != '' else ''))
    if not c: fails.append(n)
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(); c = await b.new_context(viewport={'width': 390, 'height': 844})
    await c.add_init_script("try{localStorage.setItem('profitaxi.tour','done');localStorage.setItem('profitaxi.installed','1');localStorage.setItem('profitaxi.paidMode','1')}catch(e){}")
    pg = await c.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(300)
    await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
    await pg.goto(B + '/app#/shift/new'); await pg.wait_for_timeout(600)
    await pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(e=>e.remove())")
    ok('Системните полета са скрити, вместо тях има бутони', await pg.locator('input[type=datetime-local]:visible').count() == 0 and await pg.locator('.pk-field').count() == 2)
    await pg.locator('.pk-field').first.click(); await pg.wait_for_timeout(300)
    ok('Отваря се календар с ден от седмицата и дата', await pg.locator('.pk-grid .pk-day').count() >= 28 and ',' in await pg.locator('.pk-big').inner_text())
    ok('Заглавието е името на полето', 'Тръгване' in await pg.locator('.pk-title').inner_text(), await pg.locator('.pk-title').inner_text())
    await pg.click('.pk-my'); await pg.wait_for_timeout(150)
    ok('Натискане на месеца показва 12-те месеца', await pg.locator('.pk-mon').count() == 12)
    await pg.click('.pk-mon >> nth=0'); await pg.wait_for_timeout(150)
    ok('Избор на месец връща към дните', 'януари' in await pg.locator('.pk-my').inner_text())
    await pg.click('.pk-day:text-is("5")'); await pg.click('.pk-ok'); await pg.wait_for_timeout(200)
    ok('След датата идва часовник', await pg.locator('.pk-dial').count() == 1 and await pg.locator('.pk-num').count() == 24)
    d = pg.locator('.pk-dial'); bb = await d.bounding_box(); cx, cy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
    r = bb['width'] / 2 * 74 / 140; a = 2 / 12 * 2 * math.pi
    await pg.mouse.click(cx + r * math.sin(a), cy - r * math.cos(a)); await pg.wait_for_timeout(350)
    ok('Вътрешният кръг дава 14 ч и минава към минутите', (await pg.locator('.pk-tbox >> nth=0').inner_text()) == '14' and await pg.locator('.pk-num').count() == 12)
    R = bb['width'] / 2 * 112 / 140; a = 45 / 60 * 2 * math.pi
    await pg.mouse.click(cx + R * math.sin(a), cy - R * math.cos(a)); await pg.wait_for_timeout(150)
    await pg.click('.pk-ok'); await pg.wait_for_timeout(300)
    v = await pg.evaluate("document.querySelectorAll('input[type=datetime-local]')[0].value")
    ok('Стойността стига до смяната (5 януари, 14:45)', v.endswith('-01-05T14:45'), v)
    ok('Бутонът показва новата дата и час', '14:45' in await pg.locator('.pk-field').first.inner_text())
    await pg.locator('.pk-field >> nth=1').click(); await pg.wait_for_timeout(200)
    await pg.click('.pk-ok'); await pg.wait_for_timeout(200); await pg.click('.pk-icon'); await pg.wait_for_timeout(200)
    await pg.fill('.pk-tin >> nth=0', '7'); await pg.fill('.pk-tin >> nth=1', '05'); await pg.click('.pk-ok'); await pg.wait_for_timeout(300)
    v = await pg.evaluate("document.querySelectorAll('input[type=datetime-local]')[1].value")
    ok('Часът се въвежда и с цифри (07:05)', v.endswith('T07:05'), v)
    await pg.locator('.pk-field >> nth=1').click(); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
    ok('Отказ / Escape затваря без промяна', await pg.locator('.pk-wrap').count() == 0 and v == await pg.evaluate("document.querySelectorAll('input[type=datetime-local]')[1].value"))
    # Резервация: отделни дата и час
    await pg.goto(B + '/app#/reservations'); await pg.wait_for_timeout(500)
    await pg.click('.hero .icon-btn, .hero-btn'); await pg.wait_for_timeout(400)
    ok('Резервацията има бутони за дата и час', await pg.locator('.sheet .pk-field').count() >= 2)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
    # Статистика: период с ограничение
    await pg.goto(B + '/app#/stats'); await pg.wait_for_timeout(400); await pg.click('.seg-btn:has-text("Период")'); await pg.wait_for_timeout(300)
    await pg.locator('.pk-field >> nth=0').click(); await pg.wait_for_timeout(200)
    await pg.click('.pk-arrow >> nth=1'); await pg.wait_for_timeout(150)
    ok('Дни след „До“ са забранени в „От“', await pg.locator('.pk-day:disabled').count() > 0)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
    # Админ
    await pg.evaluate("localStorage.setItem('profitaxi.asession','admin')")
    await pg.goto(B + '/admin.html#/settings'); await pg.wait_for_timeout(800)
    ok('И в админа датите са с календар', await pg.locator('.pk-field').count() >= 1 and await pg.locator('input[type=date]:visible').count() == 0)
    ok('Без грешки в JS', not errs, errs[:2])
    print(f'FAILS: {len(fails)} / 15'); await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())
