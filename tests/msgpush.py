# Съобщения и отговори от админа → известие на телефона на шофьора. Сървър: VAPID_JWK=… node tools/dev.mjs 8790
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
        start = len(json.loads(await (await d.request.get(B + '/mock/push')).text()))
        r = await d.evaluate(JS(f"return await s.driverCall('drvPushSub', {{ sub: {{ endpoint: '{B}/mock/push', keys: {{ p256dh: '{keys['pub']}', auth: '{auth64url}' }} }}, types: ['remind','weekly','msg'], v: 2 }});"))
        ok('Абонамент с „Съобщения“', r.get('ok'), r)
        await d.evaluate(JS("s.sendTicket ? 0 : 0; "))
        tk = await d.evaluate(JS("const r = s.sendTicket({ topic: 'other', text: 'Как да сменя колата?' }); await s.syncNow(); return r && r.ticket && r.ticket.id;"))
        ca = await b.new_context(viewport={'width': 1280, 'height': 900}); await ca.add_init_script(INIT); a = await ca.new_page()
        await a.goto(B + '/admin'); await a.wait_for_timeout(400)
        await a.fill('input[type=email]', 'admin@profitaxi.bg'); await a.fill('input[type=password]', 'admin123'); await a.click('button[type=submit]'); await a.wait_for_timeout(900)
        await a.evaluate(JS("await s.syncNow(); s.admin.sendMessage({ title: 'Нова функция', text: 'Вече има гласово въвеждане.', target: null }); "))
        await a.wait_for_timeout(1500)
        if tk: await a.evaluate(JS(f"await s.syncNow(); s.admin.replyTicket('{tk}', 'От Профил → Настройки на колата.'); ")); await a.wait_for_timeout(1500)
        got = json.loads(await (await d.request.get(B + '/mock/push')).text())[start:]
        msgs = [json.loads(subprocess.check_output(['node', D + 'dec.mjs', keys['priv'], keys['auth'], g['body']]).decode()) for g in got]
        print([ (m['title'], m['body']) for m in msgs ], 'ticket', tk)
        ok('Съобщението идва като известие', any(m['title'] == 'Нова функция' for m in msgs))
        ok('Отговорът на въпроса идва като известие', (not tk) or any(m['title'] == 'Отговор на въпроса ти' for m in msgs))
        await b.close()
    print('FAILS', len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
