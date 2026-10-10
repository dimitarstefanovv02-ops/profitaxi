# Пуска всички tests/*.test.html в браузър (часова зона Europe/Sofia) и печата общия резултат.
#   python3 tests/run_all_calc.py            – всички
#   python3 tests/run_all_calc.py -v         – с всеки PASS ред
#   python3 tests/run_all_calc.py money goal – само избрани
# Сам пуска tests/serve.py на порт 8765, ако не върви. Изход 1 при FAIL или грешка в страницата.
import asyncio, glob, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

PORT = 8765
HERE = os.path.dirname(os.path.abspath(__file__))
BASE = f'http://localhost:{PORT}/tests/'


def server_up():
    try:
        urllib.request.urlopen(BASE + 'calc.test.html', timeout=2)
        return True
    except Exception:
        return False


def ensure_server():
    if server_up():
        return
    subprocess.Popen([sys.executable, os.path.join(HERE, 'serve.py'), str(PORT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    for _ in range(40):
        if server_up():
            return
        time.sleep(0.25)
    sys.exit('Сървърът на порт %d не тръгна' % PORT)


async def run(files, verbose):
    tot = {'PASS': 0, 'FAIL': 0, 'KNOWN': 0}
    bad_pages = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for f in files:
            ctx = await b.new_context(timezone_id='Europe/Sofia', locale='bg-BG')
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            name = os.path.basename(f)
            try:
                await pg.goto(BASE + name)
                await pg.wait_for_function('window.__results || window.__r', timeout=60000)
                res = await pg.evaluate('window.__results || null')
            except Exception as e:
                res = None
                errs.append(str(e).splitlines()[0])
            if res is None:
                # persona*.test.html връщат само данни (window.__r), без проверки
                status = 'грешка' if errs else 'само данни, без проверки'
                print(f'{name:28} {status}')
            else:
                c = {k: sum(x.startswith(k) for x in res) for k in tot}
                for k in tot:
                    tot[k] += c[k]
                print(f'{name:28} {len(res):4} теста  PASS {c["PASS"]:4}  FAIL {c["FAIL"]:3}  KNOWN {c["KNOWN"]:2}')
                for x in res:
                    if verbose or not x.startswith('PASS'):
                        print('    ' + x)
            if errs:
                bad_pages.append(name)
                for e in errs:
                    print('    ГРЕШКА В СТРАНИЦАТА: ' + e)
            await ctx.close()
        await b.close()
    n = sum(tot.values())
    print('-' * 72)
    print(f'ОБЩО: {n} теста  PASS {tot["PASS"]}  FAIL {tot["FAIL"]}  KNOWN {tot["KNOWN"]} (известни грешки извън обхвата)')
    return 1 if tot['FAIL'] or bad_pages else 0


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    verbose = '-v' in sys.argv
    files = sorted(glob.glob(os.path.join(HERE, '*.test.html')))
    if args:
        files = [f for f in files if any(os.path.basename(f).startswith(a) for a in args)]
    ensure_server()
    sys.exit(asyncio.run(run(files, verbose)))
