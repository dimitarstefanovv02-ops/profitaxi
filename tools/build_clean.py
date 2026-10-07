# Сглобява css/clean.css от tools/clean.src.css: всеки селектор става :root[data-skin="clean"] …
import re, os
D = os.path.dirname(os.path.abspath(__file__))
P = ':root[data-skin="clean"]'
src = re.sub(r'/\*.*?\*/', '', open(os.path.join(D, 'clean.src.css')).read(), flags=re.S)

def pre(sel):
    out = []
    for s in sel.split(','):
        s = s.strip()
        if not s: continue
        out.append(P + s[5:] if s.startswith(':root') else P + ' ' + s)
    return ', '.join(out)

def walk(txt):
    res, i = [], 0
    while i < len(txt):
        j = txt.find('{', i)
        if j < 0: break
        head = txt[i:j].strip()
        depth, k = 1, j + 1
        while depth:
            depth += {'{': 1, '}': -1}.get(txt[k], 0); k += 1
        body = txt[j + 1:k - 1]
        if head.startswith('@'):
            res.append(head + ' {\n' + walk(body) + '}\n')
        else:
            res.append(pre(head) + ' {' + ' '.join(body.split()) + '}\n')
        i = k
    return ''.join(res)

out = '/* СГЛОБЕНО от tools/clean.src.css с tools/build_clean.py – не редактирай ръчно */\n' + walk(src)
open(os.path.join(D, '..', 'css', 'clean.css'), 'w').write(out)
print(out.count('{'), 'правила')
