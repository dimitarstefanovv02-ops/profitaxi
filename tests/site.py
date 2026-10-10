# Маркетингов сайт: всички страници се зареждат без грешки, няма хоризонтално превъртане,
# снимките и вътрешните връзки работят, менюто и витрината работят, няма One Taxi и няма измислени отзиви.
# Пусни сървъра (python3 tests/serve.py 8765) и после: python3 tests/site.py [папка-за-снимки]
import os, re, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE = os.environ.get('SITE_BASE', 'http://localhost:8765')
PAGES = ['/', '/features', '/how', '/pricing', '/faq', '/about', '/privacy', '/terms']
ok = fail = 0
def check(cond, msg):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print('FAIL', msg)
shots = sys.argv[1] if len(sys.argv) > 1 else None
# Google Fonts може да е недостъпен в тестовата среда – спираме го, за да не бави
block_fonts = lambda r: r.abort() if 'fonts.g' in r.request.url else r.continue_()
EMOJI = re.compile('[\U0001F300-\U0001FAFF☀-➿]')
links = set()
with sync_playwright() as p:
    b = p.chromium.launch()
    for w, hgt in [(390, 844), (820, 1180), (1280, 900)]:
        ctx = b.new_context(viewport={'width': w, 'height': hgt}); ctx.route('**/*', block_fonts)
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errs.append(m.text))
        for u in PAGES:
            pg.goto(BASE + u); pg.wait_for_load_state('networkidle')
            # превърти до долу, за да се заредят снимките с loading=lazy
            pg.evaluate("async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } scrollTo(0, 0); }")
            pg.wait_for_load_state('networkidle')
            sw = pg.evaluate("document.documentElement.scrollWidth")
            check(sw <= w, f'{u} {w} horizontal scroll {sw}')
            wide = pg.evaluate("[...document.querySelectorAll('main h1, main h2, main h3, main p, main li, .btn')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e => e.textContent.trim().slice(0, 30))")
            check(not wide, f'{u} {w} clipped: {wide[:4]}')
            check(pg.locator('header.hd').count() == 1 and pg.locator('footer.ft').count() == 1, f'{u} header/footer')
            check(pg.locator('main h1').count() == 1, f'{u} one h1')
            broken = pg.evaluate("[...document.images].filter(i => i.getClientRects().length && i.complete && i.naturalWidth === 0).map(i => i.src)")
            check(not broken, f'{u} {w} broken images {broken}')
            grads = pg.evaluate("[...document.querySelectorAll('body *')].filter(e => getComputedStyle(e).backgroundImage.includes('gradient')).map(e => e.className).slice(0, 5)")
            check(not grads, f'{u} no gradient backgrounds: {grads}')
            if w == 390:
                html = pg.content(); text = pg.locator('body').inner_text()
                check(not re.search(r'one ?taxi|one такси|onetaxi', html, re.I), f'{u}: no One Taxi')
                check(not EMOJI.search(text), f'{u}: no emoji')
                check('9,99' not in text and 'AmateurTaxi' not in text.replace('\n', ''), f'{u}: no old price or joke')
                links.update(pg.evaluate("[...document.querySelectorAll('a[href^=\"/\"]')].map(a => a.getAttribute('href').split('#')[0])"))
            if shots and w in (390, 1280):
                pg.screenshot(path=f'{shots}/site{u.replace("/", "_") if u != "/" else "_index"}-{w}.png', full_page=True)
        check(not errs, f'{w} js errors {errs}')
        ctx.close()

    # Всички вътрешни връзки отговарят с 200
    for href in sorted(links):
        try: code = urllib.request.urlopen(BASE + href).status
        except Exception as e: code = getattr(e, 'code', str(e))
        check(code == 200, f'link {href} → {code}')

    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.route('**/*', block_fonts); pg = ctx.new_page()
    pg.goto(BASE + '/'); pg.wait_for_load_state('networkidle')
    # Начало: ясно заглавие, основен бутон за регистрация и вход
    check(pg.locator('.hero h1').count() == 1, 'hero headline')
    check(pg.locator('.hero a[href="/app#/register"]').first.inner_text().strip() == 'Регистрирай се безплатно', 'hero primary CTA')
    check(pg.locator('.hero a[href="/app#/login"]').count() == 1, 'hero login')
    check(pg.locator('.hero img[src*="screen-home-light"]').count() == 1, 'hero screenshot')
    check(pg.locator('.steps li').count() == 3, 'home: 3 steps')
    check(pg.locator('.grid li').count() >= 8, 'home: feature grid')
    check(pg.locator('.faq details').count() == 5, 'home: 5 questions')
    check(pg.locator('.price-num b').first.inner_text() == '0,00 €', 'home: 0,00 € (тестов период)')
    check(pg.locator('#reviews, .rev, .reviews').count() == 0, 'no reviews section')
    for u in ['/about', '/features', '/how', '/pricing', '/faq', '/privacy', '/terms']:
        check(pg.locator(f'a[href="{u}"]').count() >= 1, f'home links to {u}')
    # Витрина
    pg.click('[data-shot="reservations"]'); pg.wait_for_timeout(300)
    check('reservations' in pg.locator('.show-vis img').get_attribute('src'), 'showcase tab')
    check('резервации' in pg.locator('.show-cap').inner_text().lower(), 'showcase caption')
    check(pg.locator('[data-shot="reservations"]').get_attribute('aria-selected') == 'true', 'showcase aria-selected')
    # Мобилно меню
    pg.click('#menu-btn'); check(pg.locator('#drawer').is_visible(), 'drawer opens')
    pg.keyboard.press('Escape'); check(pg.locator('#drawer').is_hidden(), 'drawer closes on Escape')
    # Подстраници
    pg.goto(BASE + '/faq'); check(pg.locator('.faq details').count() >= 25, 'faq count')
    check(pg.locator('.hd-nav a[aria-current]').count() == 1, 'current nav')
    pg.goto(BASE + '/pricing'); check(pg.locator('.price-num b').inner_text() == '0,00 €', 'pricing: 0,00 €')
    pg.goto(BASE + '/privacy'); check('ОРЗД' in pg.locator('main').inner_text(), 'privacy text kept')
    pg.goto(BASE + '/terms'); check('Общи условия' in pg.locator('h1').inner_text(), 'terms page')
    # Стари линкове към приложението
    pg.goto(BASE + '/#/login'); pg.wait_for_url('**/app#/login'); check(True, 'old hash redirect')
    b.close()
print(f'site: {ok} ok, {fail} fail'); sys.exit(1 if fail else 0)
