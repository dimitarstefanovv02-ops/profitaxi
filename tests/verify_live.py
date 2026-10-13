# Код по SMS и потвърждение на имейла през сървъра (Brevo в пробен режим). Сървър: node tools/dev.mjs 8766
import asyncio, re
from playwright.async_api import async_playwright
base = 'http://localhost:8766'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
INIT = "try{localStorage.setItem('profitaxi.live','1');sessionStorage.setItem('profitaxi.oneIntro','1');localStorage.setItem('profitaxi.adminTour','done')}catch(e){}"
S = "const s = await import('/js/store.js'); const sy = await import('/js/sync.js');"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        async def page():
            ctx = await b.new_context(viewport={'width': 390, 'height': 844}); await ctx.add_init_script(INIT)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.set_default_timeout(10000); return pg
        ad = await page()
        await ad.goto(base + '/admin.html'); await ad.wait_for_timeout(600)
        await ad.fill('input[type=email]', 'admin@profitaxi.bg'); await ad.fill('input[type=password]', 'admin123'); await ad.click('button[type=submit]'); await ad.wait_for_timeout(1500)
        await ad.goto(base + '/admin.html#/settings?t=verify'); await ad.wait_for_timeout(1200)
        t = await ad.locator('#app').inner_text()
        ok('Админ: „Потвърждения“ показва състоянието', 'Пробен режим' in t and 'Имейл: готов' in t, t[:160].replace('\n', ' '))
        await ad.click('[aria-label="Код по SMS при регистрация"]'); await ad.wait_for_timeout(300)
        await ad.click('[aria-label="Потвърждение на имейла"]'); await ad.wait_for_timeout(800)
        await ad.evaluate(f"async () => {{ {S} await s.syncNow(); }}"); await ad.wait_for_timeout(500)
        print('LOCAL', await ad.evaluate(f"async () => {{ {S} return s.admin.settings().verify; }}"), await ad.locator('[aria-label="Код по SMS при регистрация"]').count())
        cfg = await ad.evaluate(f"async () => {{ {S} return await sy.call('verifyCfg', {{}}, 'app'); }}")
        ok('Включено от админа', cfg.get('sms') and cfg.get('email'), cfg)

        pg = await page()
        await pg.goto(base + '/app#/register'); await pg.wait_for_timeout(1200)
        ok('Регистрацията показва „Изпрати код по SMS“', await pg.locator('button:has-text("Изпрати код по SMS")').count() == 1)
        await pg.fill('input[autocomplete=name]', 'Петър Тестов'); await pg.fill('input[type=email]', 'petar@test.bg'); await pg.fill('input[type=password]', 'parola1')
        await pg.fill('input[type=tel]', '0888 777 666')
        await pg.click('button:has-text("Изпрати код по SMS")'); await pg.wait_for_timeout(700)
        hint = await pg.locator('.sms-hint b').inner_text()
        ok('SMS-ът е пратен (пробен режим показва кода)', re.fullmatch(r'\d{4}', hint) is not None, hint)
        again = await pg.evaluate(f"async () => {{ {S} return await s.sendSmsCode('0888777666'); }}")
        ok('Втори код веднага – „Изчакай … секунди“', 'Изчакай' in (again.get('error') or ''), again)
        await pg.fill('input[autocomplete=one-time-code]', '0000' if hint != '0000' else '1111'); await pg.click('button:has-text("Потвърди")'); await pg.wait_for_timeout(500)
        ok('Грешен код – „Грешен код“', 'Грешен код' in await pg.locator('.err').inner_text())
        await pg.fill('input[autocomplete=one-time-code]', hint); await pg.click('button:has-text("Потвърди")'); await pg.wait_for_timeout(600)
        ok('Верен код – „Телефонът е потвърден“', await pg.locator('.sms-ok').count() == 1)
        await pg.select_option('select >> nth=0', 'Пловдив'); await pg.wait_for_timeout(150); await pg.select_option('select >> nth=1', index=1)
        await pg.click('button.option:has-text("Под наем")'); await pg.click('input[type=checkbox]'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(2000)
        u = await pg.evaluate(f"async () => {{ {S} return s.currentUser(); }}")
        ok('Регистрацията минава след кода', u and u.get('email') == 'petar@test.bg', pg.url)
        ok('Имейлът още не е потвърден', u and u.get('emailVerified') is False, u and u.get('emailVerified'))
        # без потвърден телефон сървърът отказва
        bad = await pg.evaluate(f"async () => {{ {S} return await sy.call('register', {{ user: {{ name: 'X Y', email: 'x@y.bg', phone: '0899111222' }}, password: 'parola1', profile: {{}} }}, 'app'); }}")
        ok('Без код по SMS сървърът не регистрира', 'SMS' in (bad.get('error') or ''), bad)
        # писмото „Потвърди имейла“
        box = (await pg.evaluate(f"async () => {{ {S} return await sy.call('devOutbox', {{}}, 'app'); }}"))['list']
        mail = [m for m in box if m['kind'] == 'mail' and m['to'] == 'petar@test.bg']
        ok('Писмо „Потвърди имейла“ е пратено', mail and 'Потвърди' in mail[-1]['subject'], [m['subject'] for m in mail])
        sms = [m for m in box if m['kind'] == 'sms']
        ok('SMS-ът е до 359888777666 с кода', sms and sms[-1]['to'] == '359888777666' and hint in sms[-1]['text'], sms[-1] if sms else None)
        await pg.goto(base + '/app#/home'); await pg.wait_for_timeout(1200)
        ok('На „Днес“ има „Потвърди имейла си“', await pg.locator('.verify-card').count() == 1)
        link = re.search(r'href="([^"]+verify=[^"]+)"', mail[-1]['html']).group(1)
        await pg.goto(link.replace('http://localhost', base) if link.startswith('http://localhost/') else link); await pg.wait_for_timeout(1500)
        ok('Линкът води към „Имейлът е потвърден“', 'verified?ok=1' in pg.url and 'Имейлът е потвърден' in await pg.locator('#app').inner_text(), pg.url)
        await pg.evaluate(f"async () => {{ {S} await s.syncNow(); }}"); await pg.goto(base + '/app#/home'); await pg.wait_for_timeout(1200)
        ok('След потвърждение напомнянето го няма', await pg.locator('.verify-card').count() == 0)
        # забравена парола → линк → нова парола
        await pg.evaluate("async () => { const s = await import('/js/store.js'); s.logout(); }")
        await pg.goto(base + '/app#/forgot'); await pg.wait_for_timeout(600)
        await pg.fill('input[type=email]', 'petar@test.bg'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('„Забравена парола“: „Провери имейла си“', 'Провери имейла си' in await pg.locator('#app').inner_text())
        box = (await pg.evaluate(f"async () => {{ {S} return await sy.call('devOutbox', {{}}, 'app'); }}"))['list']
        rm = [m for m in box if m['kind'] == 'mail' and 'Нова парола' in m['subject']]
        tok = re.search(r'#/reset/([a-f0-9]+)', rm[-1]['html']).group(1) if rm else ''
        await pg.goto(base + '/app#/reset/' + tok); await pg.wait_for_timeout(700)
        await pg.fill('input[type=password] >> nth=0', 'novaparola'); await pg.fill('input[type=password] >> nth=1', 'novaparola'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('Новата парола е запазена → вход', '#/login' in pg.url, pg.url)
        await pg.fill('input[type=email]', 'petar@test.bg'); await pg.fill('input[type=password]', 'novaparola'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Вход с новата парола', '#/login' not in pg.url, pg.url)
        reuse = await pg.evaluate(f"async () => {{ {S} return await sy.call('resetPw', {{ token: '{tok}', password: 'drugaparola' }}, 'app'); }}")
        ok('Линкът за нова парола работи само веднъж', 'изтекъл' in (reuse.get('error') or ''), reuse)
        ok('Без грешки', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
try: asyncio.run(main())
except Exception as e: print('\n'.join(R)); print('CRASH', str(e)[:300])
