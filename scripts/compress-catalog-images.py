"""カタログ画像を JPEG に圧縮（最大辺 800px）。

使い方:
  python scripts/compress-catalog-images.py
"""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMG_DIR = ROOT / "public" / "catalog-images"
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"
MAX_SIDE = 800
QUALITY = 78


def compress_images() -> None:
    before = sum(p.stat().st_size for p in IMG_DIR.iterdir() if p.is_file())
    for path in list(IMG_DIR.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        try:
            with Image.open(path) as im:
                rgb = im.convert("RGB")
                rgb.thumbnail((MAX_SIDE, MAX_SIDE))
                out = path.with_suffix(".jpg")
                rgb.save(out, "JPEG", quality=QUALITY, optimize=True)
            if path.resolve() != out.resolve():
                path.unlink(missing_ok=True)
            print("ok", out.name)
        except Exception as exc:  # noqa: BLE001
            print("fail", path.name, exc)
    after = sum(p.stat().st_size for p in IMG_DIR.iterdir() if p.is_file())
    print(f"size {before/1e6:.1f}MB -> {after/1e6:.1f}MB")


def sync_catalog_json() -> None:
    balls = json.loads(CATALOG.read_text(encoding="utf-8"))
    updated = 0
    for ball in balls:
        url = ball.get("imageUrl") or ""
        name = Path(url).name
        stem = Path(name).stem
        jpg_rel = f"/catalog-images/{stem}.jpg"
        if (IMG_DIR / f"{stem}.jpg").exists():
            if ball.get("imageUrl") != jpg_rel:
                ball["imageUrl"] = jpg_rel
                updated += 1
    CATALOG.write_text(json.dumps(balls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("catalog urls updated", updated)


if __name__ == "__main__":
    compress_images()
    sync_catalog_json()
