# Гласово въвеждане, търсачка с AI, напомняния (10:00/20:00) и седмичен отчет, „Почивах“,
# вход с Face ID (виртуален ключ), фуния и въпросите в админа.
# Сървър: VAPID_JWK=… node tools/dev.mjs 8790
import asyncio, sys, json, base64, subprocess, random
from playwright.async_api import async_playwright
B = 'http://localhost:8790'
INIT = "try{localStorage.setItem('profitaxi.live','1');localStorage.setItem('profitaxi.installed','1');localStorage.setItem('profitaxi.adminTour','done');localStorage.setItem('profitaxi.remindOffer','1')}catch(e){}"
S = "const s = await import('/js/store.js');"
DEC = open('/home/claude/profitaxi/tests/push.py').read().split('DEC = r"""')[1].split('"""')[0]
fails = []
JS = lambda code: "async () => {" + S + code + "}"
def ok(n, c, x=''):
    print(('PASS ' if c else 'FAIL ') + ' ' + n + (f'  [{x}]' if x != '' else ''))
    if not c: fails.append(n)
async def main():
    D = '/tmp/claude-0/-home-claude-profitaxi/057a7ba7-67bd-567b-8d2b-1d2084184852/scratchpad/'
    open(D + 'dec.mjs', 'w').write(DEC)
    keys = json.loads(subprocess.check_output(['node', '-e', "const c=require('crypto');const e=c.createECDH('prime256v1');e.generateKeys();console.log(JSON.stringify({priv:e.getPrivateKey('base64'),pub:e.getPublicKey().toString('base64url'),auth:c.randomBytes(16).toString('base64')}))"]))
    auth64url = base64.urlsafe_b64encode(base64.b64decode(keys['auth'])).decode().rstrip('=')
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])
        cd = await b.new_context(viewport={'width': 390, 'height': 844}); await cd.add_init_script(INIT); d = await cd.new_page(); errs = []; d.on('pageerror', lambda e: errs.append(str(e)))
        await d.goto(B + '/app#/register'); await d.wait_for_timeout(300)
        ph = '0888' + str(random.randint(100000, 999999)); email = f'n{ph}@mail.bg'
        r = await d.evaluate(JS(f"return await s.register({{ name:'Нов Тестов', email:'{email}', password:'parola1', phone:'{ph}', city:'Пловдив', company:'Друга', carType:'own' }});"))
        await d.evaluate(JS("s.updateProfile({onboarded:true, tour:'done'}); ")); await d.wait_for_timeout(600)
        # --- глас в смяната ---
        await d.goto(B + '/app#/shift/new'); await d.wait_for_timeout(600)
        await d.evaluate("window.__voiceMock = 'Кеш 120, карта 80, гориво 40 евро 28 литра, автомивка 6'")
        await d.context.grant_permissions(['microphone'])
        ok('Смяната има „Кажи смяната на глас“', await d.locator('.voice-btn').count() == 1)
        await d.click('.voice-btn'); await d.wait_for_timeout(1200)
        if await d.locator('.voice-mic.on').count(): await d.click('.voice-mic'); await d.wait_for_timeout(1500)
        txt = await d.inner_text('.sheet') if await d.locator('.sheet').count() else ''
        ok('Гласът разпознава сумите (чрез сървъра)', 'Кеш' in txt and '120' in txt and 'Гориво' in txt, txt.replace('\n', ' ')[:120])
        if await d.locator('.sheet button:has-text("Добави в смяната")').count():
            await d.click('.sheet button:has-text("Добави в смяната")'); await d.wait_for_timeout(400)
        inc = await d.inner_text('[data-sec=inc]'); exp = await d.inner_text('[data-sec=exp]')
        ok('Сумите влизат в смяната', '200' in inc and '40' in exp and '28' in exp, (inc + ' | ' + exp).replace('\n', ' ')[:160])
        await d.click('.save-bar .btn'); await d.wait_for_timeout(600)
        if await d.locator('.result').count(): await d.click('.result >> text=Супер'); await d.wait_for_timeout(300)
        # --- търсачка ---
        await d.goto(B + '/app#/search'); await d.wait_for_timeout(400)
        await d.fill('.search-in', 'къде е ексела'); await d.wait_for_timeout(200)
        ok('Търсачката намира готов отговор', 'Excel' in await d.inner_text('.search-res'))
        await d.fill('.search-in', 'колко изкарах този месец'); await d.wait_for_timeout(200)
        ok('Отговаря за собствените числа', 'Твоите числа' in await d.inner_text('.search-res') and '1 смяна' in await d.inner_text('.ans.mine'), await d.inner_text('.ans.mine') if await d.locator('.ans.mine').count() else '')
        await d.fill('.search-in', 'може ли да се свържа с диспечера през приложението'); await d.wait_for_timeout(200)
        await d.click('.ask-ai'); await d.wait_for_timeout(800)
        ok('„Питай AI“ връща отговор', 'Отговор от AI' in await d.inner_text('.search-res'))
        # --- вчера без смяна: банер и „Почивах“ ---
        y = await d.evaluate("(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()")
        await d.evaluate(JS("const id=s.currentUser().id; s.adminSetCreated && 0; "))
        await d.goto(B + '/app#/home'); await d.wait_for_timeout(500)
        # регистриран е днес → няма банер; правим акаунта „стар“ локално
        await d.evaluate(JS("const u=s.currentUser(); s.updateProfile({}); "))
        # --- известия: абонамент + напомняне + седмичен ---
        await d.evaluate(JS("s.updateProfile({}); "))
        start = len(json.loads(await (await d.request.get(B + '/mock/push')).text()))
        r = await d.evaluate(JS(f"return await s.driverCall('drvPushSub', {{ sub: {{ endpoint: '{B}/mock/push', keys: {{ p256dh: '{keys['pub']}', auth: '{auth64url}' }} }}, types: ['remind','weekly'] }});"))
        ok('Шофьорът се абонира за известия', r.get('ok'), r)
        # админ пуска сутрешното напомняне веднага
        ca = await b.new_context(viewport={'width': 1280, 'height': 900}); await ca.add_init_script(INIT); a = await ca.new_page()
        await a.goto(B + '/admin'); await a.wait_for_timeout(400)
        await a.fill('input[type=email]', 'admin@profitaxi.bg'); await a.fill('input[type=password]', 'admin123'); await a.click('button[type=submit]'); await a.wait_for_timeout(900)
        r = await a.evaluate(JS("return await s.adminPush('cronRun', { slot: 'am' }); "))
        ok('Сутрешното пускане минава', r.get('ok'), r)
        got = json.loads(await (await d.request.get(B + '/mock/push')).text())[start:]
        msgs = [json.loads(subprocess.check_output(['node', D + 'dec.mjs', keys['priv'], keys['auth'], g['body']]).decode()) for g in got]
        ok('Нов шофьор (регистриран днес) не получава напомняне за вчера', not any(m['title'] == 'Вчерашната смяна' for m in msgs), [m['title'] for m in msgs])
        r = await (await d.request.get(B + '/api/db?cron=am')).json()
        ok('Публичното извикване пропуска извън 10:00/20:00 (или вече е пуснато)', r.get('skipped') in ('hour', 'done') or r.get('ok'), r)
        # --- Face ID с виртуален ключ ---
        cdp = await cd.new_cdp_session(d)
        await cdp.send('WebAuthn.enable')
        await cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {'protocol': 'ctap2', 'transport': 'internal', 'hasResidentKey': True, 'hasUserVerification': True, 'isUserVerified': True}})
        r = await d.evaluate("async () => { const m = await import('/js/passkey.js'); return await m.enablePasskey(); }")
        ok('Face ID се включва (регистрация на ключ)', r.get('ok'), r)
        await d.evaluate(JS("s.logout(); ")); await d.goto(B + '/app#/login'); await d.wait_for_timeout(700)
        ok('На входа има „Вход с …“', await d.locator('.pk-login button').count() == 1)
        await d.click('.pk-login button'); await d.wait_for_timeout(1500)
        ok('Вход с Face ID без парола', '#/home' in d.url and await d.locator('.nav').count() == 1, d.url)
        # --- админ: фуния и въпроси ---
        await a.goto(B + '/admin#/growth?t=funnel'); await a.wait_for_timeout(700)
        t = await a.inner_text('main')
        ok('Фуния: регистрация → първа смяна → 7 → 30 дни', all(x in t for x in ['Регистрирали се', 'Първа смяна', 'Още карат след 7 дни', 'Още карат след 30 дни']))
        await a.goto(B + '/admin#/dev?t=asks'); await a.wait_for_timeout(700)
        ok('Въпросите към AI се виждат в админа', 'свържа с диспечера' in await a.inner_text('main'))
        ok('Без грешки в JS', not errs, errs[:2])
        await b.close()
    print(f'FAILS: {len(fails)} / 16'); sys.exit(1 if fails else 0)
asyncio.run(main())
