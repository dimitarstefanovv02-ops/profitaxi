# Ръководство и разходка за собственика: менюто, темите, снимките, последната стъпка
import asyncio
from playwright.async_api import async_playwright
B = 'http://localhost:8765'; R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}); errs = []; bad = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('response', lambda r: bad.append(r.url) if r.status >= 400 else None)
        await pg.goto(B + '/app'); await pg.evaluate('localStorage.clear()'); await pg.goto(B + '/avtopark#/login'); await pg.wait_for_timeout(500)
        await pg.evaluate("""async () => { const s = await import('/js/store.js'); const c = s.sendSmsCode('0888222333'); s.verifySmsCode('0888222333', c.demoCode);
          await s.register({ name: 'Тест Собственик', email: 'own@t.bg', password: 'parola1', phone: '0888222333', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'own', accountType: 'fleet' }); }""")
        await pg.goto(B + '/avtopark#/fguide?walk=1&first=1'); await pg.wait_for_timeout(700)
        ok('Разходката: първа стъпка със снимка', await pg.locator('.fw-body .fg-shot').count() == 1)
        n = int((await pg.locator('.fw-step').inner_text()).split(' от ')[1])
        for _ in range(n - 1): await pg.click('.fw-btns .btn-primary'); await pg.wait_for_timeout(120)
        t = await pg.locator('#app').inner_text()
        ok('Последната стъпка казва къде е ръководството', 'Профил → „Автопарк“ → „Ръководство за собственика“' in t and '9 менюта' in t, t[:120])
        await pg.click('.fw-btns .btn-primary'); await pg.wait_for_timeout(500)
        ok('„Към автопарка“ води към началния екран', '#/home' in pg.url, pg.url)
        await pg.goto(B + '/avtopark#/me'); await pg.wait_for_timeout(500)
        await pg.click('.big-link:has-text("Автопарк")'); await pg.wait_for_timeout(400); await pg.click('.sheet .big-link:has-text("Ръководство за собственика")'); await pg.wait_for_timeout(500)
        ok('Ръководството има 9 теми', await pg.locator('.fg-tile').count() == 9)
        imgs = set()
        for i in range(9):
            await pg.click(f'.fg-tile >> nth={i}'); await pg.wait_for_timeout(500)
            for src in await pg.locator('.fg-shot').evaluate_all('(l) => l.map((x) => x.getAttribute("src"))'): imgs.add(src)
            await pg.evaluate("location.hash = '#/fguide'"); await pg.wait_for_timeout(300)
        for src in imgs: await pg.goto(B + src); 
        ok('Всички снимки на ръководството се зареждат', not [u for u in bad if '/guide/owner/' in u] and len(imgs) >= 25, (len(imgs), [u for u in bad if '/guide/owner/' in u][:3]))
        st = await pg.evaluate("fetch('/guide/owner/Chisto-avtopark.pdf', { method: 'HEAD' }).then((r) => r.status)"); ok('PDF презентацията е налична', st == 200, st)
        ok('Без грешки', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
asyncio.run(main())
