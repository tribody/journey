# -*- coding: utf-8 -*-
"""生成带序号的缩略图拼版，便于一次性浏览全部照片（构建期工具）。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
THUMB = ROOT / "assets" / "photos" / "thumbs"
OUT = Path(__file__).with_name("contact_sheets")
OUT.mkdir(exist_ok=True)

CELL = 220
COLS = 5
ROWS = 5
PAD = 6
LABEL = 20

files = sorted(THUMB.glob("*.webp"))
per_sheet = COLS * ROWS

try:
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 14)
except Exception:
    font = ImageFont.load_default()

sheets = []
for si in range(0, len(files), per_sheet):
    chunk = files[si:si + per_sheet]
    W = COLS * (CELL + PAD) + PAD
    H = ROWS * (CELL + LABEL + PAD) + PAD
    sheet = Image.new("RGB", (W, H), (22, 20, 28))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL + PAD)
        y = PAD + r * (CELL + LABEL + PAD)
        with Image.open(f) as im:
            im = im.convert("RGB")
            im.thumbnail((CELL, CELL), Image.LANCZOS)
            ox = x + (CELL - im.size[0]) // 2
            oy = y + (CELL - im.size[1]) // 2
            sheet.paste(im, (ox, oy))
        idx = si + i + 1
        d.text((x, y + CELL + 2), f"{idx:03d} {f.stem[4:][:22]}", fill=(255, 220, 200), font=font)
    p = OUT / f"sheet_{si // per_sheet + 1}.png"
    sheet.save(p)
    sheets.append(p)
    print("saved", p, f"{len(chunk)} photos")
