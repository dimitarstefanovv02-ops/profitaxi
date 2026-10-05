"""Сглобява страниците на маркетинговия сайт от site/*.html → корена на проекта.
Пусни: python3 tools/build_site.py"""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'site'
head = (src / '_head.html').read_text()
price = (src / '_price.html').read_text()
final = (src / '_final.html').read_text()
joke = (src / '_final_joke.html').read_text()
PAGES = {
  'index': ('ProfiTaxi – знаеш ли колко ти остава?', 'Приложение за таксиметрови шофьори: реалната чиста печалба след гориво, ефир, наем и всички такси. Смени за 10 секунди, напомняния, резервации. 14 дни безплатно.'),
  'about': ('Какво е ProfiTaxi', 'Profit + Taxi + Profi. Защо създадохме ProfiTaxi и как помага на таксиметровия шофьор да знае колко реално печели.'),
  'features': ('Функции – ProfiTaxi', 'Смени, разходи с падежи и напомняния, лични резервации, цели, статистика, профил и покани. Всичко за парите на таксиметровия шофьор.'),
  'how': ('Как работи – ProfiTaxi', '3 минути настройка, 10 секунди на смяна. Как ProfiTaxi смята чистата печалба, с реален пример за месец.'),
  'pricing': ('Цена – ProfiTaxi', '9,99 € на месец или 99 € на година. 14 дни безплатно, без карта. Безплатни месеци с покани.'),
  'faq': ('Въпроси – ProfiTaxi', 'Често задавани въпроси за ProfiTaxi: коли под наем и на лизинг, разходи, напомняния, резервации, покани, данни и абонамент.'),
}
def img(m):
  shot, alt, *rest = m.group(1).split('|')
  lazy = '' if rest and rest[0] == 'eager' else ' loading="lazy"'
  return f'<img src="/img/screen-{shot}-dark.jpg" alt="{alt}" width="390" height="844"{lazy}>'
for name, (title, desc) in PAGES.items():
  body = (src / f'{name}.html').read_text().replace('{{PRICE}}', price).replace('{{FINAL_JOKE}}', joke).replace('{{FINAL}}', final)
  body = re.sub(r'\{\{IMG:([^}]+)\}\}', img, body)
  html = head.replace('{{TITLE}}', title).replace('{{DESC}}', desc) + body + '<div id="site-foot"></div>\n</body>\n</html>\n'
  assert '{{' not in html, name
  (root / f'{name}.html').write_text(html)
  print('ok', name)
