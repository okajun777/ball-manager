#!/usr/bin/env python3
"""国内取扱球だけにカタログを絞る。

残す条件（いずれか）:
- japanUrl あり / 国内サイト URL
- ブランドが HI-SP / ABS / Sunbridge
- HI-SP 商品ページに載っている（Storm / Roto / 900 / HI-SP）
- ABS 商品一覧に載っている（Motiv / 900 / Nanodesu / ABS）
"""
from __future__ import annotations

import json
import re
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"
CACHE = ROOT / "scripts" / "_cache_hi_sp_products.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.0)"}
WORKERS = 12

JP_HOSTS = ("sunbridge-group.com", "hi-sp.co.jp", "absbowling.co.jp")
ALWAYS_BRANDS = {"hi-sp", "abs 300", "abs", "sunbridge"}
HI_SP_BRANDS = ("Storm", "Roto Grip", "900 Global", "HI-SP")
ABS_BRANDS = ("Motiv", "900 Global", "ABS 300")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def clean(s: str) -> str:
    return unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def norm(s: str) -> str:
    s = (s or "").lower().replace("ν", "new ")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def brand_key(s: str) -> str:
    return norm(s).replace("bowling", "").strip()


def map_brand_label(raw: str) -> str:
    t = (raw or "").lower()
    if "roto" in t or "ロト" in (raw or ""):
        return "Roto Grip"
    if "900" in t or "グローバル" in (raw or "") or "global" in t:
        return "900 Global"
    if "storm" in t or "ストーム" in (raw or ""):
        return "Storm"
    if "hi" in t and "sp" in t or "ハイスポ" in (raw or ""):
        return "HI-SP"
    if "motiv" in t or "モーティブ" in (raw or ""):
        return "Motiv"
    if "nano" in t or "ナノデス" in (raw or "") or "abs" in t:
        return "ABS 300"
    return raw.strip()


def slug_to_name(slug: str) -> str:
    s = slug.replace("_", "-")
    parts = [p for p in s.split("-") if p]
    out = []
    for p in parts:
        if p.lower() in {"iq", "ai", "se", "hk22", "v2", "ii", "iii", "uv"}:
            out.append(p.upper())
        else:
            out.append(p.capitalize())
    return " ".join(out)


def hi_sp_product_urls() -> list[str]:
    urls: list[str] = []
    for path in (
        "https://hi-sp.co.jp/product-sitemap.xml",
        "https://hi-sp.co.jp/product-sitemap2.xml",
    ):
        try:
            body = fetch(path)
        except Exception as exc:  # noqa: BLE001
            print("hi-sp sitemap fail", path, exc)
            continue
        for loc in re.findall(r"<loc>([^<]+)</loc>", body):
            if re.search(r"/product/[^/]+/?$", loc) and not loc.rstrip("/").endswith("/product"):
                urls.append(loc.rstrip("/") + "/")
    return sorted(set(urls))


def parse_hi_sp(url: str) -> dict | None:
    try:
        html = fetch(url)
    except Exception:
        return None
    slug = url.rstrip("/").split("/")[-1]
    brand_raw = ""
    m = re.search(r"ボウリングブランド[:：]\s*([^<\n]+)", html)
    if m:
        brand_raw = clean(m.group(1))
    title = ""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    if m:
        title = clean(m.group(1))

    # バッグ・シューズ等除外
    blob = (title + " " + html[:2000]).lower()
    if any(x in blob for x in ("バッグ", "シューズ", "タオル", "テープ", "グリップ", "シャツ", "ウェア")):
        # ただし球ページにも触れることがあるので title が球っぽければ残す
        if not re.search(r"[A-Za-zァ-ヶ]", title):
            return None

    name_ja = ""
    if title and re.search(r"[ァ-ヶー]", title) and not re.search(r"[A-Za-z]{3,}", title):
        name_ja = title
    elif title and re.search(r"[ァ-ヶー]", title):
        # 英＋日混在ならカタカナ部分
        m = re.search(r"[ァ-ヶー][ァ-ヶー・Ａ-ＺA-Za-z0-9\s]{1,40}", title)
        if m:
            name_ja = clean(m.group(0))

    name_en = ""
    if title and re.search(r"[A-Za-z]{3,}", title):
        en = re.sub(r"[ァ-ヶー・]+", " ", title)
        en = re.sub(r"[^A-Za-z0-9\s\-]", " ", en)
        name_en = re.sub(r"\s+", " ", en).strip()
    if not name_en:
        name_en = slug_to_name(slug)

    return {
        "url": url,
        "slug": slug.lower().replace("_", "-"),
        "brand": map_brand_label(brand_raw),
        "brandRaw": brand_raw,
        "nameEn": name_en,
        "nameJa": name_ja if name_ja not in {"ボール", "商品"} else "",
        "title": title,
    }


