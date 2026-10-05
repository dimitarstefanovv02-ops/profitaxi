# Рендира рекламите от ads.html в PNG 1080×1350 (Facebook/Instagram, 4:5)
import pathlib
from playwright.sync_api import sync_playwright
here = pathlib.Path(__file__).resolve().parent
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1200, 'height': 1500})
    pg.goto((here / 'ads.html').as_uri()); pg.wait_for_timeout(800)
    for i in range(1, 6):
        pg.locator(f'#ad{i}').screenshot(path=str(here / f'profitaxi-ad-{i}.png'))
    b.close()
