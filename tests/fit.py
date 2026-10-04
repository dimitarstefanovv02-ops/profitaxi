# Проверка: никъде няма отрязани числа или хоризонтално превъртане (390 / 820 / 1280 px)
import asyncio, sys
from playwright.async_api import async_playwright
CHECK = """() => {
  const sel = '.kpi-value, .stat-value, .hero-num, .meter-value, .big-net, .tile-val, .meter-cell b, .donut-center b, .save-bar .sum b, .cost-amt b, .shift-amt b, .rec-title b, .win b, .card-title .num, .mini-kpi b, .lg-row b, .hero-chip, .kpi-label, .chip';
  const bad = [];
  document.querySelectorAll(sel).forEach((el) => { if (el.offsetParent && el.scrollWidth > el.clientWidth + 1) bad.push(el.className + ': ' + el.textContent.trim().slice(0, 30)); });
  // елементи, излизащи извън картата си
  document.querySelectorAll('.kpi, .stat, .mini-kpi, .card, .tile, .meter-cell').forEach((c) => { const r = c.getBoundingClientRect(); c.querySelectorAll('*').forEach((x) => { const q = x.getBoundingClientRect(); if (q.width && q.right > r.right + 2 && !x.closest('.tbl-wrap') && getComputedStyle(x).position !== 'absolute') bad.push('OUT ' + (x.className || x.tagName) + ': ' + x.textContent.trim().slice(0, 30)); }); });
  return { bad: [...new Set(bad)].slice(0, 12), sw: document.documentElement.scrollWidth, w: innerWidth };
}"""
async def main():
    fails = 0
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for w in (390, 820, 1280):
            ctx = await b.new_context(viewport={'width': w, 'height': 900}); pg = await ctx.new_page()
            await pg.goto('http://localhost:8765/app'); await pg.evaluate('localStorage.clear()'); await pg.goto('http://localhost:8765/app')
            await pg.fill('input[type=email]', 'ivan@demo.bg'); await pg.fill('input[type=password]', 'demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(600)
            pages = [('/app', r) for r in ['#/home', '#/shifts', '#/stats', '#/costs', '#/profile', '#/shift/new']]
            await pg.evaluate("localStorage.setItem('profitaxi.asession','admin')")
            pages += [('/admin.html', r) for r in ['#/overview', '#/geo', '#/market', '#/drivers', '#/subs', '#/new', '#/settings']]
            for base, route in pages:
                await pg.goto('http://localhost:8765' + base + route); await pg.wait_for_timeout(700)
                # година в статистиките – най-големите числа
                if await pg.locator('.seg-btn:has-text("Година")').count():
                    await pg.click('.seg-btn:has-text("Година") >> nth=0'); await pg.wait_for_timeout(700)
                r = await pg.evaluate(CHECK)
                ok = not r['bad'] and r['sw'] <= r['w']
                fails += not ok
                print(('PASS' if ok else 'FAIL'), w, base + route, '' if ok else r)
            await ctx.close()
        await b.close()
    print('FAILS:', fails)
asyncio.run(main())
