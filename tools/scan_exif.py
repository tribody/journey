# -*- coding: utf-8 -*-
"""扫描照片 EXIF 拍摄时间，输出按时间排序的清单（构建期工具）。"""
import json
import os
import sys
from pathlib import Path

from PIL import Image, ExifTags
import pillow_heif

pillow_heif.register_heif_opener()

SRC = Path(r"C:\Users\hcton\Pictures\待整理\人物分类\人物02精选V3_Top100")
OUT = Path(__file__).with_name("photo_dates.json")


def read_dt(path: Path):
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            dt = None
            if exif:
                # DateTimeOriginal lives in the Exif IFD
                for tag_id, val in exif.items():
                    name = ExifTags.TAGS.get(tag_id, tag_id)
                    if name in ("DateTimeOriginal", "DateTime"):
                        dt = val
                        break
                if dt is None:
                    try:
                        ifd = exif.get_ifd(0x8769)
                        for k, v in ifd.items():
                            if ExifTags.TAGS.get(k) == "DateTimeOriginal":
                                dt = v
                    except Exception:
                        pass
            w, h = im.size
            return dt, w, h
    except Exception as e:  # noqa
        return f"ERR:{e}", None, None


rows = []
for p in sorted(SRC.iterdir()):
    if p.suffix.lower() not in (".heic", ".jpg", ".jpeg", ".png"):
        continue
    dt, w, h = read_dt(p)
    rows.append({"file": p.name, "dt": dt, "w": w, "h": h})

OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
for r in rows:
    print(f"{r['dt']}\t{r['w']}x{r['h']}\t{r['file']}")
print(f"\nTOTAL {len(rows)}")
