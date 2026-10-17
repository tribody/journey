# -*- coding: utf-8 -*-
"""下载 three r161 的 examples/jsm 后处理链到 vendor/jsm（构建期工具，可重复运行）。

原版网站用 RenderPipeline 做 bloom；本地没有 npm，所以把需要的 jsm 模块拉到
vendor/jsm 下，并把内部的 `from 'three'` 改写成指向 vendor/three.module.min.js 的相对路径。
"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor"
JSM = VENDOR / "jsm"

VER = "0.161.0"
BASE = f"https://unpkg.com/three@{VER}/examples/jsm"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/122.0 Safari/537.36")

FILES = [
    "postprocessing/Pass.js",
    "postprocessing/MaskPass.js",
    "postprocessing/ShaderPass.js",
    "postprocessing/RenderPass.js",
    "postprocessing/EffectComposer.js",
    "postprocessing/UnrealBloomPass.js",
    "postprocessing/OutputPass.js",
    "shaders/CopyShader.js",
    "shaders/LuminosityHighPassShader.js",
    "shaders/OutputShader.js",
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def rewrite(src, depth):
    """把 `from 'three'` 换成相对 vendor/three.module.min.js 的路径。"""
    up = "../" * depth + "three.module.min.js"
    src = re.sub(r"""from\s+(['"])three\1""", f"from '{up}'", src)
    return src


for rel in FILES:
    dst = JSM / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    try:
        src = get(f"{BASE}/{rel}")
    except Exception as e:
        print("FAIL", rel, e)
        continue
    # 目标目录相对 vendor 的层数：vendor/jsm/postprocessing/x.js -> 需 ../.. 两级
    depth = len(Path(rel).parts)
    dst.write_text(rewrite(src, depth), encoding="utf-8")
    print("ok", rel, len(src), "bytes ->", dst.relative_to(ROOT))

print("done")
