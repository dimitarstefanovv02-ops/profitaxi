# Админ → Днес: „Карта на деня“ (с фалшив Leaflet, защото CDN-ът е недостъпен в тестовете)
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); c=await b.new_context(viewport={'width':1280,'height':1200})
    await c.add_init_script(open('tests/fakeleaflet.js').read())
    await c.add_init_script("try{localStorage.setItem('profitaxi.adminTour','done');localStorage.setItem('profitaxi.paidMode','1')}catch(e){}")
    pg=await c.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); fails=[]
    def ok(n,cnd,x=''):
      print(('PASS ' if cnd else 'FAIL ')+' '+n+(f'  [{x}]' if x!='' else ''))
      if not cnd: fails.append(n)
    await pg.goto('http://localhost:8765/admin.html'); await pg.wait_for_timeout(400)
    await pg.fill('input[type=email]','admin@profitaxi.bg'); await pg.fill('input[type=password]','admin123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
    await pg.goto('http://localhost:8765/admin.html#/overview'); await pg.wait_for_timeout(1000)
    ok('„Карта на деня“ е под „Днес се случи“', await pg.eval_on_selector('[data-zone="overview"]', "z=>[...z.children].map(c=>c.dataset.k).slice(0,2).join()")=='happened,hapmap')
    cols = await pg.evaluate("[...document.querySelectorAll('.hap.hc')].map(e=>getComputedStyle(e).getPropertyValue('--hc').trim())")
    ok('Всеки вид в „Днес се случи“ е в различен цвят', len(cols)>=4 and len(set(cols))==len(cols), cols)
    n = await pg.locator('.hmap .hm').count(); bad = await pg.locator('.hmap .hm.bad').count()
    ok('Градовете са на картата, проблемните – с червен ореол', n>0 and bad>0, [n,bad])
    seg = await pg.evaluate("getComputedStyle(document.querySelector('.hmap .hm:not(.quiet)')).backgroundImage")
    ok('Маркерът е оцветен по видовете събития', 'conic-gradient' in seg, seg[:60])
    pop = await pg.evaluate("document.querySelector('.hmap .leaflet-marker-icon').dataset.popup")
    ok('Градът има подробности със „Виж“', 'Виж' in pop or 'спокойно' in pop, pop[:80])
    before = await pg.locator('.hmap .hm.bad').count()
    for k in ['нови сигнала','въпроса от шофьори','изтекли абонамента']:
      if await pg.locator(f'.hm-key:has-text("{k}")').count(): await pg.click(f'.hm-key:has-text("{k}")'); await pg.wait_for_timeout(300)
    ok('Цветът се скрива от легендата (без проблемите няма червени ореоли)', await pg.locator('.hmap .hm.bad').count()==0 and before>0)
    ok('Без грешки в JS', not errs, errs)
    print(f'FAILS: {len(fails)} / 7'); await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())
