# Сглобява css/skins.css: вариант 2 (clean.src.css → clean и mid) + вариант 3 (mid.src.css → само mid).
# Вариант 1 (fancy) = без нищо от тук. Изборът е в js/skin.js.
import re, os
D = os.path.dirname(os.path.abspath(__file__))
read = lambda f: re.sub(r'/\*.*?\*/', '', open(os.path.join(D, f)).read(), flags=re.S)

def pre(sel, PS):
    out = []
    for s in sel.split(','):
        s = s.strip()
        if not s: continue
        for P in PS: out.append(P + s[5:] if s.startswith(':root') else P + ' ' + s)
    return ', '.join(out)

def walk(txt, PS):
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
            res.append(head + ' {\n' + walk(body, PS) + '}\n')
        else:
            res.append(pre(head, PS) + ' {' + ' '.join(body.split()) + '}\n')
        i = k
    return ''.join(res)

C, M = ':root[data-skin="clean"]', ':root[data-skin="mid"]'
out = ('/* СГЛОБЕНО от tools/clean.src.css и tools/mid.src.css с tools/build_clean.py – не редактирай ръчно */\n'
       + walk(read('clean.src.css'), [C, M]) + walk(read('mid.src.css'), [M]))
open(os.path.join(D, '..', 'css', 'skins.css'), 'w').write(out)
print(out.count('{'), 'правила')
