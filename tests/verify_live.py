# Код по SMS и потвърждение на имейла през сървъра (Brevo в пробен режим). Сървър: node tools/dev.mjs 8766
import asyncio, re, random
N = random.randint(100000, 999999); EM = f'petar{N}@test.bg'; PH = f'0888{N}'; PHI = '359' + PH[1:]
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
        await ad.fill('input[autocomplete=username], input[type=email]', 'admin@profitaxi.bg'); await ad.fill('input[type=password]', 'admin123'); await ad.click('button[type=submit]'); await ad.wait_for_timeout(1500)
        await ad.goto(base + '/admin.html#/settings?t=verify'); await ad.wait_for_timeout(1200)
        t = await ad.locator('#app').inner_text()
        ok('Админ: „Потвърждения“ показва състоянието', 'Пробен режим' in t and 'Имейл: готов' in t, t[:160].replace('\n', ' '))
        if await ad.get_attribute('[aria-label="Код по SMS при регистрация"]', 'aria-checked') != 'true': await ad.click('[aria-label="Код по SMS при регистрация"]'); await ad.wait_for_timeout(600)
        if await ad.get_attribute('[aria-label="Потвърждение на имейла"]', 'aria-checked') != 'true': await ad.click('[aria-label="Потвърждение на имейла"]'); await ad.wait_for_timeout(600)
        await ad.evaluate(f"async () => {{ {S} await s.syncNow(); }}"); await ad.wait_for_timeout(500)
        cfg = await ad.evaluate(f"async () => {{ {S} return await sy.call('verifyCfg', {{}}, 'app'); }}")
        ok('Включено от админа', cfg.get('sms') and cfg.get('email'), cfg)

        async def reg_form(pg, by):
            await pg.goto(base + '/app#/register'); await pg.wait_for_timeout(1200)
            if by == 'phone': await pg.click('.seg-btn:has-text("С телефон")'); await pg.wait_for_timeout(200)
            await pg.fill('input[autocomplete=name]', 'Петър Тестов'); await pg.fill('input[type=password]', 'parola1')
        async def reg_finish(pg):
            await pg.select_option('select >> nth=0', 'Пловдив'); await pg.wait_for_timeout(150); await pg.select_option('select >> nth=1', index=1)
            await pg.click('button.option:has-text("Под наем")'); await pg.click('input[type=checkbox]'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(2000)
        async def box(pg): return (await pg.evaluate(f"async () => {{ {S} return await sy.call('devOutbox', {{}}, 'app'); }}"))['list']
        async def logout(pg): await pg.evaluate("async () => { const s = await import('/js/store.js'); s.logout(); }"); await pg.wait_for_timeout(1200)

        # ---------- 1) Регистрация с телефон: код по SMS, без имейл ----------
        pg = await page()
        await reg_form(pg, 'phone')
        ok('С телефон: има „Изпрати код по SMS“', await pg.locator('button:has-text("Изпрати код по SMS")').count() == 1)
        await pg.fill('input[type=tel]', PH)
        await pg.click('button:has-text("Изпрати код по SMS")'); await pg.wait_for_timeout(700)
        hint = await pg.locator('.sms-hint b').inner_text()
        ok('SMS-ът е пратен (пробен режим показва кода)', re.fullmatch(r'\d{4}', hint) is not None, hint)
        again = await pg.evaluate(f"async () => {{ {S} return await s.sendSmsCode('{PH}'); }}")
        ok('Втори код веднага – „Изчакай … секунди“', 'Изчакай' in (again.get('error') or ''), again)
        await pg.fill('input[autocomplete=one-time-code]', '0000' if hint != '0000' else '1111'); await pg.click('button:has-text("Потвърди")'); await pg.wait_for_timeout(500)
        ok('Грешен код – „Грешен код“', 'Грешен код' in await pg.locator('.err').inner_text())
        await pg.fill('input[autocomplete=one-time-code]', hint); await pg.click('button:has-text("Потвърди")'); await pg.wait_for_timeout(600)
        ok('Верен код – „Телефонът е потвърден“', await pg.locator('.sms-ok').count() == 1)
        await reg_finish(pg)
        u = await pg.evaluate(f"async () => {{ {S} return s.currentUser(); }}")
        ok('Регистрацията с телефон минава – без имейл', u and u.get('phone') == PH and not u.get('email'), u and (u.get('phone'), u.get('email')))
        ok('Без писмо за потвърждение (избрал е телефон)', not [m for m in await box(pg) if m['kind'] == 'mail' and m['to'] == EM])
        bad = await pg.evaluate(f"async () => {{ {S} return await sy.call('register', {{ by: 'phone', user: {{ name: 'X Y', phone: '0899{N}' }}, password: 'parola1', profile: {{}} }}, 'app'); }}")
        ok('Без код по SMS сървърът не регистрира', 'SMS' in (bad.get('error') or ''), bad)
        sms = [m for m in await box(pg) if m['kind'] == 'sms']
        ok('SMS-ът е до 359… с кода', sms and sms[-1]['to'] == PHI and hint in sms[-1]['text'], sms[-1] if sms else None)
        # вход с телефона
        await logout(pg)
        await pg.goto(base + '/app#/login'); await pg.wait_for_timeout(700)
        await pg.fill('input[autocomplete=username]', '0888 ' + PH[4:]); await pg.fill('input[type=password]', 'parola1'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Вход с телефон + парола', '#/login' not in pg.url, pg.url)
        # забравена парола по телефон → код по SMS → нова парола
        await logout(pg)
        await pg.goto(base + '/app#/forgot'); await pg.wait_for_timeout(700)
        await pg.fill('input[autocomplete=username]', PH); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1200)
        t = await pg.locator('#app').inner_text()
        ok('Забравена парола с телефон → „Пратихме ти SMS“', 'Пратихме ти SMS' in t, t[:120].replace('\n', ' '))
        rc = [m for m in await box(pg) if m['kind'] == 'sms' and 'нова парола' in m['text']]
        code = re.search(r'(\d{4})', rc[-1]['text']).group(1) if rc else ''
        await pg.fill('input[autocomplete=one-time-code]', code); await pg.fill('input[type=password] >> nth=0', 'novaparola'); await pg.fill('input[type=password] >> nth=1', 'novaparola')
        await pg.click('button:has-text("Смени паролата")'); await pg.wait_for_timeout(1000)
        ok('Нова парола с кода от SMS → вход', '#/login' in pg.url, pg.url)
        await pg.fill('input[autocomplete=username]', PH); await pg.fill('input[type=password]', 'novaparola'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Вход с новата парола (телефон)', '#/login' not in pg.url, pg.url)

        # забравена текуща парола отвътре (Лични данни → Смяна на паролата → „Забравих текущата парола“)
        await pg.evaluate(f"async () => {{ {S} s.updateProfile({{ onboarded: true }}); }}")
        await pg.goto(base + '/app#/profile'); await pg.wait_for_timeout(1000)
        await pg.click('text=Смяна на паролата'); await pg.wait_for_timeout(400)
        await pg.click('text=Забравих текущата парола'); await pg.wait_for_timeout(1500)
        st = await pg.locator('body').inner_text()
        ok('Отвътре: „Забравих текущата парола“ праща SMS код', 'Пратихме SMS' in st or 'Изчакай' in st, st[:100].replace('\n', ' '))
        # ---------- 2) Регистрация с имейл: линк по имейла, без SMS ----------
        pg = await page()
        await reg_form(pg, 'email')
        ok('С имейл: без „Изпрати код по SMS“', await pg.locator('button:has-text("Изпрати код по SMS")').count() == 0)
        await pg.fill('input[type=email]', EM)
        await reg_finish(pg)
        u = await pg.evaluate(f"async () => {{ {S} return s.currentUser(); }}")
        ok('Регистрацията с имейл минава без SMS', u and u.get('email') == EM, pg.url)
        ok('Имейлът още не е потвърден', u and u.get('emailVerified') is False, u and u.get('emailVerified'))
        mail = [m for m in await box(pg) if m['kind'] == 'mail' and m['to'] == EM]
        ok('Писмо „Потвърди имейла“ е пратено', mail and 'Потвърди' in mail[-1]['subject'], [m['subject'] for m in mail])
        await pg.evaluate(f"async () => {{ {S} s.updateProfile({{ onboarded: true }}); }}")
        await pg.goto(base + '/app#/home'); await pg.wait_for_timeout(1200)
        ok('На „Днес“ има „Потвърди имейла си“', await pg.locator('.verify-card').count() == 1)
        link = re.search(r'href="([^"]+verify=[^"]+)"', mail[-1]['html']).group(1)
        await pg.goto(link.replace('http://localhost', base) if link.startswith('http://localhost/') else link); await pg.wait_for_timeout(1500)
        ok('Линкът води към „Имейлът е потвърден“', 'verified?ok=1' in pg.url and 'Имейлът е потвърден' in await pg.locator('#app').inner_text(), pg.url)
        await pg.evaluate(f"async () => {{ {S} await s.syncNow(); }}"); await pg.goto(base + '/app#/home'); await pg.wait_for_timeout(1200)
        ok('След потвърждение напомнянето го няма', await pg.locator('.verify-card').count() == 0)
        await logout(pg)
        await pg.goto(base + '/app#/forgot'); await pg.wait_for_timeout(800)
        await pg.fill('input[autocomplete=username]', EM); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('„Забравена парола“ с имейл: „Провери имейла си“', 'Провери имейла си' in await pg.locator('#app').inner_text())
        rm = [m for m in await box(pg) if m['kind'] == 'mail' and 'Нова парола' in m['subject'] and m['to'] == EM]
        tok = re.search(r'#/reset/([a-f0-9]+)', rm[-1]['html']).group(1) if rm else ''
        await pg.goto(base + '/app#/reset/' + tok); await pg.wait_for_timeout(700)
        await pg.fill('input[type=password] >> nth=0', 'novaparola'); await pg.fill('input[type=password] >> nth=1', 'novaparola'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1000)
        ok('Новата парола е запазена → вход', '#/login' in pg.url, (pg.url, await pg.locator('.err').all_inner_texts()))
        await pg.fill('input[autocomplete=username]', EM); await pg.fill('input[type=password]', 'novaparola'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(1500)
        ok('Вход с имейл и новата парола', '#/login' not in pg.url, pg.url)
        reuse = await pg.evaluate(f"async () => {{ {S} return await sy.call('resetPw', {{ token: '{tok}', password: 'drugaparola' }}, 'app'); }}")
        ok('Линкът за нова парола работи само веднъж', 'изтекъл' in (reuse.get('error') or ''), reuse)
        ok('Без грешки', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print(f"FAILS: {sum(1 for r in R if r.startswith('FAIL'))} / {len(R)}")
try: asyncio.run(main())
except Exception as e: print('\n'.join(R)); print('CRASH', str(e)[:300])
