#!/usr/bin/env python3
"""HI-SP（ハイスポーツ）独自球をカタログに追加する。"""
from __future__ import annotations

import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"
UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.0)"}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def clean(s: str) -> str:
    return unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def is_kana(s: str) -> bool:
    if not s:
        return False
    kana = sum(1 for c in s if "\u30a0" <= c <= "\u30ff" or "\u3040" <= c <= "\u309f" or c in "ー・")
    letters = sum(1 for c in s if c.isalpha() or ("\u30a0" <= c <= "\u30ff") or ("\u3040" <= c <= "\u309f") or c in "ー・")
    return letters > 0 and kana / letters >= 0.5


def slug_to_name(slug: str) -> str:
    parts = slug.replace("_", "-").split("-")
    out = []
    for p in parts:
        if p.lower() in {"hi", "sp", "r", "wh", "rs"}:
            out.append(p.upper())
        else:
            out.append(p.capitalize())
    return " ".join(out)


def parse_hi_sp_product(url: str) -> dict | None:
    try:
        html = fetch(url)
    except Exception:
        return None
    slug = url.rstrip("/").split("/")[-1]
    h1 = ""
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    if m:
        h1 = clean(m.group(1))

    brand_line = ""
    bm = re.search(r"ボウリングブランド[:：]\s*([^<\n]+)", html)
    if bm:
        brand_line = clean(bm.group(1))

    # HI-SP / ハイスポーツ のみ（Storm等は既存カタログ）
    bl = brand_line.lower()
    if "hi-sp" not in bl and "hi sp" not in bl and "ハイスポ" not in brand_line and "hi‑sp" not in bl:
        # sweep-hard は確実に HI-SP
        if "sweep" not in slug.lower():
            return None

    cover = ""
    core = ""
    finish = ""
    cm = re.search(r"カバーストック[:：]\s*([^<\n]+)", html)
    if cm:
        cover = clean(cm.group(1))
    km = re.search(r"コア[:：]\s*([^<\n]+)", html)
    if km:
        core = clean(km.group(1))
    fm = re.search(r"表面仕上げ[:：]\s*([^<\n]+)", html)
    if fm:
        finish = clean(fm.group(1))

    name_en = slug_to_name(slug)
    name_ja = h1 if is_kana(h1) else ""
    if not name_ja:
        # SWEEP HARD スイープ・ハード
        pm = re.search(
            r"(SWEEP\s*HARD[^\n<]{0,40})\s*(スイープ[・･]?ハード[^\n<]{0,40})",
            html,
            re.I,
        )
        if pm:
            name_en = clean(pm.group(1)).split("スイープ")[0].strip() or name_en
            name_ja = clean(pm.group(2))
        else:
            quotes = re.findall(r"「([^」]{2,40})」", html)
            for q in quotes:
                if "スイープ" in q or "ハード" in q:
                    name_ja = q
                    break
    if not name_ja and "sweep" in slug.lower():
        name_ja = "スイープ・ハード"
        if "clear" in slug.lower():
            name_ja = "スイープハード・クリア"
        elif "deep-purple" in slug.lower():
            name_ja = "スイープ・ハード（ディープパープル）"
        elif "freshorange" in slug.lower() or "fresh-orange" in slug.lower():
            name_ja = "スイープ・ハード（フレッシュオレンジ）"
        elif "stream-blue" in slug.lower():
            name_ja = "スイープ・ハード（ストリームブルー）"
        elif "white" in slug.lower() and "pearl" in slug.lower():
            name_ja = "スイープ・ハード（ホワイトパールパープル）"
        elif slug.endswith("-white") or slug.endswith("white"):
            name_ja = "スイープ・ハード（ホワイト）"
        elif "r-wh" in slug.lower() or "rs" in slug.lower():
            name_ja = "スイープ・ハード（レッドスパークル/ホワイト）"
        elif "vivian" in slug.lower():
            name_ja = "スイープハード・クリア（ビビアンレッド）"
        elif "blue-sky" in slug.lower():
            name_ja = "スイープハード・クリア（ブルースカイ）"

    # 英語名を整える
    if "sweep" in slug.lower():
        name_en = "Sweep Hard"
        extra = slug.lower().replace("sweep-hard-", "").replace("sweep-hard", "").strip("-")
        if extra and extra not in {"", "r-wh"}:
            name_en = f"Sweep Hard ({slug_to_name(extra)})"
        elif "r-wh" in slug.lower():
            name_en = "Sweep Hard (RS/WH)"

    cover_type = "プラスティック"
    if "polyester" in cover.lower() or "ポリエステル" in cover:
        cover_type = "プラスティック"
    if "ハード" in cover or "Hard" in cover:
        cover_name = cover or "Hard Polyester ソリッド"
    else:
        cover_name = cover or "Hard Polyester"

    ball_id = "hi-sp-" + re.sub(r"[^a-z0-9]+", "-", slug.lower()).strip("-")
    return {
        "id": ball_id,
        "brand": "HI-SP",
        "name": name_en,
        "nameJa": name_ja or "スイープ・ハード",
        "coverName": cover_name,
        "coverType": cover_type,
        "finish": finish or "ポリッシュ",
        "coreName": core.replace("コア", "").strip() or "3ピース",
        "coreType": "対称コア",
        "rg": None,
        "diff": None,
        "mb": None,
        "rgClass": "",
        "diffClass": "",
        "memo": "スペア／カバーボール向け",
        "releaseMonth": "",
        "imageUrl": "",
        "sourceUrl": url,
    }


