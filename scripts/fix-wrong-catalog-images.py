#!/usr/bin/env python3
"""欠け／取り違え写真を、ファイル名が球slugに一致するものだけ採用して修正する。"""
from __future__ import annotations

import json
import re
import urllib.request
from io import BytesIO
from pathlib import Path
from urllib.parse import unquote, urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"
IMG_DIR = ROOT / "public" / "catalog-images"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.2)"}

# 前回誤って別球画像を入れた可能性が高いもの
SUSPECT = {
    "motiv-tank-yellowjacket",
    "motiv-venom-exj",
    "motiv-vip-exj-sigma",
    "roto-grip-retro-rg-spare",
}


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
        raw = fetch_bytes(url)
        return len(raw) > 2000
    except Exception:
        return False


def save_jpeg(ball_id: str, image_url: str) -> str:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    out = IMG_DIR / f"{ball_id}.jpg"
    raw = fetch_bytes(image_url)
    from PIL import Image

    with Image.open(BytesIO(raw)) as im:
        rgb = im.convert("RGB")
        rgb.thumbnail((800, 800))
        rgb.save(out, "JPEG", quality=78, optimize=True)
    return f"/catalog-images/{out.name}"


def slug_from_ball(ball: dict) -> str:
    src = ball.get("sourceUrl") or ""
    m = re.search(r"/bowling-ball-database/[^/]+/([^/?#]+)", src)
    if m:
        return unquote(m.group(1)).lower()
    return (ball.get("id") or "").split("-", 1)[-1]


def brand_slug(ball: dict) -> str:
    src = ball.get("sourceUrl") or ""
    m = re.search(r"/bowling-ball-database/([^/]+)/", src)
    if m:
        return m.group(1).lower()
    return (ball.get("brand") or "").lower().replace(" ", "-")


def filename_matches(url: str, brand: str, slug: str) -> bool:
    path = unquote(urlparse(url).path).lower()
    name = path.rsplit("/", 1)[-1]
    # strip extension and size suffixes
    stem = re.sub(r"\.(png|jpe?g|webp)$", "", name)
    stem = re.sub(r"_\d+$", "", stem)
    keys = [
        f"{brand}-{slug}",
        slug,
        slug.replace("-", ""),
    ]
    # yellowjacket variants
    if "yellowjacket" in slug:
        keys += ["tank-yellowjacket", "yellow-jacket", "yellowjacket"]
    if "venom-exj" in slug or slug == "venom-exj":
        keys += ["venom-exj", "venomexj"]
    if "vip-exj" in slug:
        keys += ["vip-exj-sigma", "vip-exj", "sigma"]
    if "retro-rg-spare" in slug:
        keys += ["retro-rg-spare", "retro-rg", "rg-spare"]
    for k in keys:
        if k and k in stem:
            # reject if clearly another known ball prefix mismatch
            if stem.startswith(brand) or brand.replace("-", "") in stem.replace("-", "") or k == slug or k in stem:
                return True
    return False


def candidates(ball: dict) -> list[str]:
    brand = brand_slug(ball)
    slug = slug_from_ball(ball)
    out: list[str] = []
    bases = [f"{brand}-{slug}", slug]
    # alternate spellings
    if "yellowjacket" in slug:
        bases += [
            f"{brand}-tank-yellowjacket",
            f"{brand}-yellowjacket",
            f"{brand}-tank-yellow-jacket",
        ]
    for base in bases:
        for style in ("ball_image_main", "ball_grid", ""):
            for ext in ("png", "jpg", "jpeg", "webp"):
                if style:
                    out.append(
                        f"https://www.bowwwl.com/sites/default/files/styles/{style}/public/balls/{base}.{ext}"
                    )
                out.append(f"https://www.bowwwl.com/sites/default/files/balls/{base}.{ext}")
    return list(dict.fromkeys(out))


def parse_matching(ball: dict) -> list[str]:
    src = ball.get("sourceUrl") or ""
    if not src:
        return []
    html = fetch(src)
    brand = brand_slug(ball)
    slug = slug_from_ball(ball)
    found = []
    for m in re.findall(r'(?:src|content)=["\']([^"\']+)["\']', html, re.I):
        u = urljoin(src, m)
        if "/balls/" not in u.lower():
            continue
        if "/cores/" in u.lower():
            continue
        if filename_matches(u, brand, slug):
            found.append(u)
    return list(dict.fromkeys(found))


