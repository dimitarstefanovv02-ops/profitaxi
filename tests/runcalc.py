import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(timezone_id='Europe/Sofia')).new_page()  # часовата зона на шофьорите (лятно/зимно време)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        import sys; await pg.goto('http://localhost:8765/tests/' + (sys.argv[1] if len(sys.argv) > 1 else 'calc.test.html')); await pg.wait_for_function('window.__results', timeout=20000)
        r = await pg.evaluate('window.__results'); print('\n'.join(r)); print('FAILS:', sum(x.startswith('FAIL') for x in r), '/', len(r)); print(errs or '')
        await b.close()
asyncio.run(main())