def abs_product_entries() -> list[dict]:
    out: list[dict] = []
    start = "https://www.absbowling.co.jp/product-category/cat01/"
    seen: set[str] = set()
    queue = [start]
    while queue:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            html = fetch(url)
        except Exception as exc:  # noqa: BLE001
            print("abs fail", url, exc)
            continue
        for href, title in re.findall(
            r'href="(https://www\.absbowling\.co\.jp/product/[^"?#]+/)"[^>]*>[\s\S]*?<[^>]+>([^<]{2,160})</',
            html,
            re.I,
        ):
            t = clean(title)
            if len(t) < 2 or t in {"詳細を見る", "Read more", "もっと見る"}:
                continue
            out.append({"url": href, "title": t})
        # looser link harvest
        for href in re.findall(r'https://www\.absbowling\.co\.jp/product/[^"?#]+/', html):
            out.append({"url": href, "title": ""})
        for loc in re.findall(
            r'https://www\.absbowling\.co\.jp/product-category/cat01(?:/page/\d+)?/',
            html,
        ):
            if not loc.endswith("/"):
                loc += "/"
            if loc not in seen:
                queue.append(loc)
        for loc in re.findall(r'href="(/product-category/cat01/page/\d+/)"', html):
            full = "https://www.absbowling.co.jp" + loc
            if full not in seen:
                queue.append(full)
    by_url: dict[str, dict] = {}
    for e in out:
        cur = by_url.get(e["url"])
        if not cur or (e["title"] and not cur.get("title")):
            by_url[e["url"]] = e
    return list(by_url.values())


def index_balls(balls: list[dict]) -> dict:
    by_id = {b["id"]: b for b in balls}
    by_brand_name: dict[tuple[str, str], list[dict]] = {}
    by_slug_tail: dict[str, list[dict]] = {}
    for b in balls:
        bk = brand_key(b.get("brand") or "")
        nk = norm(b.get("name") or "")
        by_brand_name.setdefault((bk, nk), []).append(b)
        by_brand_name.setdefault((bk, norm(b.get("nameJa") or "")), []).append(b)
        bid = (b.get("id") or "").lower()
        if "-" in bid:
            tail = bid.split("-", 1)[1]
            by_slug_tail.setdefault(tail, []).append(b)
            by_slug_tail.setdefault(tail.replace("-", ""), []).append(b)
    return {"by_id": by_id, "by_brand_name": by_brand_name, "by_slug_tail": by_slug_tail}


def match_ball(
    idx: dict,
    balls: list[dict],
    *,
    brands: tuple[str, ...] | list[str],
    name: str,
    slug: str = "",
) -> dict | None:
    slug_n = (slug or "").lower().replace("_", "-")
    if slug_n:
        for key in (slug_n, slug_n.replace("-", "")):
            cands = idx["by_slug_tail"].get(key) or []
            cands = [c for c in cands if not brands or c.get("brand") in brands]
            if len(cands) == 1:
                return cands[0]
            if len(cands) > 1 and brands:
                pref = [c for c in cands if c.get("brand") in brands]
                if len(pref) == 1:
                    return pref[0]

    nk = norm(name)
    if not nk:
        return None
    compact = nk.replace(" ", "")
    pool = [b for b in balls if not brands or b.get("brand") in brands]
    exact = []
    fuzzy = []
    for b in pool:
        bn = norm(b.get("name") or "")
        bj = norm(b.get("nameJa") or "")
        if bn == nk or bj == nk or bn.replace(" ", "") == compact or bj.replace(" ", "") == compact:
            exact.append(b)
        elif compact and len(compact) >= 5 and (
            compact in bn.replace(" ", "") or bn.replace(" ", "") in compact
        ):
            fuzzy.append(b)
    if len(exact) == 1:
        return exact[0]
    if len(exact) > 1:
        # prefer shorter name distance
        exact.sort(key=lambda b: abs(len(norm(b.get("name") or "")) - len(nk)))
        return exact[0]
    if len(fuzzy) == 1:
        return fuzzy[0]
    return None


def is_domestic_url(ball: dict) -> bool:
    blob = f"{ball.get('sourceUrl') or ''} {ball.get('japanUrl') or ''}".lower()
    return any(h in blob for h in JP_HOSTS)


