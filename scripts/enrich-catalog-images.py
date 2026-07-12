#!/usr/bin/env python3
"""カタログ球の写真を補完する。

優先順:
1) 既存の sourceUrl（主に bowwwl）の og:image
2) ABS / HI-SP など日本メーカーの商品ページ（sourceUrl が該当ドメインのとき）

取得した画像は public/catalog-images/ に JPEG 保存し、catalogBalls.json の imageUrl を更新する。
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from threading import Lock
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "src" / "data" / "catalogBalls.json"
IMG_DIR = ROOT / "public" / "catalog-images"
PROGRESS_PATH = ROOT / "scripts" / ".catalog-images-progress.json"

UA = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; BallManagerCatalog/1.1; "
        "+https://okajun777.github.io/ball-manager/)"
    )
}
WORKERS = 8
SAVE_EVERY = 25
write_lock = Lock()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


def og_image(html: str, page_url: str = "", prefer_slug: str = "") -> str:
    prefer_slug = (prefer_slug or "").lower()
    candidates: list[tuple[int, str]] = []

    def add(url: str, base_score: int = 0) -> None:
        url = urljoin(page_url, url.strip()) if page_url else url.strip()
        if not url or not is_ball_like_image(url):
            return
        low = url.lower()
        score = base_score
        if "/balls/" in low:
            score += 40
        if prefer_slug and prefer_slug in low:
            score += 100
        if "ball_image_main" in low:
            score += 20
        if "ball_grid" in low:
            score += 10
        if "/uploads/" in low:
            score += 15
        candidates.append((score, url))

    for pat in (
        r'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
        r'content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
        r'property=["\']og:image:url["\']\s+content=["\']([^"\']+)["\']',
    ):
        m = re.search(pat, html, re.I)
        if m:
            add(m.group(1), 30)

    for m in re.findall(
        r'src=["\']([^"\']*styles/ball_(?:image_main|grid)/[^"\']+)["\']',
        html,
        re.I,
    ):
        add(m, 50)

    for m in re.findall(r'src=["\']([^"\']+/balls/[^"\']+\.(?:png|jpe?g|webp)[^"\']*)["\']', html, re.I):
        add(m, 60)

    host = urlparse(page_url).netloc if page_url else ""
    if "absbowling" in host or "hi-sp" in host:
        imgs = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html, re.I)
        for src in imgs:
            full = urljoin(page_url, src.strip())
            low = full.lower()
            if "/uploads/" in low and any(ext in low for ext in (".png", ".jpg", ".jpeg", ".webp")):
                add(full, 25)

    # constructed bowwwl path from prefer_slug
    if prefer_slug and "bowwwl.com" in (page_url or ""):
        m = re.search(r"/bowling-ball-database/([^/]+)/([^/?#]+)", page_url)
        if m:
            base = f"{m.group(1)}-{m.group(2)}"
            for style in ("ball_image_main", "ball_grid"):
                add(
                    f"https://www.bowwwl.com/sites/default/files/styles/{style}/public/balls/{base}.png",
                    80,
                )

    if not candidates:
        return ""
    candidates.sort(key=lambda x: -x[0])
    # If we have a prefer_slug, require it in path when any /balls/ candidates exist
    if prefer_slug:
        matched = [u for s, u in candidates if prefer_slug in u.lower() and "/balls/" in u.lower()]
        if matched:
            return matched[0]
    return candidates[0][1]


def is_ball_like_image(url: str) -> bool:
    u = url.lower()
    if any(
        x in u
        for x in (
            "logo",
            "icon",
            "avatar",
            "jersey",
            "coolwick",
            "banner",
            "favicon",
            "sprite",
            "/common/",
            "icon_",
        )
    ):
        return False
    if "/cores/" in u:
        return False
    return True


def local_name(ball_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", ball_id).strip("-").lower()
    return f"{safe}.jpg"


def save_jpeg(ball_id: str, image_url: str) -> str:
    if not image_url:
        return ""
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    out = IMG_DIR / local_name(ball_id)
    if out.exists() and out.stat().st_size > 1500:
        return f"/catalog-images/{out.name}"
    try:
        raw = fetch_bytes(image_url)
    except Exception as exc:  # noqa: BLE001
        print("  dl fail", ball_id, type(exc).__name__, exc)
        return ""
    try:
        from PIL import Image

        with Image.open(BytesIO(raw)) as im:
            rgb = im.convert("RGB")
            rgb.thumbnail((800, 800))
            rgb.save(out, "JPEG", quality=78, optimize=True)
    except Exception:
        out.write_bytes(raw)
    if out.stat().st_size < 800:
        out.unlink(missing_ok=True)
        return ""
    return f"/catalog-images/{out.name}"


def candidate_page_urls(ball: dict) -> list[str]:
    urls: list[str] = []
    src = (ball.get("sourceUrl") or "").strip()
    if src:
        urls.append(src)
    brand = (ball.get("brand") or "").lower()
    name = ball.get("name") or ""
    # ABS 日本公式（アキュスペア等）
    if "abs" in brand or "nanodesu" in name.lower():
        if "accu spare" in name.lower() or "アキュスペア" in (ball.get("nameJa") or ""):
            urls.append("https://www.absbowling.co.jp/product/product-814/")
    return list(dict.fromkeys(urls))


def enrich_one(ball: dict) -> tuple[str, str, str]:
    """returns (ball_id, imageUrl or '', note)"""
    bid = ball.get("id") or ""
    if (ball.get("imageUrl") or "").strip():
        return bid, ball["imageUrl"], "skip-has"
    for page in candidate_page_urls(ball):
        try:
            html = fetch(page)
        except Exception as exc:  # noqa: BLE001
            return bid, "", f"page-fail:{type(exc).__name__}"
        img = og_image(html, page, prefer_slug=(ball.get("id") or "").split("-", 1)[-1])
        # also pass full id slug from sourceUrl
        m = re.search(r"/bowling-ball-database/[^/]+/([^/?#]+)", page)
        if m:
            img2 = og_image(html, page, prefer_slug=m.group(1))
            if img2:
                img = img2
        if not img or not is_ball_like_image(img):
            continue
        local = save_jpeg(bid, img)
        if local:
            return bid, local, "ok"
        return bid, "", "save-fail"
    return bid, "", "no-image"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="0=all missing")
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--brand", default="", help="optional brand filter")
    ap.add_argument("--only-ids", default="", help="comma-separated ids")
    args = ap.parse_args()

    balls: list[dict] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in balls if b.get("id")}

    targets = [
        b
        for b in balls
        if not (b.get("imageUrl") or "").strip()
        and (b.get("sourceUrl") or b.get("id"))
    ]
    if args.brand:
        bl = args.brand.lower()
        targets = [b for b in targets if bl in (b.get("brand") or "").lower()]
    if args.only_ids:
        want = {x.strip() for x in args.only_ids.split(",") if x.strip()}
        targets = [b for b in balls if b.get("id") in want]

    # 新しい球を優先
    targets.sort(key=lambda b: b.get("releaseMonth") or "", reverse=True)
    if args.limit and args.limit > 0:
        targets = targets[: args.limit]

    print(f"targets={len(targets)} workers={args.workers}")
    done = 0
    ok = 0
    fail = 0
    t0 = time.time()

    def save_catalog() -> None:
        CATALOG_PATH.write_text(
            json.dumps(balls, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(enrich_one, b): b["id"] for b in targets}
        for fut in as_completed(futs):
            bid = futs[fut]
            done += 1
            try:
                _id, image_url, note = fut.result()
            except Exception as exc:  # noqa: BLE001
                fail += 1
                print("ERR", bid, exc)
                continue
            if image_url and note == "ok":
                with write_lock:
                    if bid in by_id:
                        by_id[bid]["imageUrl"] = image_url
                ok += 1
                print("+", bid, image_url)
            else:
                fail += 1
                if note not in ("skip-has",):
                    print("-", bid, note)
            if done % SAVE_EVERY == 0:
                with write_lock:
                    save_catalog()
                elapsed = time.time() - t0
                print(f"… {done}/{len(targets)} ok={ok} fail={fail} {elapsed:.0f}s")

    save_catalog()
    with_img = sum(1 for b in balls if (b.get("imageUrl") or "").strip())
    print(f"done ok={ok} fail={fail} with_img={with_img}/{len(balls)}")


if __name__ == "__main__":
    main()