def load_product_urls() -> list[str]:
    urls: list[str] = []
    for path in (
        "https://hi-sp.co.jp/product-sitemap.xml",
        "https://hi-sp.co.jp/product-sitemap2.xml",
        "https://hi-sp.co.jp/product-sitemap3.xml",
    ):
        try:
            body = fetch(path)
        except Exception:
            continue
        for loc in re.findall(r"<loc>([^<]+)</loc>", body):
            if re.search(r"/product/[^/]+/?$", loc) and not loc.rstrip("/").endswith("/product"):
                urls.append(loc.rstrip("/") + "/")
    return sorted(set(urls))


def main() -> None:
    catalog: list[dict] = json.loads(CATALOG.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in catalog}

    urls = [u for u in load_product_urls() if "sweep" in u.lower()]
    print(f"sweep urls: {len(urls)}")

    # 代表エントリ（色なし一般名）も検索用に追加
    base = {
        "id": "hi-sp-sweep-hard",
        "brand": "HI-SP",
        "name": "Sweep Hard",
        "nameJa": "スイープ・ハード",
        "coverName": "Hard Polyester",
        "coverType": "プラスティック",
        "finish": "ポリッシュ",
        "coreName": "3ピース",
        "coreType": "対称コア",
        "rg": None,
        "diff": None,
        "mb": None,
        "rgClass": "",
        "diffClass": "",
        "memo": "スペア／カバーボール向け・ハードポリエステル",
        "releaseMonth": "",
        "imageUrl": "",
        "sourceUrl": "https://hi-sp.co.jp/?s=スイープハード",
    }
    added = 0
    if base["id"] not in by_id:
        catalog.append(base)
        by_id[base["id"]] = base
        added += 1

    clear_base = {
        **base,
        "id": "hi-sp-sweep-hard-clear",
        "name": "Sweep Hard Clear",
        "nameJa": "スイープハード・クリア",
        "sourceUrl": "https://hi-sp.co.jp/?s=スイープハードクリア",
    }
    if clear_base["id"] not in by_id:
        catalog.append(clear_base)
        by_id[clear_base["id"]] = clear_base
        added += 1

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(parse_hi_sp_product, u): u for u in urls}
        for fut in as_completed(futs):
            row = fut.result()
            if not row:
                continue
            if row["id"] in by_id:
                # nameJa を補強
                cur = by_id[row["id"]]
                if row.get("nameJa") and not cur.get("nameJa"):
                    cur["nameJa"] = row["nameJa"]
                continue
            catalog.append(row)
            by_id[row["id"]] = row
            added += 1
            print(" +", row["name"], "/", row.get("nameJa"))

    catalog.sort(key=lambda b: ((b.get("brand") or "").lower(), (b.get("name") or "").lower()))
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"done added={added} total={len(catalog)}")


if __name__ == "__main__":
    main()
