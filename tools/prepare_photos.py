# -*- coding: utf-8 -*-
"""把原图批量转换为 Web 可用的 WebP（主图 + 缩略图），并输出 manifest.json。

用法: python tools/prepare_photos.py
- 主图: 长边 <= 1600, 质量 80  ->  assets/photos/*.webp
- 缩略: 长边 <= 560,  质量 74  ->  assets/photos/thumbs/*.webp
- 自动按 EXIF 方向扶正, 并清除所有 EXIF（隐私）
"""
import json
import re
from pathlib import Path

from PIL import Image, ImageOps, ExifTags
import pillow_heif

pillow_heif.register_heif_opener()

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(r"C:\Users\hcton\Pictures\待整理\人物分类\人物02精选V3_Top100")
DST = ROOT / "assets" / "photos"
THUMB = DST / "thumbs"
DST.mkdir(parents=True, exist_ok=True)
THUMB.mkdir(parents=True, exist_ok=True)

MAIN_MAX = 1600
THUMB_MAX = 560
EXIF_RE = re.compile(r"^(?:IMG|VID|MVIMG|mmexport)")


def slug(name: str) -> str:
    stem = Path(name).stem
    if EXIF_RE.match(stem):
        return stem.lower()
    return re.sub(r"[^0-9a-zA-Z]+", "-", stem.lower()).strip("-")


def exif_date(im):
    try:
        ex = im.getexif()
        if not ex:
            return None
        for tid, val in ex.items():
            if ExifTags.TAGS.get(tid) == "DateTimeOriginal":
                return val
        ifd = ex.get_ifd(0x8769)
        for k, v in ifd.items():
            if ExifTags.TAGS.get(k) == "DateTimeOriginal":
                return v
    except Exception:
        pass
    return None


manifest = []
for p in sorted(SRC.iterdir()):
    if p.suffix.lower() not in (".heic", ".jpg", ".jpeg", ".png"):
        continue
    s = slug(p.name)
    try:
        with Image.open(p) as im:
            dt = exif_date(im)
            im = ImageOps.exif_transpose(im)
            im = im.convert("RGB")
            w0, h0 = im.size

            big = im.copy()
            big.thumbnail((MAIN_MAX, MAIN_MAX), Image.LANCZOS)
            big_path = DST / f"{s}.webp"
            big.save(big_path, "WEBP", quality=80, method=5)

            th = im.copy()
            th.thumbnail((THUMB_MAX, THUMB_MAX), Image.LANCZOS)
            th_path = THUMB / f"{s}.webp"
            th.save(th_path, "WEBP", quality=74, method=5)

            manifest.append({
                "src": p.name,
                "id": s,
                "dt": dt,
                "w": w0, "h": h0,
                "mw": big.size[0], "mh": big.size[1],
                "bytes": big_path.stat().st_size,
            })
            print(f"OK  {p.name:34s} -> {s}.webp  {w0}x{h0} -> {big.size[0]}x{big.size[1]}")
    except Exception as e:  # noqa
        print(f"ERR {p.name}: {e}")

out = ROOT / "tools" / "photo_manifest.json"
out.write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
total_mb = sum(m["bytes"] for m in manifest) / 1e6
print(f"\nTOTAL {len(manifest)} photos, main files {total_mb:.1f} MB -> {DST}")
