# „Колата ми“ и махнатият „Лизинг“
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); c=await b.new_context(viewport={'width':390,'height':844})
    await c.add_init_script("try{localStorage.setItem('profitaxi.installed','1');localStorage.setItem('profitaxi.paidMode','1')}catch(e){}")
    pg=await c.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); fails=[]
    def ok(n,cnd,x=''):
      print(('PASS ' if cnd else 'FAIL ')+' '+n+(f'  [{x}]' if x!='' else ''))
      if not cnd: fails.append(n)
    S="const s=await import('/js/store.js');"
    await pg.goto('http://localhost:8765/app'); await pg.wait_for_timeout(300)
    await pg.evaluate("async()=>{"+S+"s.login('ivan@demo.bg','demo123'); s.updateProfile({tour:'done'})}")
    # лизинг: демо шофьорката Мария вече е „Собствена“ с месечен разход „Лизинг“
    r = await pg.evaluate("async()=>{"+S+"const d=s._debug.db; const m=d.users.find(u=>u.email==='maria@demo.bg'); return [d.profiles[m.id].carType, d.costs.filter(c=>c.userId===m.id&&c.category==='leasing').map(c=>[c.name,c.amount,!!c.system])]}")
    ok('Лизингът вече не е вид кола, а месечен разход', r[0]=='own' and r[1]==[['Лизинг',420,False]], r)
    r = await pg.evaluate("async()=>{const c=await import('/js/constants.js'); return [Object.keys(c.CAR_TYPES), !!c.COST_CATS.leasing.system]}")
    ok('Изборът на кола е само Собствена / Под наем', r==[['own','rent'],False], r)
    await pg.goto('http://localhost:8765/app#/car'); await pg.wait_for_timeout(400)
    ok('„Колата и ефирът“ без бутон „Лизинг“', 'Лизинг' not in await pg.inner_text('.option-grid >> nth=0'))
    # Колата ми
    await pg.goto('http://localhost:8765/app#/me'); await pg.wait_for_timeout(400)
    await pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(e=>e.remove())")
    ok('Профил → „Колата ми“', await pg.locator('a.big-link:has-text("Колата ми")').count()==1)
    await pg.click('a.big-link:has-text("Колата ми")'); await pg.wait_for_timeout(400)
    ok('Без покупка: предлага „Въведи покупката“', await pg.locator('text=Въведи покупката').count()==1)
    net0 = await pg.evaluate("async()=>{const c=await import('/js/calc.js');"+S+"const d=s.myData(); const t=new Date().toISOString().slice(0,10); return c.periodStats(d, t.slice(0,8)+'01', t).net}")
    await pg.click('text=Въведи покупката'); await pg.wait_for_timeout(300)
    await pg.fill('.sheet input[type=number] >> nth=0','18000'); await pg.evaluate("(()=>{const i=document.querySelector('.sheet input[type=date]');i.value='2026-03-01';i.dispatchEvent(new Event('change',{bubbles:true}))})()"); await pg.click('.sheet >> text=Запази'); await pg.wait_for_timeout(400)
    t = (await pg.inner_text('.car-inv')).replace('\u202f',' ').replace('\xa0',' ')
    ok('Показва избити, остават, работни дни и часове', all(x in t for x in ['Избити до момента','18 000','Остават','Работни дни','Работни часове']), t[:120])
    await pg.click('.chip:has-text("Добави")'); await pg.wait_for_timeout(300)
    await pg.fill('.sheet input[type=number] >> nth=0','240'); await pg.fill('.sheet input[type=number] >> nth=1','263100'); await pg.fill('.sheet input[maxlength="300"]','Накладки')
    await pg.click('.sheet >> text=Запази'); await pg.wait_for_timeout(400)
    ok('Ремонтът е в списъка с дата, км и бележка', '263' in await pg.inner_text('.car-log') and 'Накладки' in await pg.inner_text('.car-log'))
    net1 = await pg.evaluate("async()=>{const c=await import('/js/calc.js');"+S+"const d=s.myData(); const t=new Date().toISOString().slice(0,10); return c.periodStats(d, t.slice(0,8)+'01', t).net}")
    ok('Ремонтът намалява чистото за месеца с 240 €', abs((net0-net1)-240) < 0.01, [round(net0,2), round(net1,2)])
    await pg.goto('http://localhost:8765/app#/costs'); await pg.wait_for_timeout(400)
    ok('Ремонтът не излиза в „Постоянни разходи“', 'Накладки' not in await pg.inner_text('#app'))
    await pg.goto('http://localhost:8765/app#/vehicle'); await pg.wait_for_timeout(400)
    await pg.click('.cl-row:has-text("Накладки")'); await pg.wait_for_timeout(300)
    await pg.click('.sheet >> text=Изтрий'); await pg.wait_for_timeout(300); await pg.click('.sheet .btn-danger'); await pg.wait_for_timeout(500)
    ok('Ремонтът се изтрива', await pg.locator('.cl-row:has-text("Накладки")').count()==0)
    await pg.evaluate("async()=>{"+S+"s.updateProfile({carType:'rent'})}"); await pg.goto('http://localhost:8765/app#/me'); await pg.wait_for_timeout(400)
    ok('При кола под наем „Колата ми“ я няма', await pg.locator('a.big-link:has-text("Колата ми")').count()==0)
    ok('Без грешки в JS', not errs, errs)
    print(f'FAILS: {len(fails)} / 12'); await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())
