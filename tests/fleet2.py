# Автопарк: наем по периоди, „Платих“ → потвърждение, дълг, глоба към шофьора, депозит, срокове, статус,
# км при предаване и задължителен километраж, лично каране, глас в колата, „Днес“ и „Напомни“.
import asyncio, tempfile
from playwright.async_api import async_playwright
S = tempfile.gettempdir() + '/'
B = 'http://localhost:8765'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
J = "const s = await import('/js/store.js');"

async def login(pg, email, pw='demo123'):
    await pg.evaluate("async () => { const s = await import('/js/store.js'); s.logout(); }")
    await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(400)
    await pg.fill('input[type=email]', email); await pg.fill('input[type=password]', pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2); errs = []; pg.set_default_timeout(8000)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '/app'); await pg.evaluate('localStorage.clear()'); await pg.goto(B + '/app#/login'); await pg.wait_for_timeout(500)
        # собственик на автопарк
        await pg.evaluate("""async () => { const s = await import('/js/store.js');
          const c = s.sendSmsCode('0888111222'); s.verifySmsCode('0888111222', c.demoCode);
          const r = await s.register({ name: 'Петко Колев', email: 'petko@fleet.bg', password: 'parola1', phone: '0888111222', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'own', accountType: 'fleet' });
          if (r.error) throw new Error(r.error); }""")
        cars = await pg.evaluate("""async () => { const s = await import('/js/store.js'); const u = await import('/js/util.js'); const t = u.todayStr();
          const a = s.createCar({ type: 'rent', name: 'Skoda Octavia', plate: 'РВ1234АК' });
          s.updateCar(a.id, { price: 14000, boughtAt: u.addDays(t, -200), docs: { insurance: u.addDays(t, 2), inspection: u.addDays(t, 40) } });
          s.saveCost({ carId: a.id, name: 'Каско', category: 'casco', amount: 900, period: 'year', startDate: u.addDays(t, -200) });
          const b = s.createCar({ type: 'rent', name: 'Toyota Corolla', plate: 'РВ5678ВН' });
          const c = s.createCar({ type: 'rent', name: 'Hyundai Elantra', plate: 'РВ9012СС' });
          return [a, b, c]; }""")
        a, bcar, c = cars
        await login(pg, 'georgi@demo.bg')
        await pg.goto(B + '/app#/join/' + a['invite']); await pg.wait_for_timeout(800)
        gid = await pg.evaluate(f"async () => {{ {J} return s.currentUser().id; }}")
        await login(pg, 'maria@demo.bg')
        await pg.goto(B + '/app#/join/' + bcar['invite']); await pg.wait_for_timeout(800)
        mid = await pg.evaluate(f"async () => {{ {J} return s.currentUser().id; }}")
        # собственикът задава наема и километража при предаване
        await login(pg, 'petko@fleet.bg', 'parola1')
        await pg.evaluate(f"""async () => {{ {J} const u = await import('/js/util.js'); const t = u.todayStr();
          s.setMemberRent('{a['id']}', '{gid}', {{ amount: 140, period: 'week', from: u.addDays(t, -15) }});
          s.setMemberRent('{bcar['id']}', '{mid}', {{ amount: 25, period: 'day', from: u.addDays(t, -4) }});
          s.setHandover('{a['id']}', '{gid}', 245300);
          s.addCarLog({{ carId: '{a['id']}', kind: 'deposit', driverId: '{gid}', amount: 300 }}); }}""")
        # Георги: наемът е при него, „Платих“, смяна от км при предаване
        await login(pg, 'georgi@demo.bg')
        g = await pg.evaluate(f"""async () => {{ {J} const d = s.myData(); const r = d.costs.find((c) => c.system === 'carrent'); return {{ rent: r && [r.amount, r.period], km: s.lastKm(), car: s.drivingCar() && s.drivingCar().id }}; }}""")
        ok('Шофьорът има наема 140 €/седм. от собственика', g['rent'] == [140, 'week'], g['rent'])
        ok('Първата смяна започва от км при предаване (245 300)', g['km'] == 245300, g['km'])
        ok('Колата, която кара, се разпознава', g['car'] == a['id'], g['car'])
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(500)
        t = await pg.locator('#app').inner_text()
        ok('В „Днес“ на шофьора има наема и „Платих“', 'Платих' in t and 'дължиш' in t, t[:200].replace('\n', ' '))
        await pg.screenshot(path=S + 'fl2_drv_home.png')
        await pg.click('button:has-text("Платих") >> nth=0'); await pg.wait_for_timeout(300)
        await pg.fill('.sheet input[type=number]', '280'); await pg.click('.sheet button:has-text("Платих")'); await pg.wait_for_timeout(400)
        pend = await pg.evaluate(f"async () => {{ {J} return s.myLogs('pay').map((l) => [l.amount, l.status]); }}")
        ok('„Платих 280“ чака потвърждение', pend == [[280, 'claimed']], pend)
        # смяна без краен км не може да се приключи
        sh = await pg.evaluate(f"async () => {{ {J} const x = s.startShift(245300); return x.id; }}")
        await pg.goto(B + f'/app#/shift/{sh}?end=1'); await pg.wait_for_timeout(500)
        await pg.click('.save-bar .btn-primary'); await pg.wait_for_timeout(400)
        still = await pg.evaluate(f"async () => {{ {J} return !!s.getActiveShift(); }}")
        ok('Без краен км смяната не се приключва', still, still)
        await pg.screenshot(path=S + 'fl2_km.png')
        await pg.evaluate(f"""async () => {{ {J} const x = s.getActiveShift(); x.kmEnd = 245480; x.end = new Date().toISOString(); x.income.cash = 120; s.saveShift(x);
          const y = s.startShift(245510); y.kmEnd = 245600; y.end = new Date().toISOString(); s.saveShift(y); }}""")
        # лично каране
        await pg.evaluate(f"async () => {{ {J} s.addPersonalKm({{ kmStart: 245600, kmEnd: 245640 }}); }}")
        km2 = await pg.evaluate(f"async () => {{ {J} return s.lastKm(); }}")
        ok('Личното каране мести километража (245 640)', km2 == 245640, km2)
        # собственикът: потвърждава, вижда дълг на Мария, пропуснати км, глоба
        await login(pg, 'petko@fleet.bg', 'parola1')
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(700)
        t = await pg.locator('#app').inner_text()
        ok('„Днес“: „Платих 280“ за потвърждение', 'Платих 280' in t, '')
        ok('„Днес“: Мария дължи', 'Мария' in t and 'дължи' in t)
        ok('„Днес“: ГО изтича след 2 дни', 'Гражданска отговорност' in t and 'след 2 дни' in t)
        ok('„Днес“: Hyundai е свободна', 'Hyundai Elantra е свободна' in t)
        ok('„Днес“: неотчетени км (30)', 'неотчетени 30 км' in t, '')
        ok('Голямата цифра и заетостта', 'коли карат днес' in t and 'от дните на път' in t)
        await pg.screenshot(path=S + 'fl2_home.png', full_page=True)
        await pg.click('.td-row:has-text("Платих 280") .chip'); await pg.wait_for_timeout(400)
        await pg.goto(B + '/app#/cars/' + a['id']); await pg.wait_for_timeout(600)
        t = await pg.locator('#app').inner_text()
        ok('Колата: печалба за месеца и изплащане', 'Печалба' in t and 'Изплащане на колата' in t)
        await pg.screenshot(path=S + 'fl2_car.png', full_page=True)
        # шофьорът – лист с наема по седмици
        await pg.click('.drv-row.tap >> nth=0'); await pg.wait_for_timeout(400)
        st = await pg.locator('.sheet').inner_text()
        ok('Листът на шофьора: оценка, наем по седмици, депозит', 'Депозит' in st and 'платено' in st and 'Наем 140' in st, st[:160].replace('\n', ' '))
        await pg.screenshot(path=S + 'fl2_drv.png')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # глоба с час – намира кой е карал
        r = await pg.evaluate(f"""async () => {{ const f = await import('/js/fleet.js'); {J} const info = s.carShifts('{a['id']}'); const car = s.myCars().find((c) => c.id === '{a['id']}');
          const w = f.whoDrove(car.members, info, new Date(Date.now() - 60000).toISOString()); return w && w.userId; }}""")
        ok('Глоба: намира кой е карал в този час', r == gid, r)
        # глас: „200 евро гуми“, „глоба 50 за превишена скорост“, „в сервиз“, „платен наем“
        v = await pg.evaluate("""async () => { const f = await import('/js/fleet.js'); const sp = await import('/js/speech.js');
          return ['200 евро гуми', 'глоба 50 за превишена скорост', 'в сервиз', 'платен наем', 'депозит триста', 'ремонт на спирачките 180'].map((t) => { const p = f.parseCarVoice(t, sp.wordsToDigits); return p && [p.kind, p.amount || p.status || '', p.category || p.text || '']; }); }""")
        ok('Глас: гуми 200', v[0] == ['cost', 200, 'tires'], v[0])
        ok('Глас: глоба 50 за превишена скорост', v[1] == ['fine', 50, 'превишена скорост'], v[1])
        ok('Глас: в сервиз', v[2][0] == 'status' and v[2][1] == 'service', v[2])
        ok('Глас: платен наем', v[3][0] == 'pay', v[3])
        ok('Глас: депозит 300', v[4] == ['deposit', 300, ''], v[4])
        ok('Глас: ремонт 180', v[5][:2] == ['cost', 180] and v[5][2] == 'repair', v[5])
        await pg.evaluate(f"async () => {{ {J} s.addCarLog({{ carId: '{a['id']}', kind: 'fine', driverId: '{gid}', amount: 50, text: 'превишена скорост' }}); s.setCarStatus('{bcar['id']}', 'service'); }}")
        # напомняне към Мария
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(500)
        await pg.click('.td-row:has-text("Мария") .chip:has-text("Напомни")'); await pg.wait_for_timeout(300)
        # Георги: потвърдено, глобата е в разходите му
        await login(pg, 'georgi@demo.bg')
        gg = await pg.evaluate(f"async () => {{ {J} return {{ pay: s.myLogs('pay').map((l) => l.status), fine: s.myData().costs.filter((c) => c.category === 'fine').map((c) => c.amount) }}; }}")
        ok('При Георги плащането е потвърдено', gg['pay'] == ['ok'], gg['pay'])
        ok('Глобата е в разходите на Георги', gg['fine'] == [50], gg['fine'])
        await login(pg, 'maria@demo.bg')
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(500)
        t = await pg.locator('#app').inner_text()
        ok('Мария вижда напомнянето', 'Наемът за' in t, t[:160].replace('\n', ' '))
        await pg.screenshot(path=S + 'fl2_maria.png')
        # админ: меню „Собственици“ и филтър по рег. номер
        ad = pg; await ad.set_viewport_size({'width': 1280, 'height': 900})
        await ad.add_init_script("try { localStorage.setItem('profitaxi.adminTour', 'done') } catch (e) {}")
        await ad.goto(B + '/admin.html'); await ad.wait_for_timeout(500)
        await ad.fill('input[type=email]', 'admin@profitaxi.bg'); await ad.fill('input[type=password]', 'admin123'); await ad.click('button[type=submit]'); await ad.wait_for_timeout(1200)
        await ad.goto(B + '/admin.html#/owners'); await ad.wait_for_timeout(800)
        t = await ad.locator('#app').inner_text()
        ok('Админ: „Собственици“ показва Петко, колите и шофьорите му', 'Петко Колев' in t and 'РВ1234АК' in t and 'Георги Димитров' in t and 'Мария' in t, t[:200].replace('\n', ' '))
        await ad.screenshot(path=S + 'fl2_admin.png', full_page=True)
        await ad.goto(B + '/admin.html#/owners?t=cars'); await ad.wait_for_timeout(600)
        await ad.fill('input[placeholder^="Рег. номер"]', 'РВ5678'); await ad.wait_for_timeout(500)
        await ad.screenshot(path=S + 'fl2_admin_cars.png'); print('ERRS', errs[-3:]); t = await ad.locator('#app').inner_text()
        ok('Админ: търсене по рег. номер намира само Toyota', 'РВ5678ВН' in t and 'РВ1234АК' not in t, t[:120].replace('\n', ' '))
        await ad.screenshot(path=S + 'fl2_admin_cars.png')
        ok('Без грешки', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
asyncio.run(main())
