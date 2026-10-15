# Два адреса: /app – шофьори, /avtopark – собственици. Всеки помни своя акаунт:
# може да си влязъл и в двата едновременно; входът/изходът в единия не пипа другия.
import asyncio, sys
from playwright.async_api import async_playwright
B = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765'
LIVE = len(sys.argv) > 2 and sys.argv[2] == 'live'
R = []
def ok(n, c, x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  [' + str(x) + ']' if x != '' else ''}")
WHO = "async () => { const s = await import('/js/store.js'); return s.currentUser()?.name || null; }"

def reg(name, email, phone, kind):
    return f"""async () => {{ const s = await import('/js/store.js'); const c = await s.sendSmsCode('{phone}'); if (c && c.demoCode) await s.verifySmsCode('{phone}', c.demoCode);
      const r = await s.register({{ name: '{name}', email: '{email}', password: 'parola1', phone: '{phone}', city: 'Пловдив', company: 'Еко Такси 6155', carType: 'rent', accountType: '{kind}' }});
      if (!r.error) s.updateProfile({{ onboarded: true, tour: 'done' }}); return r.error || null; }}"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 390, 'height': 844}); errs = []
        ctx.set_default_timeout(8000)
        d = await ctx.new_page(); d.on('pageerror', lambda e: errs.append(str(e)))
        await d.goto(B + '/app'); await d.evaluate(f"localStorage.clear(); localStorage.setItem('profitaxi.installed','1'); localStorage.setItem('profitaxi.fwalk','1'); {'localStorage.setItem(`profitaxi.live`,`1`);' if LIVE else ''}"); await d.reload()
        # входът за собственици има своя вид
        o = await ctx.new_page(); o.on('pageerror', lambda e: errs.append(str(e)))
        await o.goto(B + '/avtopark#/login'); await o.wait_for_timeout(700)
        ok('/avtopark: вход за собственици със зелената иконка', 'Автопаркът' in await o.locator('.auth-hero h1').inner_text() and await o.evaluate("document.querySelector('link[rel=manifest]').getAttribute('href')") == '/manifest-fleet.webmanifest')
        ok('/avtopark: заглавие „Чисто Автопарк“', await o.title() == 'Чисто Автопарк')
        await o.goto(B + '/avtopark#/register'); await o.wait_for_timeout(500)
        ok('/avtopark: регистрацията е избрана за собственик', await o.locator('.acct-opt.on:has-text("Собственик")').count() == 1)
        await d.goto(B + '/app#/login'); await d.wait_for_timeout(500)
        ok('/app: линк към входа за собственици', await d.locator('a[href="/avtopark"]').count() == 1)
        # шофьор в /app
        e = await d.evaluate(reg('Иво Шофьоров', 'ivo.drv@t.bg', '0888700001', 'driver')); ok('/app: регистрация шофьор', e is None, e)
        await d.goto(B + '/app#/home'); await d.wait_for_timeout(900)
        await d.evaluate("async () => { const s = await import('/js/store.js'); const st = s.startShift(100000); s.saveShift({ ...st, note: 'смяна-на-иво' }); }"); await d.wait_for_timeout(600)
        # собственик в /avtopark
        await o.goto(B + '/avtopark#/login'); await o.wait_for_timeout(600)
        ok('/avtopark не е влязъл с шофьора', await o.evaluate(WHO) is None)
        e = await o.evaluate(reg('Петко Собственик', 'petko.own@t.bg', '0888700002', 'fleet')); ok('/avtopark: регистрация собственик', e is None, e)
        await o.goto(B + '/avtopark#/home'); await o.wait_for_timeout(1000)
        ok('/avtopark: „Автопарк“', await o.locator('h1:has-text("Автопарк")').count() == 1)
        # двата едновременно
        await d.reload(); await d.wait_for_timeout(1300)
        u = await d.evaluate("async () => { const s = await import('/js/store.js'); return [s.currentUser()?.name, s.myData().shifts.some((x) => x.note === 'смяна-на-иво')]; }")
        ok('/app остава шофьорът, със смените си', u == ['Иво Шофьоров', True], u)
        await o.reload(); await o.wait_for_timeout(1300)
        u = await o.evaluate("async () => { const s = await import('/js/store.js'); return [s.currentUser()?.name, s.myData().shifts.length]; }")
        ok('/avtopark остава собственикът, без смените на шофьора', u == ['Петко Собственик', 0], u)
        # изход от /app не пипа /avtopark
        await d.goto(B + '/app#/settings'); await d.wait_for_timeout(500); await d.click('text=Изход'); await d.wait_for_timeout(900)
        await o.reload(); await o.wait_for_timeout(1200)
        ok('Изход в /app – /avtopark пак е влязъл', await o.evaluate(WHO) == 'Петко Собственик')
        # собственик, влязъл в /app → минава сам на /avtopark
        await d.goto(B + '/app#/login'); await d.wait_for_timeout(500)
        await d.fill('input[autocomplete=username]', 'petko.own@t.bg'); await d.fill('input[type=password]', 'parola1'); await d.click('button[type=submit]'); await d.wait_for_timeout(2000)
        ok('Собственик, влязъл в /app → отваря се /avtopark', '/avtopark' in d.url and await d.evaluate(WHO) == 'Петко Собственик', d.url)
        await d.goto(B + '/app#/home'); await d.wait_for_timeout(800)
        ok('…а /app остава на входа', await d.evaluate(WHO) is None and 'login' in d.url, d.url)
        await d.fill('input[autocomplete=username]', 'ivo.drv@t.bg'); await d.fill('input[type=password]', 'parola1'); await d.click('button[type=submit]'); await d.wait_for_timeout(1500)
        ok('Шофьорът влиза в /app', await d.evaluate(WHO) == 'Иво Шофьоров' and '/app' in d.url)
        await o.reload(); await o.wait_for_timeout(1200)
        ok('…и собственикът в /avtopark пак е влязъл', await o.evaluate(WHO) == 'Петко Собственик')
        # известие за собственика, отворено в /app (?as=)
        oid = await o.evaluate("async () => { const s = await import('/js/store.js'); return s.currentUser().id; }")
        await d.goto(B + f'/app#/home?as={oid}'); await d.wait_for_timeout(1800)
        ok('Известие за собственика в /app → отваря /avtopark', '/avtopark' in d.url and await d.evaluate(WHO) == 'Петко Собственик', d.url)
        await d.goto(B + '/app#/home'); await d.wait_for_timeout(900)
        ok('…и шофьорът в /app не е изкаран', await d.evaluate(WHO) == 'Иво Шофьоров')
        ok('Няма бутон за смяна на акаунт', await d.locator('.big-link:has-text("Смени акаунт")').count() == 0)
        ok('Без грешки в JS', not errs, errs[:3])
        await b.close()
    print('\n'.join(R)); print('FAILS:', sum(1 for r in R if r.startswith('FAIL')), '/', len(R))
asyncio.run(main())
