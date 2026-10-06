# Гласът през облака (Whisper): истински запис от фалшивия микрофон на Chromium → сървър → поле → суми
# Сървъри: GROQ_MOCK=1 node tools/dev.mjs 8767  и  node tools/dev.mjs 8766 (без ключ)
import asyncio, sys, random
from playwright.async_api import async_playwright
INIT = "try{localStorage.setItem('profitaxi.live','1');localStorage.setItem('profitaxi.installed','1')}catch(e){}"
async def run(b, base, phone):
    ctx = await b.new_context(viewport={'width':390,'height':844}, permissions=['microphone'])
    await ctx.add_init_script(INIT)
    pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(base + '/app#/register'); await pg.wait_for_timeout(400)
    r = await pg.evaluate("""async()=>{const s=await import('/js/store.js'); const c=s.sendSmsCode('%s'); s.verifySmsCode('%s', c.demoCode);
      const r = await s.register({name:'Глас Тест', email:'glas%s@mail.bg', password:'parola1', phone:'%s', city:'Пловдив', company:'Еко Такси 6155', carType:'own'}); s.updateProfile({onboarded:true, tour:'done'}); return r.error||'ok'}""" % (phone, phone, phone[-6:], phone))
    await pg.goto(base + '/app#/shift/new'); await pg.wait_for_timeout(700)
    await pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(e=>e.remove())")
    await pg.click('button:has-text("Кажи го")'); await pg.wait_for_timeout(1800)
    rec = await pg.evaluate("document.querySelector('.voice-mic')?.classList.contains('on')")
    await pg.click('.sheet button:has-text("Готово")'); await pg.wait_for_timeout(1500)
    return pg, errs, r, rec
async def main():
    fails=[]
    def ok(n,c,x=''):
        print(('PASS ' if c else 'FAIL ')+' '+n+(f'  [{x}]' if x!='' else ''))
        if not c: fails.append(n)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
        pg, errs, r, rec = await run(b, 'http://localhost:8767', '0888' + str(random.randint(100000,999999)))
        ok('Регистрация (облак)', r == 'ok', r)
        ok('Микрофонът записва', rec)
        t = await pg.evaluate("[...document.querySelectorAll('.tile')].slice(0,2).map(t=>t.innerText.replace(/\\s+/g,' '))")
        ok('Облакът разпозна „Кеш 120, карта 40.“ и попълни сумите', '120' in t[0] and '40' in t[1], t)
        ok('Без грешки в JS', not errs, errs)
        pg2, errs2, r2, rec2 = await run(b, 'http://localhost:8766', '0888' + str(random.randint(100000,999999)))
        st = await pg2.inner_text('.voice-live') if await pg2.locator('.voice-live').count() else ''
        flag = await pg2.evaluate("sessionStorage.getItem('profitaxi.cloudVoiceOff')")
        ok('Без ключ за облака: минава на гласа на браузъра', flag == '1' and 'Слушай пак' in st, [flag, st])
        ok('Без грешки в JS (без ключ)', not errs2, errs2)
        await b.close()
    print(f'FAILS: {len(fails)} / 6'); sys.exit(1 if fails else 0)
asyncio.run(main())
