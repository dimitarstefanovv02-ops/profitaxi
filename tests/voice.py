# „Кажи го“: с фалшив микрофон (вкл. повторенията на Android), грешки и телефон без разпознаване
import asyncio, sys
from playwright.async_api import async_playwright
FAKE = """
window.__voice = { mode: 'android' };
class FakeSR { constructor(){ this.lang=''; }
  start(){ const m = window.__voice.mode; setTimeout(() => {
    if (m === 'deny') { this.onerror && this.onerror({ error: 'not-allowed' }); this.onend && this.onend(); return; }
    if (m === 'silent') { this.onend && this.onend(); return; }
    const parts = m === 'android' ? ['кеш', 'кеш 120', 'кеш 120 карта 40'] : ['кеш 120 карта 40'];
    const res = parts.map((t, i) => Object.assign([{ transcript: t }], { isFinal: true }));
    this.onresult && this.onresult({ results: res });
    setTimeout(() => this.onend && this.onend(), 50);
  }, 100); }
  stop(){ this.onend && this.onend(); } abort(){} }
"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(); fails=[]
    def ok(n,c,x=''):
      print(('PASS ' if c else 'FAIL ')+' '+n+(f'  [{x}]' if x!='' else ''));
      if not c: fails.append(n)
    async def page(fake):
      ctx=await b.new_context(viewport={'width':390,'height':844})
      await ctx.add_init_script("try{localStorage.setItem('profitaxi.paidMode','1')}catch(e){}")
      if fake: await ctx.add_init_script(FAKE + "window.webkitSpeechRecognition = FakeSR; window.SpeechRecognition = FakeSR;")
      else: await ctx.add_init_script("delete window.webkitSpeechRecognition; delete window.SpeechRecognition; window.webkitSpeechRecognition = undefined; window.SpeechRecognition = undefined;")
      pg=await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
      await pg.goto('http://localhost:8765/app'); await pg.wait_for_timeout(300)
      await pg.evaluate("async()=>{const s=await import('/js/store.js'); s.login('ivan@demo.bg','demo123'); s.updateProfile({tour:'done'})}")
      await pg.goto('http://localhost:8765/app#/shift/new'); await pg.wait_for_timeout(600)
      await pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(e=>e.remove())")
      return pg, errs
    tiles = "async()=>[...document.querySelectorAll('.tile')].slice(0,2).map(t=>t.innerText.replace(/\\s+/g,' '))"
    pg, errs = await page(True)
    await pg.click('button:has-text("Кажи го")'); await pg.wait_for_timeout(800)
    t = await pg.evaluate(tiles)
    ok('Android: „кеш 120 карта 40“ се попълва веднъж (без двойно)', '120' in t[0] and '240' not in t[0] and '40' in t[1], t)
    await pg.evaluate("window.__voice.mode='deny'")
    await pg.click('button:has-text("Кажи го")'); await pg.wait_for_timeout(600)
    st = await pg.inner_text('.voice-live')
    ok('Забранен микрофон: остава отворено с обяснение', 'забранен' in st and await pg.locator('.sheet .voice-input').count()==1, st)
    await pg.fill('.voice-input', 'гориво 35 и 30 литра бакшиш 5'); await pg.click('.sheet >> text=Добави'); await pg.wait_for_timeout(500)
    ok('След грешка може да се напише и да се добави', await pg.locator('.sheet-wrap').count()==0 and '35' in await pg.inner_text('#app'))
    await pg.evaluate("window.__voice.mode='silent'")
    await pg.click('button:has-text("Кажи го")'); await pg.wait_for_timeout(600)
    st = await pg.inner_text('.voice-live'); ok('Тишина: „Не чух нищо“ и бутон „Слушай пак“', 'Не чух' in st and await pg.locator('.sheet button:has-text("Слушай пак")').count()==1, [st, await pg.locator('.sheet-wrap').count()])
    await pg.fill('.voice-input', 'нещо без числа'); await pg.click('.sheet >> text=Добави'); await pg.wait_for_timeout(200)
    ok('Без сума: казва какво не е разбрало, не затваря', 'Не разбрах' in await pg.inner_text('.voice-live') and await pg.locator('.sheet-wrap').count()==1)
    ok('Без грешки в JS (с микрофон)', not errs, errs)
    pg2, errs2 = await page(False)
    ok('Без разпознаване: „Кажи го“ пак е там', await pg2.locator('button:has-text("Кажи го")').count()==1)
    await pg2.click('button:has-text("Кажи го")'); await pg2.wait_for_timeout(500)
    ok('Без разпознаване: насочва към 🎤 на клавиатурата', 'клавиатурата' in await pg2.inner_text('.voice-live'))
    await pg2.fill('.voice-input', 'кеш сто и двайсет'); await pg2.keyboard.press('Enter'); await pg2.wait_for_timeout(400)
    t = await pg2.evaluate(tiles)
    ok('Написано с думи „кеш сто и двайсет“ → 120', '120' in t[0], t)
    ok('Без грешки в JS (без микрофон)', not errs2, errs2)
    print(f'FAILS: {len(fails)} / 10'); await b.close(); sys.exit(1 if fails else 0)
asyncio.run(main())
