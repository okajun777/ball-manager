#!/usr/bin/env python3
"""写真ゼロを許さない: 欠けている球をあらゆる手段で埋める。"""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path
from urllib.parse import quote, quote_plus, urljoin, urlparse

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


def head_ok(url: str) -> bool:
    try:
        req = urllib.request.Request(url, method="HEAD", headers=UA)
        with urllib.request.urlopen(req, timeout=20) as r:
            return 200 <= r.status < 400
    except Exception:
        try:
            raw = fetch_bytes(url)
            return len(raw) > 1500
        except Exception:
            return False


def save_jpeg(ball_id: str, image_url: str) -> str:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    out = IMG_DIR / f"{ball_id}.jpg"
    if out.exists() and out.stat().st_size > 1500:
        return f"/catalog-images/{out.name}"
    raw = fetch_bytes(image_url)
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


def is_bad(url: str) -> bool:
    u = url.lower()
    return any(
        x in u
        for x in (
            "logo",
            "icon",
            "avatar",
            "favicon",
            "jersey",
            "coolwick",
            "/cores/",
            "video_thumbnails",
            "sprite",
            "/common/",
            "string-pinsetter",
            "shoes-parts",
            "cta01",
            "100x100",
        )
    )


def bowwwl_candidates(ball: dict) -> list[str]:
    src = ball.get("sourceUrl") or ""
    m = re.search(r"/bowling-ball-database/([^/]+)/([^/?#]+)", src)
    out: list[str] = []
    if m:
        brand, slug = m.group(1), m.group(2)
        base = f"{brand}-{slug}"
        for style in ("ball_image_main", "ball_grid", "ball_thumbnail"):
            for ext in ("png", "jpg", "jpeg", "webp"):
                out.append(
                    f"https://www.bowwwl.com/sites/default/files/styles/{style}/public/balls/{base}.{ext}"
                )
                out.append(
                    f"https://www.bowwwl.com/sites/default/files/balls/{base}.{ext}"
                )
    return out


def extract_ball_imgs(html: str, page: str, prefer_slug: str = "") -> list[str]:
    found: list[str] = []
    for pat in (
        r'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
        r'content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
        r'(?:src|data-src|data-lazy-src)=["\']([^"\']+)["\']',
    ):
        for m in re.findall(pat, html, re.I):
            u = urljoin(page, m.strip())
            if is_bad(u):
                continue
            if not any(ext in u.lower() for ext in (".png", ".jpg", ".jpeg", ".webp")):
                continue
            found.append(u)
    # prefer URLs containing slug /balls/
    prefer_slug = prefer_slug.lower().replace(" ", "-")
    scored: list[tuple[int, str]] = []
    for u in dict.fromkeys(found):
        low = u.lower()
        score = 0
        if "/balls/" in low:
            score += 50
        if prefer_slug and prefer_slug in low:
            score += 100
        if "ball_image_main" in low:
            score += 20
        if "ball_grid" in low:
            score += 10
        if "/uploads/" in low and "hi-sp" in low:
            score += 30
        if "wp-content/uploads" in low:
            score += 15
        if score > 0:
            scored.append((score, u))
    scored.sort(key=lambda x: -x[0])
    return [u for _, u in scored]


def hisp_product_urls(name: str) -> list[str]:
    q = quote_plus(name)
    html = fetch(f"https://hi-sp.co.jp/?s={q}")
    links = re.findall(r"https?://hi-sp\.co\.jp/product/[^\"'#?\s]+/", html)
    # also relative
    links += [
        urljoin("https://hi-sp.co.jp/", m)
        for m in re.findall(r'href=["\'](/product/[^"\']+)/?["\']', html)
    ]
    bad = ("string-pinsetter", "shoes-parts", "catalog", "parts")
    out = []
    for u in links:
        low = u.lower()
        if any(b in low for b in bad):
            continue
        out.append(u.rstrip("/") + "/")
    return list(dict.fromkeys(out))[:8]


