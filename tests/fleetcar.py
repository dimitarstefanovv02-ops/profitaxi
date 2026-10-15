# Колата под наем: голям „Запиши“ (с глас вътре), постоянни разходи с плъзгач 1–12 месеца → срокове сами,
# махане/добавяне на срок, първоначални разходи в изплащането, плащания; профил на собственика; чакащ – „Обади се“;
# задължителни км само за шофьор в кола под наем; админ – „Нов собственик на коли под наем“.
import asyncio
from playwright.async_api import async_playwright
B = 'http://localhost:8765'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
J = "const s = await import('/js/store.js'); const u = await import('/js/util.js'); const t = u.todayStr();"

async def login(pg, email, pw='demo123'):
    await pg.evaluate("async () => { const s = await import('/js/store.js'); s.logout(); }")
    path = '/avtopark' if 'fleet' in email else '/app'
    await pg.goto(B + path + '#/login'); await pg.wait_for_timeout(400)
    await pg.fill('input[autocomplete=username]', email); await pg.fill('input[type=password]', pw); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844})
        pg = await ctx.new_page(); errs = []; pg.set_default_timeout(8000); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B + '/app'); await pg.evaluate("localStorage.clear(); localStorage.setItem('profitaxi.fwalk','1'); localStorage.setItem('profitaxi.installed','1')")
        await pg.goto(B + '/avtopark#/login'); await pg.wait_for_timeout(500)
        car = await pg.evaluate(f"""async () => {{ {J}
          const c = s.sendSmsCode('0888111222'); s.verifySmsCode('0888111222', c.demoCode);
          const r = await s.register({{ name: 'Петко Колев', email: 'petko@fleet.bg', password: 'parola1', phone: '0888111222', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'own', accountType: 'fleet' }});
          if (r.error) throw new Error(r.error);
          s.updateProfile({{ waitlist: [{{ id: 'w1', name: 'Калоян Русев', phone: '0899 555 010', at: new Date().toISOString() }}] }});
          return s.createCar({{ type: 'rent', name: 'Skoda Octavia', plate: 'РВ1234АК' }}); }}""")
        # шофьор в колата
        await login(pg, 'georgi@demo.bg'); await pg.goto(B + '/app#/join/' + car['invite']); await pg.wait_for_timeout(800)
        gid = await pg.evaluate(f"async () => {{ {J} return s.currentUser().id; }}")
        # км са задължителни за поканения в кола под наем
        req = await pg.evaluate(f"async () => {{ {J} return s.kmRequired(); }}")
        ok('Поканен в кола под наем → км са задължителни', req is True, req)
        await pg.evaluate(f"async () => {{ {J} const a = s.getActiveShift(); if (a) s.deleteShift(a.id); s.startShift(150000); }}")
        await pg.goto(B + '/app#/home'); await pg.wait_for_timeout(800)
        await pg.click('button:has-text("Приключи смяната") >> nth=0'); await pg.wait_for_timeout(400)
        await pg.click('.np-actions .btn-primary'); await pg.wait_for_timeout(500)
        still = await pg.evaluate(f"async () => {{ {J} return !!s.getActiveShift(); }}")
        ok('Без краен км смяната не се приключва', still, still)
        await pg.keyboard.press('Escape'); await pg.evaluate(f"async () => {{ {J} const a = s.getActiveShift(); if (a) s.deleteShift(a.id); }}")
        # Иван (без кола под наем) – не е задължително
        await login(pg, 'ivan@demo.bg')
        ok('Шофьор без кола под наем – км не са задължителни', await pg.evaluate(f"async () => {{ {J} return s.kmRequired(); }}") is False)
        # собственикът
        await login(pg, 'petko@fleet.bg', 'parola1')
        await pg.evaluate(f"async () => {{ {J} s.setMemberRent('{car['id']}', '{gid}', {{ amount: 140, period: 'week', from: u.addDays(t, -6) }}); s.addCarLog({{ carId: '{car['id']}', kind: 'pay', driverId: '{gid}', amount: 140, date: u.addDays(t, -6) }}); }}")
        await pg.goto(B + '/avtopark#/cars/' + car['id']); await pg.wait_for_timeout(900)
        ok('Голям бутон „Запиши“', await pg.locator('.rec-big').count() == 1)
        ok('Отделен бутон „Кажи“ горе го няма', await pg.locator('button:has-text("Кажи")').count() == 0)
        ok('Падащи полета: разходи, срокове, първоначални, плащания', all([await pg.locator(f'details.{c}').count() == 1 for c in ['acc-fixed', 'acc-dl', 'acc-setup', 'acc-pay']]))
        await pg.click('.rec-big'); await pg.wait_for_timeout(300)
        ok('„Запиши“: „Кажи го с глас“ е вътре', await pg.locator('.sheet .voice-big').count() == 1)
        ok('„Запиши“: постоянен и първоначален разход', await pg.locator('.sheet .quick button:has-text("Постоянен")').count() == 1 and await pg.locator('.sheet .quick button:has-text("Първоначален")').count() == 1)
        # постоянен разход: каско 600 € на всеки 3 месеца
        await pg.click('.sheet .quick button:has-text("Постоянен")'); await pg.wait_for_timeout(400)
        await pg.click('.sheet .chip-btn:has-text("Каско")')
        await pg.fill('.sheet input[type=number]', '600')
        await pg.evaluate("(() => { const i = document.querySelector('.sheet input[type=date]'); const d = new Date(Date.now() + 10 * 864e5); i.value = d.toISOString().slice(0, 10); i.dispatchEvent(new Event('change', { bubbles: true })); const r = document.querySelector('.sheet .m-range'); r.value = 3; r.dispatchEvent(new Event('input', { bubbles: true })); })()")
        ok('Плъзгачът показва „на всеки 3 месеца“', 'на всеки 3 месеца' in await pg.locator('.sheet .m-top b').inner_text())
        await pg.click('.sheet button:has-text("Запази")'); await pg.wait_for_timeout(600)
        c = await pg.evaluate(f"async () => {{ {J} return s.carCosts('{car['id']}').find((x) => x.category === 'casco'); }}")
        ok('Разходът е записан: 600 € на 3 месеца с дата', c and c['period'] == 'months' and c['months'] == 3 and c['amount'] == 600 and c['dueDate'], c and [c['period'], c['months'], c['dueDate']])
        await pg.evaluate("document.querySelectorAll('details.acc').forEach((d) => d.open = true)")
        dl = await pg.locator('.acc-dl').inner_text()
        ok('Срокът идва сам от разхода', 'Каско' in dl and 'след 10 дни' in dl, dl[:120])
        ok('Постоянните: ~200 € на месец', '200' in await pg.locator('.acc-fixed summary').inner_text(), await pg.locator('.acc-fixed summary').inner_text())
        # „Платено“ мести срока с 3 месеца
        due0 = c['dueDate']
        await pg.click('.acc-dl .dl-row:has-text("Каско") .chip:has-text("Платено")'); await pg.wait_for_timeout(500)
        due1 = await pg.evaluate(f"async () => {{ {J} return s.carCosts('{car['id']}').find((x) => x.category === 'casco').dueDate; }}")
        ok('„Платено“ мести срока с 3 месеца', due1 > due0 and int(due1[5:7]) % 12 == (int(due0[5:7]) + 3 - 1) % 12 + 1, [due0, due1])
        # махане на срок → разходът остава
        await pg.evaluate("document.querySelectorAll('details.acc').forEach((d) => d.open = true)")
        await pg.click('.acc-dl .dl-row:has-text("Каско") .icon-btn'); await pg.wait_for_timeout(300); await pg.click('.sheet .btn-danger'); await pg.wait_for_timeout(500)
        r = await pg.evaluate(f"async () => {{ {J} const c = s.carCosts('{car['id']}').find((x) => x.category === 'casco'); return [!!c, !!c?.noDl]; }}")
        ok('× маха срока, разходът остава', r == [True, True], r)
        # срок на ръка
        await pg.evaluate("document.querySelectorAll('details.acc').forEach((d) => d.open = true)")
        await pg.click('.acc-dl button:has-text("Срок на ръка")'); await pg.wait_for_timeout(300)
        await pg.fill('.sheet input:not([type=date])', 'Проверка на апарата'); await pg.click('.sheet button:has-text("Добави")'); await pg.wait_for_timeout(500)
        await pg.evaluate("document.querySelectorAll('details.acc').forEach((d) => d.open = true)")
        ok('Срок на ръка се показва', 'Проверка на апарата' in await pg.locator('.acc-dl').inner_text())
        # първоначален разход → изплащане
        await pg.evaluate(f"async () => {{ {J} s.updateCar('{car['id']}', {{ price: 10000 }}); }}")
        await pg.goto(B + '/avtopark#/cars/' + car['id']); await pg.wait_for_timeout(700)
        await pg.click('.rec-big'); await pg.wait_for_timeout(300); await pg.click('.sheet .quick button:has-text("Първоначален")'); await pg.wait_for_timeout(400)
        await pg.click('.sheet .chip-btn:has-text("Таксиметров апарат")'); await pg.fill('.sheet input[type=number]', '450'); await pg.click('.sheet button:has-text("Запази")'); await pg.wait_for_timeout(600)
        pb = await pg.locator('.payback').inner_text()
        ok('Първоначалните влизат в изплащането (10 000 + 450)', '10 450' in pb.replace(' ', ' ').replace('\xa0', ' ') and 'първоначални 450' in pb, pb)
        net = await pg.evaluate(f"async () => {{ {J} const f = await import('/js/fleet.js'); return f.carProfit(s.carCosts('{car['id']}'), s.carLogs('{car['id']}'), t, t).expense; }}")
        ok('…но не и в печалбата за деня', net < 20, net)
        # плащания
        await pg.evaluate("document.querySelectorAll('details.acc').forEach((d) => d.open = true)")
        pays = await pg.locator('.acc-pay').inner_text()
        ok('Плащания: наемът, апаратът и каското', 'Наем' in pays and 'Таксиметров апарат' in pays and 'Каско' in pays, pays[:160])
        # данни: талон и снимка
        await pg.click('.rent-head .icon-btn'); await pg.wait_for_timeout(400)
        ok('Данни: снимка на колата и „Снимай талона“', await pg.locator('.sheet .car-photo-pick').count() == 1 and await pg.locator('.sheet button:has-text("Снимай талона")').count() == 1)
        ok('Данни: без „Валидни до“ и тахограф', 'Тахограф' not in await pg.locator('.sheet').inner_text() and 'Валидни до' not in await pg.locator('.sheet').inner_text())
        await pg.keyboard.press('Escape')
        # нова кола: талон
        await pg.goto(B + '/avtopark#/cars?new=1'); await pg.wait_for_timeout(700)
        ok('Нова кола: „Снимай талона“ и снимка', await pg.locator('.sheet button:has-text("Снимай талона")').count() == 1 and await pg.locator('.sheet .car-photo-pick').count() == 1)
        await pg.keyboard.press('Escape')
        # профил и чакащи
        await pg.goto(B + '/avtopark#/me'); await pg.wait_for_timeout(600)
        ok('Профил на собственика – корица и схема', await pg.locator('.fleet-cover .c6-ava').count() == 1 and 'Собственик' in await pg.locator('.fleet-cover').inner_text())
        await pg.goto(B + '/avtopark#/home'); await pg.wait_for_timeout(700)
        ok('Чакащ шофьор – „Обади се“ до името', await pg.locator('.wait-row a.wr-call[href="tel:0899555010"]').count() == 1)
        # админ – нов собственик
        await pg.goto(B + '/admin'); await pg.wait_for_timeout(500)
        await pg.evaluate("localStorage.setItem('profitaxi.adminTour','done')"); await pg.goto(B + '/admin'); await pg.wait_for_timeout(500)
        await pg.fill('input[autocomplete=username], input[type=email]', 'admin@profitaxi.bg'); await pg.fill('input[type=password]', 'admin123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
        await pg.evaluate("document.querySelectorAll('.tour').forEach(e=>e.remove())")
        await pg.click('#adm-bell'); await pg.wait_for_timeout(300)
        bell = await pg.locator('.bell-pop').inner_text()
        ok('Админ: известие „Нов собственик на коли под наем“', 'Нов собственик на коли под наем' in bell and 'Петко Колев' in bell, bell[:200])
        ok('Без грешки в JS', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print('FAILS:', sum(1 for r in R if r.startswith('FAIL')), '/', len(R))
asyncio.run(main())
