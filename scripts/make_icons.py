"""App icons for the installable web app, drawn from the NarcoTrace mark (framed grid, red square).

Writes frontend/public/icons/: icon-192/512 (any), icon-maskable-512 (safe zone padded), apple-touch-icon (180)
and a 32 px favicon PNG. Run: .venv/bin/python scripts/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path("frontend/public/icons")
PAPER, INK, RED = (10, 10, 10), (232, 230, 223), (255, 59, 38)


def mark(size, inset):
    """The mark on black. inset is the share of the canvas left empty on each side (maskable icons need ~0.1+)."""
    scale = 4  # draw large, then downsample for clean edges
    s = size * scale
    img = Image.new("RGB", (s, s), PAPER)
    d = ImageDraw.Draw(img)
    pad = int(s * inset)
    box = s - 2 * pad
    line = max(scale, int(box * 0.055))
    d.rectangle([pad, pad, pad + box, pad + box], outline=INK, width=line)
    mid = pad + box // 2
    thin = max(scale, line // 2)
    d.rectangle([pad, mid - thin // 2, pad + box, mid + thin // 2], fill=INK)
    d.rectangle([mid - thin // 2, pad, mid + thin // 2, pad + box], fill=INK)
    q = box / 24  # the SVG mark is drawn on a 24-unit grid; the red square sits at (13.5, 4), 6 units wide
    d.rectangle([pad + 13.5 * q, pad + 4 * q, pad + 19.5 * q, pad + 10 * q], fill=RED)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    mark(192, 0.14).save(OUT / "icon-192.png")
    mark(512, 0.14).save(OUT / "icon-512.png")
    mark(512, 0.24).save(OUT / "icon-maskable-512.png")
    mark(180, 0.16).save(OUT / "apple-touch-icon.png")
    mark(32, 0.06).save(OUT / "favicon-32.png")
    print(sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main()