def hisp_match(ball: dict) -> list[str]:
    name = ball.get("name") or ""
    brand = (ball.get("brand") or "").lower()
    if brand not in ("storm", "roto grip", "900 global"):
        return []
    from urllib.parse import quote_plus

    html = fetch(f"https://hi-sp.co.jp/?s={quote_plus(name)}")
    links = re.findall(r"https?://hi-sp\.co\.jp/product/[^\"'#\s]+/", html)
    slug = slug_from_ball(ball).replace("-", "")
    good = []
    for link in links:
        low = link.lower().replace("-", "")
        if any(x in low for x in ("stringpinsetter", "shoesparts", "catalog")):
            continue
        # name tokens
        tokens = [t for t in re.split(r"[^a-z0-9]+", (ball.get("name") or "").lower()) if len(t) > 2]
        if tokens and not any(t in low for t in tokens[:3]):
            # also try slug pieces
            if slug[:6] not in low and not any(t in low for t in tokens):
                continue
        good.append(link.rstrip("/") + "/")
    out = []
    for page in list(dict.fromkeys(good))[:5]:
        try:
            ph = fetch(page)
        except Exception:
            continue
        # og image
        for pat in (
            r'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
            r'content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
            r'<img[^>]+src=["\']([^"\']+)["\']',
        ):
            for m in re.findall(pat, ph, re.I):
                u = urljoin(page, m)
                if "uploads" in u.lower() and any(ext in u.lower() for ext in (".png", ".jpg", ".jpeg", ".webp")):
                    if not any(x in u.lower() for x in ("logo", "icon", "100x100", "cta")):
                        out.append(u)
    return list(dict.fromkeys(out))


def manufacturer_direct(ball: dict) -> list[str]:
    brand = (ball.get("brand") or "").lower()
    slug = slug_from_ball(ball)
    name_slug = re.sub(r"[^a-z0-9]+", "-", (ball.get("name") or "").lower()).strip("-")
    pages = []
    if brand == "motiv":
        pages += [
            f"https://www.motivbowling.com/balls/{name_slug}",
            f"https://www.motivbowling.com/products/{name_slug}",
            f"https://www.motivbowling.com/{name_slug}",
        ]
    if brand == "hammer":
        pages += [f"https://www.hammerbowling.com/balls/{name_slug}"]
    if brand == "storm":
        pages += [f"https://www.stormbowling.com/balls/{name_slug}"]
    if brand == "roto grip":
        pages += [
            f"https://www.rotogrip.com/balls/{name_slug}",
            f"https://hi-sp.co.jp/product/{name_slug}/",
        ]
    out = []
    for page in pages:
        try:
            html = fetch(page)
        except Exception as e:
            print("  mfr fail", page, type(e).__name__)
            continue
        print("  mfr ok", page)
        for pat in (
            r'property=["\']og:image["\']\s+content=["\']([^"\']+)["\']',
            r'content=["\']([^"\']+)["\']\s+property=["\']og:image["\']',
            r'(?:src|data-src)=["\']([^"\']+\.(?:png|jpe?g|webp)[^"\']*)["\']',
        ):
            for m in re.findall(pat, html, re.I):
                u = urljoin(page, m)
                low = u.lower()
                if any(x in low for x in ("logo", "icon", "avatar")):
                    continue
                out.append(u)
    return list(dict.fromkeys(out))


def fix_ball(ball: dict) -> bool:
    bid = ball["id"]
    brand = brand_slug(ball)
    slug = slug_from_ball(ball)
    print("=" * 60, bid)

    tried = []
    for url in candidates(ball):
        tried.append(url)
        if head_ok(url) and filename_matches(url, brand, slug):
            print(" + direct", url[:110])
            ball["imageUrl"] = save_jpeg(bid, url)
            return True

    try:
        for url in parse_matching(ball):
            print(" + parse", url[:110])
            ball["imageUrl"] = save_jpeg(bid, url)
            return True
    except Exception as e:
        print(" parse fail", e)

    for url in hisp_match(ball) + manufacturer_direct(ball):
        # manufacturer og images usually correct for product page
        print(" + other", url[:110])
        try:
            ball["imageUrl"] = save_jpeg(bid, url)
            return True
        except Exception as e:
            print("  save fail", e)

    print(" FAILED after", len(tried), "direct tries")
    return False


def main() -> None:
    balls = json.loads(CATALOG.read_text(encoding="utf-8"))
    # verify all images: for SUSPECT, always refetch; for others with image, check filename if possible
    targets = [b for b in balls if b.get("id") in SUSPECT]
    # also any still missing
    targets += [b for b in balls if not (b.get("imageUrl") or "").strip()]
    # dedupe
    seen = set()
    uniq = []
    for b in targets:
        if b["id"] in seen:
            continue
        seen.add(b["id"])
        uniq.append(b)

    ok = 0
    for b in uniq:
        if fix_ball(b):
            ok += 1

    CATALOG.write_text(json.dumps(balls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    missing = [b["id"] for b in balls if not (b.get("imageUrl") or "").strip()]
    print("fixed", ok, "/", len(uniq), "still", missing)


if __name__ == "__main__":
    main()
