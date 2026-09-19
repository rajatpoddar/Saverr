#!/usr/bin/env python3
"""Generate SaverR PWA icons with PIL."""
from PIL import Image, ImageDraw
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "static" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

S = 512  # master size


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def gradient(size):
    """Vertical gradient: red-600 #dc2626 -> red-800 #991b1b on slate-900 base."""
    img = Image.new("RGB", (size, size), (15, 23, 42))  # slate-900
    top = (220, 38, 38)
    bot = (153, 27, 27)
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] + (bot[0] - top[0]) * t)
        g = int(top[1] + (bot[1] - top[1]) * t)
        b = int(top[2] + (bot[2] - top[2]) * t)
        for_row = Image.new("RGB", (size, 1), (r, g, b))
        img.paste(for_row, (0, y))
    return img


img = gradient(S).convert("RGBA")

# white down-arrow into tray
d = ImageDraw.Draw(img)
w = 56  # stroke width
cx = S // 2
# vertical shaft
d.rounded_rectangle([cx - w // 2, 120, cx + w // 2, 300], radius=w // 2, fill="white")
# arrow head (triangle)
d.polygon([(cx - 130, 270), (cx + 130, 270), (cx, 400)], fill="white")
# tray line
d.rounded_rectangle([110, 420, S - 110, 420 + w], radius=w // 2, fill="white")

mask = rounded_mask(S, 115)
icon = Image.new("RGBA", (S, S), (0, 0, 0, 0))
icon.paste(img, (0, 0), mask)

for size, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "icon-180.png")]:
    icon.resize((size, size), Image.LANCZOS).save(OUT / name)
    print("wrote", OUT / name)
