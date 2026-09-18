#!/usr/bin/env python3
"""Rasterize the header pyramid into favicon / apple-touch / PWA PNG sizes."""
from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
HEADER = ROOT / "img" / "aia-pyramid-header.svg"
OG_SVG = ROOT / "img" / "og.svg"


def square_mark() -> str:
    """Header mark with a full-bleed square so iOS/Android apply their own mask."""
    svg = HEADER.read_text()
    svg = svg.replace(' rx="56"', "")
    svg = svg.replace(' width="1024" height="1024"', "")
    return svg


def render_svg(svg: str, dest: Path, width: int, height: int | None = None) -> None:
    height = height or width
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as tmp:
        tmp.write(svg)
        src = tmp.name
    subprocess.check_call(
        ["rsvg-convert", "-w", str(width), "-h", str(height), "-o", str(dest), src],
    )
    Path(src).unlink(missing_ok=True)


def png_info(path: Path) -> tuple[int, int]:
    with Image.open(path) as im:
        im.load()
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")
            im.save(path, "PNG")
        return im.size


def main() -> None:
    mark = square_mark()
    apple = ROOT / "apple-touch-icon.png"
    render_svg(mark, apple, 180)
    png_info(apple)
    pre = ROOT / "apple-touch-icon-precomposed.png"
    Image.open(apple).save(pre, "PNG")

    icon_192 = ROOT / "img" / "icon-192.png"
    icon_512 = ROOT / "img" / "icon-512.png"
    render_svg(mark, icon_192, 192)
    render_svg(mark, icon_512, 512)
    png_info(icon_192)
    png_info(icon_512)

    ico = ROOT / "favicon.ico"
    with Image.open(icon_512) as src:
        src = src.convert("RGBA")
        sizes = [(16, 16), (32, 32), (48, 48)]
        src.save(ico, format="ICO", sizes=sizes)

    if OG_SVG.exists():
        og = ROOT / "img" / "og.png"
        render_svg(OG_SVG.read_text(), og, 1200, 630)
        png_info(og)

    print("wrote", apple, pre, ico, icon_192, icon_512)


if __name__ == "__main__":
    main()
