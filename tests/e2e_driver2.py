# Новото в шофьорското приложение: режим „шофирам“, колко трябва днес, разходи до днес,
# забравена смяна, седмичен отчет, „Изтегли“, без интернет, глас, бележка, календар, бързи действия
import asyncio, re
from playwright.async_api import async_playwright
R=[]
def ok(n,c,x=''): R.append(f"{'PASS' if c else 'FAIL'}  {n}{'  ['+str(x)+']' if x!='' else ''}")
B='http://localhost:8765/app'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width':390,'height':844}, color_scheme='dark'); await ctx.add_init_script("try{localStorage.setItem('profitaxi.paidMode','1')}catch(e){}")
        await ctx.add_init_script("try{localStorage.setItem('profitaxi.dueShown',(d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))(new Date()))}catch(e){}")
        pg = await ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(B); await pg.evaluate('localStorage.clear()'); await pg.goto(B+'#/login'); await pg.wait_for_timeout(400)
        await pg.fill('input[type=email]','ivan@demo.bg'); await pg.fill('input[type=password]','demo123'); await pg.click('button[type=submit]'); await pg.wait_for_timeout(900)
        await pg.keyboard.press('Escape'); await pg.evaluate("document.querySelectorAll('.sheet-wrap').forEach(e=>e.remove())")
        await pg.goto(B+'#/home'); await pg.wait_for_timeout(600)
        # разходите до днес: чистото досега = приход − разходи от смените − постоянни до днес
        calc = await pg.evaluate("""(async()=>{const c=await import('/js/calc.js');const s=await import('/js/store.js');const u=await import('/js/util.js');const d=s.myData();const t=u.todayStr();
          const st=c.periodStats(d,u.startOfMonth(t),u.endOfMonth(t));const g=c.goalProgress(d);
          let fx=0;for(const x of u.eachDay(u.startOfMonth(t),t)) fx+=c.fixedForDay(d.costs,d.profile,x,st?true:false);
          return {stFixed:st.fixedExp, toToday:c.periodStats(d,u.startOfMonth(t),t).fixedExp, net:g.net, stNet:st.net, rem:g.remaining, goal:g.goal, fl:g.fixedLeft, need:g.needToday}})()""")
        ok('Постоянните разходи се смятат само до днес (не за целия месец)', abs(calc['stFixed']-calc['toToday'])<0.01, f"{calc['stFixed']:.0f} = {calc['toToday']:.0f}")
        ok('Цел: от смените трябват = цел − чисто + постоянни до края', abs(calc['rem'] - max(0, calc['goal']-calc['net']+calc['fl']))<0.01, round(calc['rem']))
        ok('„Днес ти трябват“ се показва', 'Днес ти трябват' in await pg.inner_text('.meter') or 'Утре ти трябват' in await pg.inner_text('.meter'))
        ok('„Очаквано за целия месец“ се вижда без да се отваря нищо', await pg.is_visible('.meter-forecast'))
        # „Изтегли“
        ok('Горе има „Изтегли приложението“', await pg.is_visible('.install-bar'))
        await pg.click('.install-bar .btn'); await pg.wait_for_timeout(300)
        ok('„Изтегли“ показва как става с 2 натискания', await pg.locator('.sheet .inst-step').count()==2)
        await pg.click('.sheet >> text=По-късно'); await pg.wait_for_timeout(300)
        await pg.click('.install-bar [aria-label="Скрий"]'); await pg.wait_for_timeout(300)
        ok('„×“ скрива лентата', await pg.locator('.install-bar').count()==0)
        await pg.evaluate("localStorage.removeItem('profitaxi.installHide')"); await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.install-bar .btn-primary'); await pg.wait_for_timeout(300)
        await pg.click('.sheet >> text=Добавих го'); await pg.wait_for_timeout(400)
        ok('„Добавих го“ маха лентата завинаги', await pg.locator('.install-bar').count()==0 and await pg.evaluate("localStorage.getItem('profitaxi.installed')")=='1')
        await pg.reload(); await pg.wait_for_timeout(600)
        ok('След презареждане лентата не се връща', await pg.locator('.install-bar').count()==0)
        # режим „шофирам“
        await pg.click('.shift-cta'); await pg.wait_for_timeout(300); await pg.click('text=Старт'); await pg.wait_for_timeout(500)
        ok('Докато смяната тече: режим „шофирам“ с големи бутони', await pg.locator('.drive-btn').count()==4 and await pg.locator('.meter').count()==0)
        await pg.click('.drive-btn.cash'); await pg.keyboard.type('50'); await pg.click('.np-actions >> text=Добави'); await pg.wait_for_timeout(250)
        await pg.click('.drive-btn.cash'); await pg.keyboard.type('25'); await pg.click('.np-actions >> text=Добави'); await pg.wait_for_timeout(250)
        await pg.click('.drive-btn.fuel'); await pg.keyboard.type('30'); await pg.click('.np-field >> nth=1'); await pg.keyboard.type('20'); await pg.click('.np-actions >> text=Добави'); await pg.wait_for_timeout(300)
        sumtxt = await pg.inner_text('.drive-sum')
        ok('Кеш 50 + 25 и гориво 30 → приходи 75, разходи 30, печалба 45', '75' in sumtxt and '30' in sumtxt and '45' in sumtxt, sumtxt.replace('\n',' '))
        await pg.click('text=Покажи всичко'); await pg.wait_for_timeout(300)
        ok('„Покажи всичко“ връща целия екран', await pg.locator('.meter').count()==1)
        await pg.click('text=Режим „шофирам“'); await pg.wait_for_timeout(300)
        # забравена смяна
        await pg.evaluate("(()=>{const db=JSON.parse(localStorage.getItem('profitaxi.v5'));const s=db.shifts.find(x=>!x.end);s.start=new Date(Date.now()-14*3600e3).toISOString();localStorage.setItem('profitaxi.v5',JSON.stringify(db))})()")
        await pg.reload(); await pg.wait_for_timeout(500)
        ok('Смяна над 13 ч: „Забрави ли да я приключиш?“', await pg.is_visible('.forgot'))
        await pg.click('.forgot >> text=Още карам'); await pg.wait_for_timeout(300)
        ok('„Още карам“ скрива напомнянето', await pg.locator('.forgot').count()==0)
        # бързи действия от иконата
        await pg.goto(B+'#/home?do=fuel'); await pg.wait_for_timeout(700)
        ok('Бързо действие „Гориво“ отваря клавиатурата за горивото', 'Гориво' in (await pg.inner_text('.sheet') if await pg.locator('.sheet').count() else ''))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # глас: разпознатото се прибавя към смяната
        added = await pg.evaluate("""(async()=>{const q=await import('/js/quick.js');const s=await import('/js/store.js');const a=s.getActiveShift();const before=a.income.card||0;
          const txt=q.applyParsed(a,q.parseVoice('карта 40 бакшиш 5'),s.getProfile());s.saveShift(a);const n=s.getActiveShift();return [n.income.card-before, n.income.tips, txt]})()""")
        ok('„Кажи го“: „карта 40 бакшиш 5“ се добавя', added[0]==40 and added[1]==5, added[2])
        rc = await pg.evaluate("(async()=>{const q=await import('/js/quick.js');return q.parseReceipt('ЛУКОЙЛ\\nДИЗЕЛ\\n31,20 Л X 2,39\\nОБЩА СУМА 74,57')})()")
        ok('Бележка: сума, литри и вид гориво', rc['amount']==74.57 and rc['qty']==31.2 and rc['type']=='diesel', rc)
        # приключване – терминът е еднакъв
        await pg.goto(B+'#/home'); await pg.wait_for_timeout(500)
        ok('Бутонът е „Приключи смяната“', await pg.locator('text=Приключи смяната').count()>=1)
        # календар
        async with pg.expect_download() as dl:
            await pg.goto(B+'#/reservations'); await pg.wait_for_timeout(400); await pg.click('text=Всички в календара на телефона')
        d = await dl.value; path = await d.path(); ics = open(path, encoding='utf-8').read()
        ok('Резервациите излизат като .ics за календара', ics.startswith('BEGIN:VCALENDAR') and ics.count('BEGIN:VEVENT')>=1, ics.count('BEGIN:VEVENT'))
        # без интернет
        await ctx.set_offline(True); await pg.goto(B+'#/money'); await pg.wait_for_timeout(500)
        ok('Без интернет: лента „всичко се пази на телефона“', await pg.is_visible('.offline-bar'))
        await ctx.set_offline(False)
        # пари: гориво на 100 км и споделяне
        await pg.goto(B+'#/money'); await pg.wait_for_timeout(500)
        ok('Пари: разход на гориво на 100 км и на км се вижда', '/100 км' in await pg.inner_text('.fuel-line') and 'на км' in await pg.inner_text('.fuel-line'))
        ok('Пари: „Сподели месеца като картинка“', await pg.locator('text=Сподели месеца като картинка').count()==1)
        # графика: натисни колона
        await pg.click('.bars-hit button >> nth=2'); await pg.wait_for_timeout(200)
        ok('Натиснатата колона показва сумата', '€' in await pg.inner_text('.chart-tip'))
        # седмичен отчет (понеделник–сряда)
        wk = await pg.evaluate("(async()=>{const u=await import('/js/util.js');return u.weekdayIdx(u.todayStr())})()")
        await pg.goto(B+'#/home'); await pg.wait_for_timeout(500)
        if wk <= 2: ok('Седмичен отчет в началото на седмицата', await pg.locator('.week-sum').count()==1)
        # размер на текста
        await pg.goto(B+'#/profile'); await pg.wait_for_timeout(400); await pg.click('.seg-btn:has-text("Много голям")'); await pg.wait_for_timeout(200)
        await pg.goto(B+'#/home'); await pg.wait_for_timeout(400)
        ok('„Много голям“ текст: без хоризонтално превъртане', await pg.evaluate('document.documentElement.scrollWidth')<=390, await pg.evaluate('document.documentElement.scrollWidth'))
        ok('Без грешки в JS', not errs, errs[:3])
        print('\n'.join(R)); print('FAILS:', sum(r.startswith('FAIL') for r in R), '/', len(R))
        await b.close()
try: asyncio.run(main())
except Exception as e: print('\n'.join(R)); print('CRASH:', str(e).split('\n')[0])
