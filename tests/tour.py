# Разходката за нов шофьор: 20 стъпки, отваря страниците, връща на „Днес“
import asyncio, sys
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844})
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto('http://localhost:8765/app#/register'); await pg.wait_for_timeout(400)
    await pg.evaluate("""async()=>{const s=await import('/js/store.js'); const c=s.sendSmsCode('0888999111'); s.verifySmsCode('0888999111', c.demoCode);
      await s.register({name:'Нов Шофьор', email:'nov@mail.bg', password:'parola1', phone:'0888999111', city:'Пловдив', company:'Еко Такси 6155', carType:'own'}); s.updateProfile({onboarded:true});}""")
    await pg.goto('http://localhost:8765/app#/home'); await pg.reload(); await pg.wait_for_timeout(1200)
    seen=[]; holes=0; total=None
    while await pg.locator('.tour-card').count() and len(seen) < 30:
      st=await pg.inner_text('.tour-step'); print('STEP', repr(st)); total=st.split(' от ')[1] if ' от ' in st else total
      seen.append(await pg.evaluate("location.hash.split('?')[0]"))
      if await pg.evaluate("getComputedStyle(document.querySelector('.tour-hole')).display")=='block': holes+=1
      await pg.click('.tour-card .btn-primary'); await pg.wait_for_timeout(350)
    pages=sorted(set(seen))
    end=await pg.evaluate("location.hash"); state=await pg.evaluate("async()=>{const s=await import('/js/store.js'); return s.getProfile().tour}")
    fails=[]
    def ok(c,n,x=''):
      print(('PASS ' if c else 'FAIL ')+' '+n+(f'  [{x}]' if x!='' else ''))
      if not c: fails.append(n)
    ok(4 <= len(seen) <= 6 and str(len(seen))==total, 'Разходката е кратка (до 6 стъпки)', len(seen))
    ok(all(x in pages for x in ['#/home','#/shift/new']), 'Показва „Днес“ и въвеждането на смяна', pages)
    ok(holes >= len(seen)-2, 'Почти всяка стъпка посочва нещо на екрана', holes)
    ok(end=='#/home' and state=='done', 'Накрая се връща на „Днес“ и не се пуска пак', [end,state])
    await pg.reload(); await pg.wait_for_timeout(1200)
    ok(await pg.locator('.tour').count()==0, 'След презареждане разходката не се показва')
    await pg.goto('http://localhost:8765/app#/me'); await pg.wait_for_timeout(400)
    await pg.click('.big-link:has-text("Кратка разходка")'); await pg.wait_for_timeout(1200)
    ok(await pg.locator('.tour').count()==1, 'Пуска се пак от Профил → Помощ → Кратка разходка')
    await pg.click('.tour-skip'); await pg.wait_for_timeout(300)
    await pg.goto('http://localhost:8765/app#/me'); await pg.wait_for_timeout(400)
    ok(await pg.locator('.nav a[href="#/me"]').inner_text()=='Профил', 'Третият бутон се казва „Профил“')
    await pg.click('text=Презентация'); await pg.wait_for_timeout(500)
    ok('#/guide' in pg.url and await pg.locator('.guide-page').count()==16 and await pg.locator('.guide-next').count()==0, 'Профил → Презентация: 16 страници, без „Нататък“')
    r=await pg.evaluate("async()=>[(await fetch('/guide/p16.webp')).status,(await fetch('/guide/Chisto-vavedenie.pdf')).status]")
    ok(r==[200,200], 'Картинките и PDF-ът съществуват', r)
    ok(not errs, 'Без грешки в JS', errs)
    print(f'FAILS: {len(fails)} / 10'); await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())
