#!/usr/bin/env python3
"""HI-SP の og:image（横長バナー）を商品本体写真に差し替える。"""
from __future__ import annotations

import json
import re
import urllib.request
from io import BytesIO
from pathlib import Path
from urllib.parse import urljoin

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"
IMG_DIR = ROOT / "public" / "catalog-images"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.2)"}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


def pick_product_image(html: str, page: str) -> str:
    imgs: list[tuple[int, str]] = []
    for m in re.findall(
        r'(?:src|data-src|data-large_image|data-srcset)=["\']([^"\']+)["\']',
        html,
        re.I,
    ):
        # srcset may have multiple
        first = m.split(",")[0].strip().split(" ")[0]
        u = urljoin(page, first)
        low = u.lower()
        if "/uploads/" not in low:
            continue
        if not any(ext in low for ext in (".png", ".jpg", ".jpeg", ".webp")):
            continue
        if any(
            x in low
            for x in (
                "logo",
                "icon",
                "-og.",
                "_og.",
                "100x100",
                "150x150",
                "160x120",
                "300x300",
                "woocommerce",
                "surface-list",
                "ctlg",
            )
        ):
            continue
        score = 10
        if re.search(r"-\d+\.(?:jpg|jpeg|png|webp)$", low):
            score += 40  # sweep_hard-freshorange-1.jpg
        if "sweep" in low or "hard" in low or "sweephard" in low:
            score += 50
        # 共通フッター画像などを除外
        if "289a0f6b67de9e85a8394aee3dc8eeb1" in low:
            score -= 100
        # prefer larger named originals over thumbnails
        if re.search(r"-\d+x\d+\.", low):
            score -= 30
        if low.endswith("_800.jpg") or "800." in low or "800-" in low:
            score += 15
        imgs.append((score, u))
    imgs = [(s, u) for s, u in imgs if s > 0]
    imgs.sort(key=lambda x: -x[0])
    return imgs[0][1] if imgs else ""


def save_squareish(ball_id: str, image_url: str) -> str:
    raw = fetch_bytes(image_url)
    out = IMG_DIR / f"{ball_id}.jpg"
    with Image.open(BytesIO(raw)) as im:
        rgb = im.convert("RGB")
        # Don't force tiny banners: keep up to 1000px on long side
        rgb.thumbnail((1000, 1000))
        w, h = rgb.size
        print(f"  saved {ball_id} from {image_url.split('/')[-1]} -> {w}x{h}")
        rgb.save(out, "JPEG", quality=85, optimize=True)
    return f"/catalog-images/{out.name}"


def main() -> None:
    balls = json.loads(CATALOG.read_text(encoding="utf-8"))
    targets = [
        b
        for b in balls
        if (b.get("brand") or "") == "HI-SP"
        and "sweep" in (b.get("id") or "").lower()
        and "hi-sp.co.jp/product/" in (b.get("sourceUrl") or "")
    ]
    # Also any local image that is suspiciously wide (banner)
    wide_ids = set()
    for b in targets:
        rel = (b.get("imageUrl") or "").replace("/catalog-images/", "")
        p = IMG_DIR / rel
        if p.exists():
            with Image.open(p) as im:
                w, h = im.size
                if w > 0 and h > 0 and w / h > 1.4:
                    wide_ids.add(b["id"])
                    print("wide", b["id"], w, h)

    # Always include freshorange
    for b in targets:
        if "freshorange" in b["id"]:
            wide_ids.add(b["id"])

    print("fix", len(wide_ids), "balls")
    for b in targets:
        if b["id"] not in wide_ids:
            continue
        page = b["sourceUrl"]
        try:
            html = fetch(page)
            img = pick_product_image(html, page)
            if not img:
                print("- no product img", b["id"])
                continue
            b["imageUrl"] = save_squareish(b["id"], img)
        except Exception as e:
            print("- fail", b["id"], e)

    CATALOG.write_text(json.dumps(balls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("done")


if __name__ == "__main__":
    main()
