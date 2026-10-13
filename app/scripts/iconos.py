"""Genera los iconos PWA (seta sencilla sobre verde). python3 scripts/iconos.py"""
from PIL import Image, ImageDraw
def icono(n, margen):
    im = Image.new("RGBA", (n, n), "#1b4332")
    d = ImageDraw.Draw(im)
    s = n * (1 - 2 * margen); o = n * margen
    P = lambda x, y: (o + x * s, o + y * s)
    d.rectangle([P(0.40, 0.45), P(0.60, 0.85)], fill="#f1e3c8")                       # pie
    d.pieslice([P(0.12, 0.18), P(0.88, 0.78)], 180, 360, fill="#c1440e")              # sombrero
    for cx, cy, r in ((0.35, 0.36, 0.05), (0.55, 0.28, 0.04), (0.68, 0.40, 0.035)):
        d.ellipse([P(cx - r, cy - r), P(cx + r, cy + r)], fill="#f1e3c8")
    return im
for n in (192, 512):
    icono(n, 0.06).save(f"public/iconos/icono-{n}.png")
icono(512, 0.18).save("public/iconos/icono-maskable-512.png")
icono(180, 0.06).save("public/iconos/apple-touch-icon.png")
