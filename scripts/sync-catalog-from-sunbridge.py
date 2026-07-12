#!/usr/bin/env python3
"""サンブリッジ（国内代理店）商品ページからカタログを補強する。

優先方針:
- 日本名 (nameJa) はサンブリッジ公式表記を正とする
- 国内にしかない球は新規追加
- 既存の bowwwl スペックは壊さず、欠けていれば補完
- japanUrl に国内商品ページを保存
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"
IMG_DIR = ROOT / "public" / "catalog-images"
SITEMAP = "https://www.sunbridge-group.com/product-sitemap.xml"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.0)"}
WORKERS = 8

BRAND_MAP = {
    "brunswick": "Brunswick",
    "dv8": "DV8",
    "radical": "Radical",
    "hammer": "Hammer",
    "ebonite": "Ebonite",
    "track": "Track",
    "track bowling": "Track",
    "sunbridge": "Sunbridge",
    "dexter": "Dexter",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def fetch_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()


def clean(s: str) -> str:
    s = unescape(re.sub(r"<[^>]+>", " ", s))
    s = s.replace("™", "").replace("®", "").replace("©", "")
    return re.sub(r"\s+", " ", s).strip()


def norm_key(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("ν", "new ").replace("ｖ", "v")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def clean_name_ja(s: str) -> str:
    s = clean(s)
    s = s.replace("‐", "・").replace("−", "・").replace("-", "・")
    s = re.sub(r"[™®©]", "", s)
    return s.strip(" ・")


def map_cover_type(raw: str) -> str:
    t = raw.replace("・", "").replace(" ", "")
    if "ハイブリッド" in t and "ウレタン" not in t:
        return "ハイブリッド・リアクティブ"
    if "パール" in t and "ウレタン" in t:
        return "パール・ウレタン"
    if "ソリッド" in t and "ウレタン" in t:
        return "ソリッド・ウレタン"
    if "ウレタン" in t:
        return "ソリッド・ウレタン"
    if "パール" in t:
        return "パール・リアクティブ"
    if "ソリッド" in t:
        return "ソリッド・リアクティブ"
    if "ポリエステル" in t or "プラス" in t:
        return "ポリエステル"
    return ""


def map_core_type(raw: str) -> str:
    if "非対称" in raw or "アシメ" in raw:
        return "非対称コア"
    if "対称" in raw or "シンメ" in raw:
        return "対称コア"
    return ""


def rg_classes(rg: float | None, diff: float | None) -> tuple[str, str]:
    rg_c = ""
    if rg is not None:
        if rg < 2.50:
            rg_c = "早め"
        elif rg < 2.55:
            rg_c = "やや早め"
        elif rg < 2.58:
            rg_c = "中間"
        elif rg < 2.62:
            rg_c = "やや遅め"
        else:
            rg_c = "遅め"
    diff_c = ""
    if diff is not None:
        if diff < 0.030:
            diff_c = "低め"
        elif diff < 0.045:
            diff_c = "中程度"
        else:
            diff_c = "高め"
    return rg_c, diff_c


def save_image(ball_id: str, image_url: str) -> str:
    if not image_url:
        return ""
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    out = IMG_DIR / f"{ball_id}.jpg"
    if out.exists() and out.stat().st_size > 2000:
        return f"/catalog-images/{ball_id}.jpg"
    try:
        raw = fetch_bytes(image_url)
    except Exception as exc:  # noqa: BLE001
        print("  image fail", ball_id, exc)
        return ""
    try:
        from io import BytesIO

        from PIL import Image

        with Image.open(BytesIO(raw)) as im:
            rgb = im.convert("RGB")
            rgb.thumbnail((800, 800))
            rgb.save(out, "JPEG", quality=78, optimize=True)
    except Exception:
        out.write_bytes(raw)
    return f"/catalog-images/{ball_id}.jpg"


def list_ball_urls() -> list[str]:
    xml = fetch(SITEMAP)
    locs = re.findall(r"<loc>(.*?)</loc>", xml)
    urls = sorted({u for u in locs if "/product/ball/all-balls/" in u})
    return urls


def parse_product(url: str) -> dict | None:
    try:
        html = fetch(url)
    except Exception as exc:  # noqa: BLE001
        print("  fetch fail", url, exc)
        return None

    slug = url.rstrip("/").split("/")[-1]

    en = ""
    m = re.search(r'<h1[^>]*class="[^"]*name[^"]*"[^>]*>(.*?)</h1>', html, re.S | re.I)
    if m:
        en = clean(m.group(1))
    if not en:
        m = re.search(r'property="og:title"\s+content="([^"]+)"', html, re.I)
        if m:
            en = clean(m.group(1).split("|")[0])

    ja = ""
    m = re.search(r'<div class="sub_ttl">\s*<p>\s*<span>(.*?)</span>', html, re.S | re.I)
    if m:
        ja = clean_name_ja(m.group(1))
    if not ja:
        # スペック表の商品名行
        m = re.search(r"<th>\s*商品名\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
        if m:
            ja = clean_name_ja(m.group(1))

    brand_raw = ""
    m = re.search(r"<th>\s*ブランド[：:]?\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
    if m:
        brand_raw = clean(m.group(1))
    if not brand_raw:
        # EN 先頭トークン
        brand_raw = en.split(" ")[0] if en else ""

    brand_key = brand_raw.lower().replace("bowling", "").strip()
    brand = BRAND_MAP.get(brand_key) or BRAND_MAP.get(norm_key(brand_raw)) or brand_raw.title()
    if brand.lower() in {"dexter"}:
        return None  # シューズ等除外

    # EN からブランド接頭辞を落とす
    name = en
    for prefix in (
        "Brunswick",
        "DV8",
        "RADICAL",
        "Radical",
        "HAMMER",
        "Hammer",
        "EBONITE",
        "Ebonite",
        "TRACK BOWLING",
        "Track Bowling",
        "TRACK",
        "Track",
        "SUNBRIDGE",
        "Sunbridge",
    ):
        if name.lower().startswith(prefix.lower() + " "):
            name = name[len(prefix) :].strip()
            break
    name = re.sub(r"\s+", " ", name).strip()
    if not name:
        name = slug.replace("-", " ").title()

    cover_stock = ""
    m = re.search(r"<th>\s*カバーストック\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
    if m:
        cover_stock = clean(m.group(1))
    cover_type_raw = ""
    m = re.search(r"<th>\s*カバータイプ\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
    if m:
        cover_type_raw = clean(m.group(1))
    core_name = ""
    m = re.search(r"<th>\s*コア\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
    if m:
        core_name = clean(m.group(1))
    core_attr = ""
    m = re.search(r"<th>\s*コア属性\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
    if m:
        core_attr = clean(m.group(1))
    finish = ""
    m = re.search(r"<th>\s*表面仕上げ\s*</th>\s*<td>(.*?)</td>", html, re.S | re.I)
    if m:
        finish = clean(m.group(1))

    rg = None
    diff = None
    mb = None
    m = re.search(r"RG\s*MIN[：:]\s*<span>([0-9.]+)</span>", html, re.I)
    if not m:
        m = re.search(r"RG\s*MIN[：:]\s*([0-9.]+)", html, re.I)
    if m:
        rg = float(m.group(1))
    m = re.search(r"RG\s*DIFF[：:]\s*<span>([0-9.]+)</span>", html, re.I)
    if not m:
        m = re.search(r"RG\s*DIFF[：:]\s*([0-9.]+)", html, re.I)
    if m:
        diff = float(m.group(1))
    m = re.search(r"RG\s*ASY[：:]\s*<span>([0-9.]+)</span>", html, re.I)
    if not m:
        m = re.search(r"RG\s*ASY[：:]\s*([0-9.]+)", html, re.I)
    if m:
        mb = float(m.group(1))

    og_image = ""
    m = re.search(r'property="og:image"\s+content="([^"]+)"', html, re.I)
    if m:
        og_image = m.group(1).strip()

    cover_type = map_cover_type(cover_type_raw or cover_stock)
    core_type = map_core_type(core_attr)
    cover_name = cover_stock
    if cover_type and cover_stock and "ソリッド" not in cover_stock and "パール" not in cover_stock and "ハイブリッド" not in cover_stock:
        # 種別を付記
        short = cover_type.split("・")[0]
        cover_name = f"{cover_stock} {short}"

    return {
        "url": url,
        "slug": slug,
        "brand": brand,
        "name": name,
        "nameJa": ja,
        "coverName": cover_name,
        "coverType": cover_type,
        "finish": finish,
        "coreName": core_name,
        "coreType": core_type,
        "rg": rg,
        "diff": diff,
        "mb": mb,
        "imageRemote": og_image,
        "nameKey": norm_key(name),
        "brandKey": norm_key(brand),
    }


def find_match(balls: list[dict], product: dict) -> dict | None:
    brand = product["brandKey"]
    name = product["nameKey"]
    slug = product["slug"]

    # exact brand+name
    for b in balls:
        if norm_key(b.get("brand") or "") == brand and norm_key(b.get("name") or "") == name:
            return b

    # exact slug suffix on id / japanUrl / sourceUrl path
    for b in balls:
        bid = (b.get("id") or "").lower()
        src = (b.get("sourceUrl") or "").lower().rstrip("/")
        jurl = (b.get("japanUrl") or "").lower().rstrip("/")
        if (
            bid == f"{brand}-{slug}"
            or bid.endswith(f"-{slug}")
            or src.endswith(f"/{slug}")
            or jurl.endswith(f"/{slug}")
        ):
            if brand in bid or brand == norm_key(b.get("brand") or ""):
                return b

    # compact name within brand (exact compact only)
    compact = name.replace(" ", "")
    candidates = []
    for b in balls:
        if norm_key(b.get("brand") or "") != brand:
            continue
        bn = norm_key(b.get("name") or "").replace(" ", "")
        if bn == compact:
            candidates.append(b)
    if len(candidates) == 1:
        return candidates[0]
    return None


def make_id(brand: str, slug: str) -> str:
    b = re.sub(r"[^a-z0-9]+", "-", brand.lower()).strip("-")
    s = re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    return f"{b}-{s}"


def apply_product(ball: dict, product: dict, *, is_new: bool) -> None:
    if product["nameJa"]:
        ball["nameJa"] = product["nameJa"]
    ball["japanUrl"] = product["url"]
    memo = ball.get("memo") or ""
    if "国内取扱（サンブリッジ）" not in memo:
        ball["memo"] = (memo + " / 国内取扱（サンブリッジ）").strip(" /")

    # 欠けているスペックだけ埋める
    if not ball.get("coverType") and product["coverType"]:
        ball["coverType"] = product["coverType"]
    if not ball.get("coverName") and product["coverName"]:
        ball["coverName"] = product["coverName"]
    if not ball.get("coreType") and product["coreType"]:
        ball["coreType"] = product["coreType"]
    if not ball.get("coreName") and product["coreName"]:
        ball["coreName"] = product["coreName"]
    if not ball.get("finish") and product["finish"]:
        ball["finish"] = product["finish"]
    if ball.get("rg") is None and product["rg"] is not None:
        ball["rg"] = product["rg"]
    if ball.get("diff") is None and product["diff"] is not None:
        ball["diff"] = product["diff"]
    if ball.get("mb") is None and product["mb"] is not None:
        ball["mb"] = product["mb"]

    rg_c, diff_c = rg_classes(ball.get("rg"), ball.get("diff"))
    if not ball.get("rgClass") and rg_c:
        ball["rgClass"] = rg_c
    if not ball.get("diffClass") and diff_c:
        ball["diffClass"] = diff_c

    if is_new or not ball.get("imageUrl"):
        local = save_image(ball["id"], product.get("imageRemote") or "")
        if local:
            ball["imageUrl"] = local

    if is_new and not ball.get("sourceUrl"):
        ball["sourceUrl"] = product["url"]


def main() -> None:
    balls: list[dict] = json.loads(CATALOG.read_text(encoding="utf-8"))
    urls = list_ball_urls()
    print(f"sunbridge ball urls: {len(urls)}")

    products: list[dict] = []
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(parse_product, u): u for u in urls}
        done = 0
        for fut in as_completed(futs):
            done += 1
            p = fut.result()
            if p:
                products.append(p)
            if done % 25 == 0 or done == len(urls):
                print(f"  parsed {done}/{len(urls)} ok={len(products)}")

    updated = 0
    added = 0
    unmatched = 0
    for product in sorted(products, key=lambda x: (x["brand"], x["name"])):
        hit = find_match(balls, product)
        if hit:
            apply_product(hit, product, is_new=False)
            updated += 1
            continue

        # 新規（国内限定など）
        ball_id = make_id(product["brand"], product["slug"])
        if any(b.get("id") == ball_id for b in balls):
            hit = next(b for b in balls if b["id"] == ball_id)
            apply_product(hit, product, is_new=False)
            updated += 1
            continue

        rg_c, diff_c = rg_classes(product["rg"], product["diff"])
        new_ball = {
            "id": ball_id,
            "brand": product["brand"],
            "name": product["name"],
            "nameJa": product["nameJa"],
            "coverName": product["coverName"],
            "coverType": product["coverType"],
            "finish": product["finish"],
            "coreName": product["coreName"],
            "coreType": product["coreType"],
            "rg": product["rg"],
            "diff": product["diff"],
            "mb": product["mb"],
            "rgClass": rg_c,
            "diffClass": diff_c,
            "memo": "国内取扱（サンブリッジ）",
            "releaseMonth": "",
            "imageUrl": "",
            "sourceUrl": product["url"],
            "japanUrl": product["url"],
        }
        apply_product(new_ball, product, is_new=True)
        balls.append(new_ball)
        added += 1
        print(f"  +ADD {product['brand']} {product['name']} / {product['nameJa']}")

    # ソート安定化
    balls.sort(key=lambda b: (b.get("brand") or "", b.get("name") or "", b.get("id") or ""))
    CATALOG.write_text(json.dumps(balls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    with_ja = sum(1 for b in balls if (b.get("nameJa") or "").strip())
    with_jp = sum(1 for b in balls if (b.get("japanUrl") or "").strip())
    print(
        f"done updated={updated} added={added} unmatched_skipped={unmatched} "
        f"with_nameJa={with_ja}/{len(balls)} with_japanUrl={with_jp}"
    )
    # samples
    for want in ("zenith-hybrid", "zenith-pearl", "quantum-bias-urethane", "deep-impact"):
        hits = [b for b in balls if want in (b.get("id") or "") or want in (b.get("japanUrl") or "")]
        for h in hits[:2]:
            print(f"  sample {h['id']} ja={h.get('nameJa')} japan={h.get('japanUrl')}")


if __name__ == "__main__":
    t0 = time.time()
    main()
    print(f"elapsed {time.time() - t0:.1f}s")
