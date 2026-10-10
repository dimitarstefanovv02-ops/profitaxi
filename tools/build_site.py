"""Сглобява страниците на маркетинговия сайт от site/*.html → корена на проекта.
Пусни: python3 tools/build_site.py

Шаблони в страниците:
  {{PRICE}} {{FINAL}}          – общи блокове (site/_price.html, site/_final.html)
  {{IMG:име|alt}}              – снимка от приложението: /img/screen-<име>-light.jpg
  {{IMG:име|alt|eager}}        – същото, без lazy loading (за горната част на страницата)
  {{IMG:име|alt|dark}}         – тъмната версия /img/screen-<име>-dark.jpg
  {{IC:име}}                   – линейна иконка (виж ICONS по-долу)
Шапката и долната част (site/_nav.html, site/_foot.html) се вграждат във всяка страница;
текущата страница в менюто получава aria-current="page"."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'site'
part = lambda n: (src / f'_{n}.html').read_text()
head, nav, foot, price, final = part('head'), part('nav'), part('foot'), part('price'), part('final')

PAGES = {
  'index': ('ProfiTaxi – колко ти остава след смяната', 'Приложение за таксиметрови шофьори: записваш смяната за секунди и виждаш реалната чиста печалба след гориво, ефир, наем и всички такси. 0,00 € по време на теста.'),
  'features': ('Функции – ProfiTaxi', 'Смени с глас, чиста печалба на час и на км, цел за месеца, постоянни разходи с падежи и напомняния, резервации, статистика, Колата ми, Excel.'),
  'how': ('Как работи – ProfiTaxi', '3 минути настройка, секунди на смяна. Как ProfiTaxi смята чистата печалба, с пример за един месец.'),
  'pricing': ('Цена – ProfiTaxi', '0,00 € по време на теста. Без карта и без обвързване.'),
  'faq': ('Въпроси – ProfiTaxi', 'Често задавани въпроси за ProfiTaxi: собствена кола, под наем и на лизинг, разходи, напомняния, резервации, данни и цена.'),
  'about': ('За ProfiTaxi', 'Profit + Taxi + Profi. Защо направихме ProfiTaxi и в какво вярваме.'),
  'privacy': ('Политика за поверителност – ProfiTaxi', 'Какви данни събира ProfiTaxi, кой има достъп до тях и какви са правата ти.'),
  'terms': ('Общи условия – ProfiTaxi', 'Общи условия за ползване на ProfiTaxi.'),
}

# Прости линейни иконки 24×24 (stroke = currentColor)
ICONS = {
  'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  'clock': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  'target': '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".9" fill="currentColor"/>',
  'calendar': '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  'chart': '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  'pin': '<path d="M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  'car': '<path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5"/><path d="M3.5 12h17v4.5h-17z"/><path d="M6.5 16.5V19M17.5 16.5V19"/>',
  'file': '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5M9 12.5l4 4M13 12.5l-4 4"/>',
  'offline': '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4-2.4M19 13a10 10 0 0 0-3.2-2.1M2 9.5a14.5 14.5 0 0 1 4.4-2.9M22 9.5A14.5 14.5 0 0 0 11 5.6"/><circle cx="12" cy="19.5" r=".9" fill="currentColor"/>',
  'face': '<path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"/><path d="M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5a3.5 3.5 0 0 0 5 0"/>',
  'contrast': '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor"/>',
  'home': '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9v11h12V9"/><path d="M10 20v-5h4v5"/>',
  'receipt': '<path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 8h6M9 11.5h6M9 15h3.5"/>',
  'fuel': '<path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15.5M3.5 20.5h12M5 10h9"/><path d="M14 8.5l3 2.5v6.5a1.5 1.5 0 0 0 3 0V9l-2.5-3"/>',
  'users': '<circle cx="9" cy="8.5" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.4A6 6 0 0 1 21 20"/>',
  'lock': '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  'check': '<path d="M4.5 12.5l5 5 10-11"/>',
  'arrow': '<path d="M4 12h15M13.5 6l6 6-6 6"/>',
  'plus': '<path d="M12 5v14M5 12h14"/>',
}
def ic(m):
  return f'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">{ICONS[m.group(1)]}</svg>'
def img(m):
  shot, alt, *rest = m.group(1).split('|')
  lazy = '' if 'eager' in rest else ' loading="lazy"'
  theme = 'dark' if 'dark' in rest else 'light'
  return f'<img src="/img/screen-{shot}-{theme}.jpg" alt="{alt}" width="390" height="844"{lazy}>'

for name, (title, desc) in PAGES.items():
  url = '/' if name == 'index' else f'/{name}'
  top = nav if name == 'index' else nav.replace(f'href="{url}"', f'href="{url}" aria-current="page"')
  body = (src / f'{name}.html').read_text().replace('{{PRICE}}', price).replace('{{FINAL}}', final)
  html = head.replace('{{TITLE}}', title).replace('{{DESC}}', desc) + top + body + foot + '</body>\n</html>\n'
  html = re.sub(r'\{\{IMG:([^}]+)\}\}', img, html)
  html = re.sub(r'\{\{IC:([a-z]+)\}\}', ic, html)
  assert '{{' not in html, name
  (root / f'{name}.html').write_text(html)
  print('ok', name)