def attach_jp(ball: dict, url: str, name_ja: str, tag: str) -> None:
    ball["japanUrl"] = url
    if name_ja and name_ja not in {"ボール", "商品"}:
        cur = (ball.get("nameJa") or "").strip()
        # ゴミ自動カタカナより公式っぽい表記を優先（中黒あり / 既存空）
        if not cur or ("・" in name_ja and "・" not in cur):
            ball["nameJa"] = name_ja
    memo = ball.get("memo") or ""
    marker = f"国内取扱（{tag}）"
    if marker not in memo:
        ball["memo"] = (memo + " / " + marker).strip(" /")


def main() -> None:
    balls: list[dict] = json.loads(CATALOG.read_text(encoding="utf-8"))
    idx = index_balls(balls)
    keep_ids: set[str] = set()

    def keep(b: dict) -> None:
        keep_ids.add(b["id"])

    for b in balls:
        if b.get("japanUrl") or is_domestic_url(b) or brand_key(b.get("brand") or "") in ALWAYS_BRANDS:
            keep(b)
    print(f"seed keep={len(keep_ids)}")

    # HI-SP
    hi_urls = hi_sp_product_urls()
    print(f"hi-sp products={len(hi_urls)}")
    products: list[dict] = []
    if CACHE.exists():
        try:
            cached = json.loads(CACHE.read_text(encoding="utf-8"))
            if cached.get("count") == len(hi_urls) and cached.get("items"):
                products = cached["items"]
                print(f"hi-sp cache hit {len(products)}")
        except Exception:
            products = []
    if not products:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(parse_hi_sp, u): u for u in hi_urls}
            done = 0
            for fut in as_completed(futs):
                done += 1
                p = fut.result()
                if p:
                    products.append(p)
                if done % 50 == 0 or done == len(hi_urls):
                    print(f"  hi-sp parsed {done}/{len(hi_urls)} ok={len(products)}")
        CACHE.write_text(
            json.dumps({"count": len(hi_urls), "items": products}, ensure_ascii=False),
            encoding="utf-8",
        )

    hi_ok = 0
    for p in products:
        brands: tuple[str, ...]
        if p["brand"] in HI_SP_BRANDS:
            brands = (p["brand"],)
        else:
            brands = HI_SP_BRANDS
        hit = match_ball(idx, balls, brands=brands, name=p["nameEn"], slug=p["slug"])
        if not hit and p["nameJa"]:
            hit = match_ball(idx, balls, brands=brands, name=p["nameJa"], slug=p["slug"])
        if hit:
            keep(hit)
            attach_jp(hit, p["url"], p["nameJa"], "HI-SP")
            hi_ok += 1
    print(f"hi-sp matched={hi_ok} keep={len(keep_ids)}")

    # ABS
    abs_entries = abs_product_entries()
    print(f"abs entries={len(abs_entries)}")
    abs_ok = 0
    for e in abs_entries:
        title = e.get("title") or ""
        slug = e["url"].rstrip("/").split("/")[-1]
        en_parts = re.findall(r"[A-Za-z][A-Za-z0-9\-\s]{1,60}", title)
        en = clean(en_parts[0]) if en_parts else slug_to_name(slug)
        ja = ""
        m = re.search(r"[ァ-ヶー][ァ-ヶー・\sA-Za-z0-9]{1,40}", title)
        if m:
            ja = clean(m.group(0))
        brand_guess = map_brand_label(title)
        brands = (brand_guess,) if brand_guess in ABS_BRANDS else ABS_BRANDS
        hit = match_ball(idx, balls, brands=brands, name=en, slug=slug)
        if not hit and ja:
            hit = match_ball(idx, balls, brands=brands, name=ja, slug=slug)
        if hit:
            keep(hit)
            attach_jp(hit, e["url"], ja, "ABS")
            abs_ok += 1
    print(f"abs matched={abs_ok} keep={len(keep_ids)}")

    kept = [b for b in balls if b["id"] in keep_ids]
    removed = len(balls) - len(kept)
    kept.sort(key=lambda b: (b.get("brand") or "", b.get("name") or "", b.get("id") or ""))
    CATALOG.write_text(json.dumps(kept, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"DONE kept={len(kept)} removed={removed}")
    print("brands", Counter(b["brand"] for b in kept).most_common())
    for brand in ("Storm", "Roto Grip", "900 Global", "Motiv", "Hammer", "Brunswick"):
        print(f"  {brand}: {sum(1 for b in kept if b['brand']==brand)}")


if __name__ == "__main__":
    main()
