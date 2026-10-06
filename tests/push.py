# Известия до админа: нов шофьор и въпрос → криптирано известие до абонамента на админа
# Сървър: VAPID_JWK=… node tools/dev.mjs 8772
import asyncio, sys, json, base64, subprocess, random
from playwright.async_api import async_playwright
B = 'http://localhost:8772'
INIT = "try{localStorage.setItem('profitaxi.live','1');localStorage.setItem('profitaxi.installed','1');localStorage.setItem('profitaxi.adminTour','done')}catch(e){}"
S = "const s = await import('/js/store.js');"
DEC = r"""
import crypto from 'node:crypto'; import fs from 'node:fs';
const [,, privB64, authB64, bodyB64] = process.argv;
const ua = crypto.createECDH('prime256v1'); ua.setPrivateKey(Buffer.from(privB64,'base64'));
const auth = Buffer.from(authB64,'base64'); const buf = Buffer.from(bodyB64,'base64');
const salt=buf.subarray(0,16), idlen=buf[20], asPub=buf.subarray(21,21+idlen), ct=buf.subarray(21+idlen);
const hm=(k,d)=>crypto.createHmac('sha256',k).update(d).digest();
const prk=hm(salt, hm(hm(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])])));
const cek=hm(prk,Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'),Buffer.from([1])])).subarray(0,16), nonce=hm(prk,Buffer.concat([Buffer.from('Content-Encoding: nonce\0'),Buffer.from([1])])).subarray(0,12);
const d=crypto.createDecipheriv('aes-128-gcm',cek,nonce); d.setAuthTag(ct.subarray(ct.length-16));
const pt=Buffer.concat([d.update(ct.subarray(0,ct.length-16)),d.final()]); process.stdout.write(pt.subarray(0,pt.length-1).toString());
"""
async def main():
    fails=[]
    def ok(n,c,x=''):
        print(('PASS ' if c else 'FAIL ')+' '+n+(f'  [{x}]' if x!='' else ''))
        if not c: fails.append(n)
    open('/tmp/claude-0/-home-claude-profitaxi/057a7ba7-67bd-567b-8d2b-1d2084184852/scratchpad/dec.mjs','w').write(DEC)
    keys = json.loads(subprocess.check_output(['node','-e',"const c=require('crypto');const e=c.createECDH('prime256v1');e.generateKeys();console.log(JSON.stringify({priv:e.getPrivateKey('base64'),pub:e.getPublicKey().toString('base64url'),auth:c.randomBytes(16).toString('base64')}))"]))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ca = await b.new_context(viewport={'width':1280,'height':900}); await ca.add_init_script(INIT); a = await ca.new_page(); errs=[]; a.on('pageerror', lambda e: errs.append(str(e)))
        await a.goto(B+'/admin'); await a.wait_for_timeout(400)
        await a.fill('input[type=email]','admin@profitaxi.bg'); await a.fill('input[type=password]','admin123'); await a.click('button[type=submit]'); await a.wait_for_timeout(900)
        ok('Днес: подсказка „Включи известията на телефона“', await a.locator('.push-hint').count()==1)
        await a.goto(B+'/admin#/settings?t=notify'); await a.wait_for_timeout(500)
        ok('Настройки → Известия: двата вида и бутон', 'Нов шофьор се регистрира' in await a.inner_text('main') and await a.locator('button:has-text("Включи известията")').count()==1)
        start = len(json.loads(await (await a.request.get(B+'/mock/push')).text()))
        auth64url = base64.urlsafe_b64encode(base64.b64decode(keys['auth'])).decode().rstrip('=')
        r = await a.evaluate(S.join(["async () => {", f"return await s.adminPush('pushSub', {{ sub: {{ endpoint: '{B}/mock/push', keys: {{ p256dh: '{keys['pub']}', auth: '{auth64url}' }} }}, types: ['reg','ticket'] }}); }}"]))
        ok('Абонаментът се записва на сървъра', r.get('ok') and r.get('ready'), r)
        r = await a.evaluate(S.join(["async () => {", "return await s.adminPush('pushTest'); }"]))
        ok('Пробно известие', r.get('sent')==1, r)
        # шофьор се регистрира
        cd = await b.new_context(viewport={'width':390,'height':844}); await cd.add_init_script(INIT); d = await cd.new_page()
        await d.goto(B+'/app#/register'); await d.wait_for_timeout(400)
        ph = '0888' + str(random.randint(100000,999999))
        await d.fill('input[autocomplete=name]','Петър Известиев'); await d.fill('input[type=email]',f'p{ph}@mail.bg'); await d.fill('input[type=password]','parola1')
        ok('Регистрация без код за телефона', await d.locator('text=Вземи код').count()==0 and await d.locator('.sms-box').count()==0)
        await d.fill('input[type=tel]', ph); await d.select_option('select >> nth=0','Пловдив'); await d.wait_for_timeout(150); await d.select_option('select >> nth=1', index=1)
        await d.click('text=Собствена'); await d.click('input[type=checkbox]'); await d.click('button[type=submit]'); await d.wait_for_timeout(1200)
        ok('Шофьорът е регистриран', '#/guide' in d.url, d.url)
        await d.evaluate(S.join(["async () => {", "s.updateProfile({onboarded:true, tour:'done'}); s.sendTicket({ topic:'other', text:'Как се добавя ремонт?' }); }"])); await d.wait_for_timeout(1500)
        got = json.loads(await (await a.request.get(B+'/mock/push')).text())[start:]
        msgs = []
        for g in got:
            out = subprocess.check_output(['node','/tmp/claude-0/-home-claude-profitaxi/057a7ba7-67bd-567b-8d2b-1d2084184852/scratchpad/dec.mjs', keys['priv'], keys['auth'], g['body']]).decode()
            msgs.append(json.loads(out))
        titles = [m['title'] for m in msgs]
        ok('Известията са криптирани (aes128gcm) и с VAPID подпис', all(g['enc']=='aes128gcm' and g['auth'].startswith('vapid t=') for g in got), len(got))
        ok('Известие „Нов шофьор“ с име и град', any(m['title'].startswith('Нов шофьор') and 'Петър Известиев' in m['body'] and 'Пловдив' in m['body'] for m in msgs), titles)
        ok('Известие „Въпрос от …“ с текста', any(m['title']=='Въпрос от Петър Известиев' and 'ремонт' in m['body'] for m in msgs), titles)
        ok('Натискане води към правилната страница', any(m.get('url')=='/admin#/drivers?f=new' for m in msgs))
        # само въпроси
        await a.evaluate(S.join(["async () => {", f"return await s.adminPush('pushSub', {{ sub: {{ endpoint: '{B}/mock/push', keys: {{ p256dh: '{keys['pub']}', auth: '{auth64url}' }} }}, types: ['ticket'] }}); }}"]))
        n0 = len(got)
        d2 = await (await b.new_context()).new_page(); await d2.add_init_script(INIT) if False else None
        await d2.goto(B+'/app'); await d2.evaluate("localStorage.setItem('profitaxi.live','1')"); await d2.goto(B+'/app#/register'); await d2.wait_for_timeout(300)
        ph2 = '0888' + str(random.randint(100000,999999))
        await d2.evaluate(S.join(["async () => {", f"await s.register({{ name:'Без Известие', email:'b{ph2}@mail.bg', password:'parola1', phone:'{ph2}', city:'София', company:'Друга', carType:'own' }}); }}"])); await d2.wait_for_timeout(800)
        got2 = json.loads(await (await a.request.get(B+'/mock/push')).text())[start:]
        ok('Изключен вид („Нов шофьор“) не праща известие', len(got2)==n0, [n0, len(got2)])
        ok('Без грешки в JS', not errs, errs)
        await b.close()
    print(f'FAILS: {len(fails)} / 12'); sys.exit(1 if fails else 0)
asyncio.run(main())
