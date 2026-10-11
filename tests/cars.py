# Обща кола и автопарк: създаване, покана с линк, дялове, наем, какво вижда собственикът
import asyncio
from playwright.async_api import async_playwright
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
B = 'http://localhost:8765'

async def login(pg, email):
    await pg.evaluate("async () => { const s = await import('/js/store.js'); s.logout(); }")
    await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(500)
    await pg.fill('input[type=email]', email); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844})
        pg = await ctx.new_page(); errs = []; pg.set_default_timeout(8000)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '/app'); await pg.evaluate('localStorage.clear()'); await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(600)
        await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        S = "const s = await import('/js/store.js');"

        # --- Лична кола: Иван създава, Георги се присъединява с линк ---
        await pg.goto(B + '/app#/cars'); await pg.wait_for_timeout(500)
        ok('Екранът „Обща кола“ се отваря', await pg.locator('button:has-text("Добави кола")').count() == 1)
        await pg.click('button:has-text("Добави кола")'); await pg.wait_for_timeout(300)
        await pg.fill('.sheet input >> nth=0', 'Hyundai Elantra'); await pg.fill('.sheet input >> nth=1', 'РВ1827ХЕ')
        await pg.click('.sheet >> text=Добави'); await pg.wait_for_timeout(500)
        car = await pg.evaluate(f"async () => {{ {S} return s.myCars()[0]; }}")
        ok('Колата е създадена: лична, Иван е собственик и шофьор със 100%', car and car['type'] == 'own' and len(car['members']) == 1 and car['members'][0]['share'] == 100, car and car['members'])
        ok('Линкът за покана се вижда', await pg.locator('.inv-link').count() == 1 and car['invite'] in await pg.locator('.inv-link').inner_text())
        # общ разход: застраховка 1200 на година
        await pg.evaluate(f"async () => {{ {S} s.saveCost({{ carId: '{car['id']}', name: 'Каско', category: 'casco', amount: 1200, period: 'year', startDate: '2026-01-01' }}); }}")
        # Георги влиза с линка
        await login(pg, 'georgi@demo.bg')
        await pg.goto(B + '/app#/join/' + car['invite']); await pg.wait_for_timeout(900)
        ok('След линка Георги е на колата', '/cars/' + car['id'] in pg.url, pg.url)
        car2 = await pg.evaluate(f"async () => {{ {S} return s.myCars().find(c => c.id === '{car['id']}'); }}")
        shares = sorted([m['share'] for m in car2['members']])
        ok('Двама шофьори – по 50%', shares == [50, 50], shares)
        mine = await pg.evaluate(f"async () => {{ {S} return s.myData().costs.filter(c => c.carId === '{car['id']}'); }}")
        ok('Каското влиза в разходите на Георги с дял 50%', len(mine) == 1 and abs(mine[0]['share'] - 0.5) < 1e-9, mine and mine[0].get('share'))
        perDay = await pg.evaluate("async () => { const c = await import('/js/calc.js'); const s = await import('/js/store.js'); const d = s.myData(); return c.fixedForDay(d.costs.filter(x => x.carId), d.profile, '2026-10-12', true); }")
        ok('Делът му на ден = 1200 / 365 × 50% = 1,64 €', abs(perDay - 1200 / 365 * 0.5) < 0.01, round(perDay, 3))
        ok('Георги не вижда кода за покана в списъка? (локално – само собственикът има бутона)', await pg.locator('.inv-link').count() == 0)
        # Иван сменя дяловете 70/30
        await login(pg, 'ivan@demo.bg')
        gid = await pg.evaluate("async () => { const s = await import('/js/store.js'); return s.myCars()[0].members.find(m => m.name !== 'Иван Петров').userId; }")
        iid = await pg.evaluate("async () => { const s = await import('/js/store.js'); return s.currentUser().id; }")
        await pg.evaluate(f"async () => {{ {S} s.setShares('{car['id']}', {{ '{iid}': 70, '{gid}': 30 }}); }}")
        ivanShare = await pg.evaluate(f"async () => {{ {S} return s.myData().costs.find(c => c.carId === '{car['id']}').share; }}")
        ok('Иван след 70/30 плаща 70% от каското', abs(ivanShare - 0.7) < 1e-9, ivanShare)
        await pg.goto(B + '/app#/cars/' + car['id']); await pg.wait_for_timeout(600)
        txt = await pg.locator('#app').inner_text()
        ok('Собственикът вижда Георги с км, часове, дни и смени', 'км' in txt and ('смени' in txt or 'смяна' in txt) and 'Шофьори' in txt)
        drv = await pg.locator('.drv-list').inner_text()
        ok('В реда на шофьора няма суми в евро (без приходи и разходи)', '€' not in drv, drv.replace('\n', ' ')[:120])

        # --- Кола под наем: Иван дава кола на Мария, задава наем 140 €/седм. ---
        rc = await pg.evaluate(f"async () => {{ {S} return s.createCar({{ type: 'rent', name: 'Skoda Octavia', plate: 'РВ0001АА' }}); }}")
        ok('Кола под наем: собственикът не е шофьор', rc['type'] == 'rent' and rc['members'] == [], rc['members'])
        await login(pg, 'maria@demo.bg')
        await pg.goto(B + '/app#/join/' + rc['invite']); await pg.wait_for_timeout(900)
        prof = await pg.evaluate(f"async () => {{ {S} return s.getProfile(); }}")
        ok('Мария след присъединяване е „под наем“', prof['carType'] == 'rent', prof['carType'])
        await login(pg, 'ivan@demo.bg')
        mid = await pg.evaluate(f"async () => {{ {S} return s.myCars().find(c => c.id === '{rc['id']}').members[0].userId; }}")
        await pg.evaluate(f"async () => {{ {S} s.setMemberRent('{rc['id']}', '{mid}', {{ amount: 140, period: 'week', from: '2026-10-01' }}); }}")
        ivanRent = await pg.evaluate(f"async () => {{ {S} return s.myData().costs.filter(c => c.carId === '{rc['id']}').length; }}")
        ok('Наемът не е разход на собственика', ivanRent == 0, ivanRent)
        await login(pg, 'maria@demo.bg')
        rent = await pg.evaluate(f"async () => {{ {S} return s.myData().costs.find(c => c.system === 'carrent'); }}")
        ok('Мария има наем 140 €/седм. от собственика', rent and rent['amount'] == 140 and rent['period'] == 'week', rent and (rent['amount'], rent['period']))
        await pg.goto(B + '/app#/cars/' + rc['id']); await pg.wait_for_timeout(500)
        ok('Мария вижда „Твоят наем“', 'Твоят наем' in await pg.locator('#app').inner_text())
        # Мария излиза от колата
        await pg.evaluate(f"async () => {{ {S} s.leaveCar('{rc['id']}'); }}")
        left = await pg.evaluate(f"async () => {{ {S} return [s.myCars().length, s.myData().costs.filter(c => c.system === 'carrent').length]; }}")
        ok('След „Излез“ колата и наемът ги няма', left == [0, 0], left)
        ok('Грешен код дава съобщение', 'error' in await pg.evaluate(f"async () => {{ {S} return s.joinCar('НЯМАТАКЪВ'); }}"))
        ok('Без грешки в конзолата', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
asyncio.run(main())
