import asyncio, re
from playwright.async_api import async_playwright
R=[]
def ok(n,c,x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  ['+str(x)+']' if x!='' else ''}")
num = lambda t: float(re.sub(r'[^\d,\-−]','',t).replace('−','-').replace(',','.') or 0)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':1280,'height':900}); await ctx.add_init_script("try { localStorage.setItem('profitaxi.adminTour', 'done') } catch (e) {}")
        a = await ctx.new_page(); errs=[]
        a.on('pageerror', lambda e: errs.append(str(e)))
        base='http://localhost:8765'
        await a.goto(base+'/admin.html'); await a.evaluate('localStorage.clear()'); await a.goto(base+'/admin.html'); await a.wait_for_timeout(500)
        await a.fill('input[type=email]','ivan@demo.bg'); await a.fill('input[type=password]','demo123'); await a.click('button[type=submit]'); await a.wait_for_timeout(300)
        ok('Шофьорски акаунт не влиза в админ панела', 'Грешен' in await a.inner_text('.err'))
        await a.fill('input[type=email]','admin@profitaxi.bg'); await a.fill('input[type=password]','admin123'); await a.click('button[type=submit]'); await a.wait_for_timeout(1200)
        ok('Админ вход', await a.locator('.scope-bar').count()==1)
        # Филтър: сумите по градове = общото
        total = num(await a.inner_text('.kpi >> nth=0 >> .kpi-value'))
        cities = await a.eval_on_selector('.scope-bar select', 'e=>[...e.options].slice(1).map(o=>o.value)')
        s = 0
        for c in cities:
            await a.select_option('.scope-bar select', c); await a.wait_for_timeout(500)
            s += num(await a.inner_text('.kpi >> nth=0 >> .kpi-value'))
        ok('Приходът по всички градове = общия приход', abs(s-total) <= len(cities), f'{s} vs {total}')
        await a.select_option('.scope-bar select', 'Пловдив'); await a.wait_for_timeout(500)
        city_total = num(await a.inner_text('.kpi >> nth=0 >> .kpi-value'))
        comps = await a.eval_on_selector('.scope-bar select >> nth=1', 'e=>[...e.options].slice(1).map(o=>o.value)')
        s2 = 0
        for c in comps:
            await a.select_option('.scope-bar select >> nth=1', c); await a.wait_for_timeout(500)
            s2 += num(await a.inner_text('.kpi >> nth=0 >> .kpi-value'))
        ok('Приходът по фирмите в Пловдив = прихода на Пловдив', abs(s2-city_total) <= len(comps), f'{s2} vs {city_total}')
        await a.select_option('.scope-bar select >> nth=1', comps[0]); await a.wait_for_timeout(400)
        # Филтърът се пази между страниците
        for label in ['Градове и фирми','Ефир, наеми, работа','Шофьори','Абонаменти']:
            await a.click(f'.adm-nav >> text={label}'); await a.wait_for_timeout(700)
            v = await a.eval_on_selector_all('.scope-bar select', 'e=>e.map(s=>s.value)')
            if v != ['Пловдив', comps[0]]: ok(f'Филтърът се пази: {label}', False, v)
        ok('Филтърът град/фирма се пази на всички страници', not any(r.startswith('FAIL  Филтърът се пази:') for r in R))
        n_rows = await a.locator('.tbl tbody tr').count()
        await a.click('.adm-nav >> text=Шофьори'); await a.wait_for_timeout(600)
        rows = await a.locator('.tbl tbody tr').all_inner_texts()
        ok('Списъкът шофьори показва само избраната фирма', rows and all(comps[0] in r for r in rows), len(rows))
        await a.click('.scope-bar >> text=Изчисти'); await a.wait_for_timeout(600)
        ok('„Изчисти“ връща цяла България', 'Цяла България' in await a.inner_text('.scope-sum'))
        # Детайли на шофьор и действия
        await a.fill('input[type=search]', 'Иван Петров'); await a.wait_for_timeout(300)
        await a.click('.tbl tbody tr >> nth=0'); await a.wait_for_timeout(900)
        ok('Детайли на шофьор се отварят', 'Иван Петров' in await a.inner_text('.adm-head'))
        before = await a.inner_text('.info-row:has-text("Валиден до")')
        await a.click('text=+30 дни'); await a.wait_for_timeout(500)
        after = await a.inner_text('.info-row:has-text("Валиден до")')
        ok('+30 дни удължава абонамента', before != after, after.replace('\n',' '))
        await a.click('text=Спри достъпа'); await a.click('.sheet >> text=Спри достъпа'); await a.wait_for_timeout(500)
        ok('Спиране на достъпа', 'Спрян' in await a.inner_text('.adm-head'))
        # шофьорът вижда заключен екран
        d = await ctx.new_page(); await d.goto(base+'/app'); await d.wait_for_timeout(300)
        await d.fill('input[type=email]','ivan@demo.bg'); await d.fill('input[type=password]','demo123'); await d.click('button[type=submit]'); await d.wait_for_timeout(500)
        ok('Спрян шофьор вижда „Достъпът е спрян“', 'Достъпът е спрян' in await d.inner_text('#app'))
        await a.click('text=Пусни достъпа'); await a.wait_for_timeout(500)
        await d.reload(); await d.wait_for_timeout(500)
        ok('След „Пусни достъпа“ шофьорът влиза нормално', 'Започвам смяна' in await d.inner_text('#app') or 'Приключих' in await d.inner_text('#app'))
        # Изтекъл пробен период
        await d.wait_for_timeout(900); await d.keyboard.press('Escape'); await d.wait_for_timeout(400)
        await d.goto(base+'/app#/profile'); await d.wait_for_timeout(500); await d.click('text=Изход'); await d.wait_for_timeout(300)
        await d.fill('input[type=email]','stoyan@demo.bg'); await d.fill('input[type=password]','demo123'); await d.click('button[type=submit]'); await d.wait_for_timeout(500)
        ok('Изтекъл абонамент вижда „Абонаментът изтече“', 'Абонаментът изтече' in await d.inner_text('#app'))
        # Нова парола от админа
        await a.click('text=Нова парола'); await a.wait_for_timeout(300)
        await a.fill('.sheet input', 'novaparola1'); await a.click('.sheet .btn-page'); await a.wait_for_timeout(400)
        await d.click('text=Изход'); await d.wait_for_timeout(300)
        await d.fill('input[type=email]','ivan@demo.bg'); await d.fill('input[type=password]','novaparola1'); await d.click('button[type=submit]'); await d.wait_for_timeout(500)
        ok('Шофьорът влиза с новата парола от админа', '#/home' in d.url)
        # Нов шофьор от админа
        await a.click('.adm-nav >> text=Нов шофьор'); await a.wait_for_timeout(500)
        await a.click('button[type=submit]'); await a.wait_for_timeout(200)
        ok('Нов шофьор без данни дава грешка', len(await a.inner_text('.err'))>3, await a.inner_text('.err'))
        await a.fill('label:has-text("Име") input','Нов Шофьор'); await a.fill('input[type=email]','nov@test.bg')
        await a.select_option('select >> nth=0','Сливен'); await a.wait_for_timeout(150); await a.select_option('select >> nth=1','Perfect Taxi')
        await a.click('.seg-btn:has-text("Собствена")'); await a.click('button[type=submit]'); await a.wait_for_timeout(800)
        ok('Създаден шофьор в Сливен, Perfect Taxi', 'Perfect Taxi' in await a.inner_text('main'))
        # Настройки: пробен период
        await a.click('.adm-nav >> text=Настройки'); await a.wait_for_timeout(400)

        await a.fill('input[type=number]','30'); await a.click('main .btn-page'); await a.wait_for_timeout(300)
        d2 = await ctx.new_page(); await d2.goto(base+'/app'); await d2.evaluate("localStorage.removeItem('profitaxi.session')"); await d2.goto(base+'/app#/register'); await d2.wait_for_timeout(400)
        await d2.fill('input[autocomplete=name]','Проба'); await d2.fill('input[type=email]','proba@test.bg'); await d2.fill('input[type=password]','123456')
        await d2.select_option('select >> nth=0','Нова Загора'); await d2.wait_for_timeout(150); await d2.select_option('select >> nth=1','Ирис Такси')
        await d2.click('text=Собствена'); await d2.click('input[type=checkbox]'); await d2.click('button[type=submit]'); await d2.wait_for_timeout(500)
        days = await d2.evaluate("(()=>{const db=JSON.parse(localStorage.getItem('profitaxi.v5'));const u=db.users.find(x=>x.email==='proba@test.bg');return Math.round((new Date(u.subscription.validUntil)-(()=>{const n=new Date();return new Date(n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'))})())/864e5)})()")
        ok('Пробният период от настройките (30 дни) важи при регистрация', days==30, days)
        # Всички страници без грешки, при всички периоди
        for label in ['Общ преглед','Градове и фирми','Ефир, наеми, работа','Абонаменти']:
            await a.click(f'.adm-nav >> text={label}'); await a.wait_for_timeout(600)
            for i in range(5):
                if await a.locator('.adm-picker .seg-btn').count():
                    await a.click(f'.adm-picker .seg-btn >> nth={i}'); await a.wait_for_timeout(400)
        ok('Всички админ страници и периоди без грешки', not errs, errs[:3])
        # Мобилен админ
        m = await ctx.new_page(); await m.set_viewport_size({'width':390,'height':844}); await m.goto(base+'/admin.html#/overview'); await m.wait_for_timeout(1000)
        ok('Админ на телефон: без хоризонтално превъртане', await m.evaluate('document.documentElement.scrollWidth')<=390, await m.evaluate('document.documentElement.scrollWidth'))
        print('\n'.join(R)); print('FAILS:', sum(r.startswith('FAIL') for r in R), '/', len(R))
        await b.close()
try:
    asyncio.run(main())
except Exception as e:
    print('\n'.join(R)); print('CRASH:', str(e).split('\n')[0])
