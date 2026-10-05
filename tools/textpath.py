# Текст → SVG пътища (за лога, които трябва да изглеждат еднакво навсякъде, и в <img>).
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
_cache = {}
def text_path(text, font='/usr/share/fonts/opentype/inter/InterDisplay-Black.otf', size=46, x=0, y=0, anchor='start', spacing=0):
    f = _cache.get(font) or _cache.setdefault(font, TTFont(font))
    gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f['head'].unitsPerEm; s = size / upm
    names = [cmap[ord(c)] for c in text]
    widths = [f['hmtx'][n][0] * s + spacing for n in names]
    total = sum(widths) - spacing
    cx = x - (total / 2 if anchor == 'middle' else total if anchor == 'end' else 0)
    out = []
    for n, w in zip(names, widths):
        pen = SVGPathPen(gs)
        gs[n].draw(TransformPen(pen, (s, 0, 0, -s, cx, y)))
        out.append(pen.getCommands()); cx += w
    return ' '.join(out), total
