# Маркетингов сайт: всички страници се зареждат без грешки, няма хоризонтално превъртане,
# темата се сменя (и снимките с нея), анимациите показват съдържанието, витрината и цената работят.
import sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765'
PAGES = ['/', '/about', '/features', '/how', '/pricing', '/faq']
ok = fail = 0
def check(cond, msg):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print('FAIL', msg)
shots = sys.argv[1] if len(sys.argv) > 1 else None
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, hgt in [(390, 844), (820, 1180), (1280, 900)]:
        for theme in ['light', 'dark']:  # системната тема на телефона не трябва да влияе: сайтът е винаги тъмен
            ctx = b.new_context(viewport={'width': w, 'height': hgt}, color_scheme=theme)
            pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text))
            for u in PAGES:
                pg.goto(BASE + u); pg.wait_for_load_state('networkidle')
                # превърти до долу, за да се появят всички елементи
                pg.evaluate("async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } }")
                pg.wait_for_timeout(900)
                check(pg.evaluate("document.documentElement.getAttribute('data-theme')") == theme, f'{u} {w} theme follows system')
                sw = pg.evaluate("document.documentElement.scrollWidth")
                check(sw <= w, f'{u} {w} {theme} horizontal scroll {sw}')
                wide = pg.evaluate("[...document.querySelectorAll('main h1, main h2, main h3, main p, .s-btn, .sc-tabs')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.textContent.trim().slice(0, 30))")
                check(not wide, f'{u} {w} {theme} clipped: {wide[:4]}')
                hidden = pg.evaluate("[...document.querySelectorAll('.rv')].filter(e => !e.classList.contains('in') && getComputedStyle(e).opacity === '0').length")
                check(hidden == 0, f'{u} {w} {theme} {hidden} elements not revealed')
                check(pg.locator('.s-head').count() == 1 and pg.locator('.s-foot').count() == 1, f'{u} header/footer')
                broken = pg.evaluate("[...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src)")
                check(not broken, f'{u} broken images {broken}')
                ics = pg.evaluate("[...document.querySelectorAll('[data-ic]')].filter(e => !e.querySelector('svg')).length")
                check(ics == 0, f'{u} icons missing')
                srcs = pg.evaluate("[...document.querySelectorAll('img[data-dark]')].map(i => i.getAttribute('src'))")
                check(all(f'-{theme}' in s for s in srcs), f'{u} {theme} screenshots')
                grads = pg.evaluate("[...document.querySelectorAll('.site *')].filter(e => { const b = getComputedStyle(e).backgroundImage; return b.includes('gradient') && !e.matches('.checker2, .checker, .bill-live .bill-total b, .marquee'); }).map(e => e.className).slice(0, 5)")
                check(not grads, f'{u} {theme} no gradient backgrounds: {grads}')
                if shots and w in (390, 1280):
                    pg.evaluate("scrollTo(0,0)"); pg.wait_for_timeout(200)
                    pg.screenshot(path=f'{shots}/site{u.replace("/", "_") or "_"}-{w}-{theme}.png', full_page=True)
            check(not errs, f'{w} {theme} js errors {errs}')
            ctx.close()
    # Взаимодействия
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, color_scheme='light'); pg = ctx.new_page()
    pg.goto(BASE + '/'); pg.wait_for_load_state('networkidle')
    check(pg.locator('#theme-btn').count() == 1, 'theme toggle')
    pg.click('#theme-btn')
    check(pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark', 'toggle → dark')
    check('-dark' in pg.locator('.sc-phone img').get_attribute('src'), 'screenshots swap to dark')
    pg.reload(); pg.wait_for_load_state('networkidle')
    check(pg.evaluate("document.documentElement.getAttribute('data-theme')") == 'dark', 'theme remembered')
    check(pg.evaluate("localStorage.getItem('profitaxi.theme')") is None, 'site does not touch app theme')
    pg.click('#theme-btn')
    # живата сметка стига до 2 011 €
    pg.locator('[data-bill]').scroll_into_view_if_needed(); pg.wait_for_timeout(5200)
    check(pg.locator('[data-total]').inner_text().replace('\u00a0', ' ') == '2 011 €', 'live bill ends at 2 011 € ' + pg.locator('[data-total]').inner_text())
    check(pg.locator('.bill-live.done').count() == 1 and pg.locator('.bill-punch').is_visible(), 'bill punchline shown')
    check('шегата' in pg.locator('.tease').inner_text(), 'tease at top')
    check('AmateurTaxi' in pg.locator('.punch').inner_text().replace('\n', ''), 'joke at bottom')
    check(pg.locator('.tap-hint svg').count() == 1, 'tap hint with icon')
    pg.click('#menu-btn'); check(pg.locator('#drawer').is_visible(), 'drawer opens')
    pg.click('#menu-btn')
    pg.locator('[data-showcase]').scroll_into_view_if_needed()
    pg.click('[data-shot="reservations"]')
    check('reservations' in pg.locator('.sc-phone img').get_attribute('src'), 'showcase tab')
    check('Резервации' in pg.locator('.sc-caption').inner_text() or 'резервации' in pg.locator('.sc-caption').inner_text(), 'showcase caption')
    pg.locator('.price-switch').first.scroll_into_view_if_needed()
    pg.click('.price-switch button[data-plan="y"]')
    check(pg.locator('.p-amount b').first.inner_text() == '99 €', 'yearly price')
    pg.click('.price-switch button[data-plan="m"]')
    check(pg.locator('.p-amount b').first.inner_text() == '9,99 €', 'monthly price')
    # връзки към под-страниците от началото
    for u in ['/about', '/features', '/how', '/pricing', '/faq']:
        check(pg.locator(f'main a[href="{u}"]').count() >= 1, f'home links to {u}')
    pg.goto(BASE + '/faq'); check(pg.locator('.faq details').count() >= 25, 'faq count')
    check(pg.locator('.s-nav a[aria-current]').count() == 1, 'current nav')
    pg.goto(BASE + '/#/login'); pg.wait_for_url('**/app#/login'); check(True, 'old hash redirect')
    b.close()
print(f'site: {ok} ok, {fail} fail'); sys.exit(1 if fail else 0)
