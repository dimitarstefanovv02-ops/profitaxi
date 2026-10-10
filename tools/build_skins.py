# Сглобява css/skins.css: clean.src.css → clean, mid, google, chisto; mid.src.css → mid; google.src.css → google, chisto;
# chisto.src.css → само chisto (вариант 5, основният).
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

C, M, G, H = ':root[data-skin="clean"]', ':root[data-skin="mid"]', ':root[data-skin="google"]', ':root[data-skin="chisto"]'
out = ('/* СГЛОБЕНО от tools/clean.src.css и tools/mid.src.css с tools/build_clean.py – не редактирай ръчно */\n'
       + walk(read('clean.src.css'), [C, M, G, H]) + walk(read('mid.src.css'), [M]) + walk(read('google.src.css'), [G, H]) + walk(read('chisto.src.css'), [H]))
open(os.path.join(D, '..', 'css', 'skins.css'), 'w').write(out)
print(out.count('{'), 'правила')
