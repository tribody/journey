# -*- coding: utf-8 -*-
"""下载 vendor 依赖：three.js 精简构建 + 自建局部字体（构建期工具，可重复运行）。"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor"
FONTS = ROOT / "assets" / "fonts"
VENDOR.mkdir(parents=True, exist_ok=True)
FONTS.mkdir(parents=True, exist_ok=True)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")


def get(url, headers=None, binary=True):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


# --- three.js ---
THREE_URL = "https://unpkg.com/three@0.161.0/build/three.module.min.js"
try:
    data = get(THREE_URL)
    (VENDOR / "three.module.min.js").write_bytes(data)
    print("three ok", len(data), "bytes")
except Exception as e:
    print("three FAIL", e)
    raise SystemExit(1)

# --- Google Fonts (Amatic SC + Nunito), 仅取 latin 子集 ---
fam = {
    "amatic-sc": "Amatic+SC:wght@400;700",
    "nunito": "Nunito:ital,wght@0,300..900;1,300..900",
}
css_all = []
for key, spec in fam.items():
    css_url = f"https://fonts.googleapis.com/css2?family={spec}&display=swap"
    css = get(css_url, {"User-Agent": UA}).decode("utf-8")
    for m in re.finditer(r"src: url\((https://[^)]+\.woff2)\)", css):
        url = m.group(1)
        name = f"{key}-{len(list(FONTS.glob(key + '-*'))) + 1}.woff2"
        try:
            (FONTS / name).write_bytes(get(url))
            print("font", name, url.split("/")[-1])
        except Exception as e:
            print("font FAIL", url, e)
        css = css.replace(url, f"{name}")
    # 只保留 @font-face 规则，去掉其它
    faces = re.findall(r"@font-face\s*\{[^}]*\}", css, re.S)
    css_all.append("\n".join(faces))
    print(f"  {key}: {len(faces)} @font-face rules")

(FONTS / "fonts.css").write_text(
    "/* 本地自建字体子集（构建生成） */\n" + "\n".join(css_all), encoding="utf-8")
print("fonts.css written")
