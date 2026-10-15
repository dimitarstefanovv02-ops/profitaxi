# avtopark.html = app.html с името и иконката на собственика. Пусни след всяка промяна в app.html.
# /app – шофьори, /avtopark – собственици на коли: всеки адрес помни свой акаунт.
import os
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
s = open(os.path.join(R, 'app.html'), encoding='utf-8').read()
for a, b in [
    ('<title>Чисто</title>', '<title>Чисто Автопарк</title>'),
    ('content="Приходи, разходи и чиста печалба за таксиметрови шофьори."', 'content="Коли под наем: наем, срокове, разходи и печалба по коли."'),
    ('<meta name="apple-mobile-web-app-title" content="Чисто">', '<meta name="apple-mobile-web-app-title" content="Чисто Автопарк">'),
    ('href="/manifest.webmanifest"', 'href="/manifest-fleet.webmanifest"'),
    ('href="/icons/favicon-64.png"', 'href="/icons/fleet-64.png"'),
    ('href="/icons/apple-touch-icon.png"', 'href="/icons/fleet-touch-icon.png"'),
]:
    assert a in s, a
    s = s.replace(a, b)
s = s.replace('<!doctype html>', '<!doctype html>\n<!-- Генерирано от tools/build_avtopark.py – не го редактирай на ръка -->', 1)
open(os.path.join(R, 'avtopark.html'), 'w', encoding='utf-8').write(s)
print('ok avtopark.html')