def manufacturer_pages(ball: dict) -> list[str]:
    brand = (ball.get("brand") or "").lower()
    name = ball.get("name") or ""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    pages: list[str] = []
    if brand == "storm":
        pages += [
            f"https://www.stormbowling.com/balls/{slug}",
            f"https://www.stormbowling.com/{slug}",
        ]
    if brand == "roto grip":
        pages += [
            f"https://www.rotogrip.com/balls/{slug}",
            f"https://www.rotogrip.com/{slug}",
        ]
        # HI-SP known rubicon pages
        for p in (
            "rubicon",
            "rubicon-ex",
            "rubicon-gt",
            "rubicon-uc2",
            "rubicon-uc3",
            "rubicon-uc3-trax",
            "rubicon-attack",
            "rubicon-extreme",
            "rubicon-booster",
            "retro-rg-spare",
        ):
            if p.replace("-", "") in slug.replace("-", "") or slug in p:
                pages.append(f"https://hi-sp.co.jp/product/{p}/")
    if brand == "motiv":
        pages += [
            f"https://www.motivbowling.com/balls/{slug}",
            f"https://www.motivbowling.com/products/{slug}",
        ]
    if brand == "hammer":
        pages += [
            f"https://www.hammerbowling.com/balls/{slug}",
            f"https://www.hammerbowling.com/{slug}",
        ]
    # always try hi-sp search for Storm family
    if brand in ("storm", "roto grip", "900 global"):
        try:
            pages.extend(hisp_product_urls(name))
        except Exception as e:
            print("  hisp search fail", e)
    return list(dict.fromkeys(pages))


def pick_image(ball: dict) -> str:
    bid = ball["id"]
    src = ball.get("sourceUrl") or ""
    slug = ""
    m = re.search(r"/bowling-ball-database/[^/]+/([^/?#]+)", src)
    if m:
        slug = m.group(1)

    # 1) constructed bowwwl URLs
    for url in bowwwl_candidates(ball):
        if head_ok(url):
            print("  try bowwwl-direct", url[:100])
            try:
                return save_jpeg(bid, url)
            except Exception as e:
                print("   save fail", e)

    # 2) parse bowwwl page for /balls/ matching slug
    if src:
        try:
            html = fetch(src)
            for url in extract_ball_imgs(html, src, prefer_slug=slug or bid):
                print("  try bowwwl-parse", url[:100])
                try:
                    return save_jpeg(bid, url)
                except Exception as e:
                    print("   save fail", e)
        except Exception as e:
            print("  bowwwl page fail", e)

    # 3) manufacturer / HI-SP
    for page in manufacturer_pages(ball):
        try:
            html = fetch(page)
        except Exception as e:
            print("  page fail", page, type(e).__name__)
            continue
        for url in extract_ball_imgs(html, page, prefer_slug=slug or ball["name"]):
            print("  try mfr", page, "->", url[:100])
            try:
                return save_jpeg(bid, url)
            except Exception as e:
                print("   save fail", e)

    # 4) Wikimedia / last resort: use related ball image already in catalog? NO - wrong.
    # Try bowwwl without style
    if slug:
        brand = (ball.get("brand") or "").lower().replace(" ", "-")
        guesses = [
            f"https://www.bowwwl.com/sites/default/files/balls/{brand}-{slug}.png",
            f"https://cdn.shopify.com/s/files/1/0015/1234/{slug}.jpg",  # unlikely
        ]
        for url in guesses:
            if "shopify" in url:
                continue
            if head_ok(url):
                try:
                    return save_jpeg(bid, url)
                except Exception:
                    pass
    return ""


def main() -> None:
    balls: list[dict] = json.loads(CATALOG.read_text(encoding="utf-8"))
    missing = [b for b in balls if not (b.get("imageUrl") or "").strip()]
    print("missing", len(missing))
    ok = 0
    for b in missing:
        print("=" * 60)
        print(b["id"], b["brand"], b["name"])
        path = pick_image(b)
        if path:
            b["imageUrl"] = path
            ok += 1
            print(" +", path)
        else:
            print(" FAILED")
    CATALOG.write_text(json.dumps(balls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    still = sum(1 for b in balls if not (b.get("imageUrl") or "").strip())
    print(f"done ok={ok} still_missing={still}")


if __name__ == "__main__":
    main()
