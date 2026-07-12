#!/usr/bin/env python3
"""bowwwl サイトマップから過去球を含めカタログを拡充する。

⚠️ このリポジトリは国内取扱球中心。新規の海外のみ球を追加しない。
   国内カタログ更新は sync-catalog-from-sunbridge.py / HI-SP / ABS を使うこと。
   どうしても bowwwl 同期する場合のみ: --force
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "src" / "data" / "catalogBalls.json"

if __name__ == "__main__" and "--force" not in sys.argv:
    print(
        "ERROR: カタログは国内取扱優先です。bowwwl からの海外球追加はしません。\n"
        "国内更新: python scripts/sync-catalog-from-sunbridge.py\n"
        "絞り込み: python scripts/filter-catalog-japan-only.py\n"
        "どうしても bowwwl 同期する場合: python scripts/sync-catalog-from-bowwwl.py --force",
        file=sys.stderr,
    )
    raise SystemExit(1)

UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.0)"}

BRAND_DISPLAY: dict[str, str] = {
    "900-global": "900 Global",
    "columbia-300": "Columbia 300",
    "roto-grip": "Roto Grip",
    "dv8": "DV8",
    "swag": "SWAG",
    "iq": "IQ",
}

# スラッグ内の単語を表示名向けに整形
WORD_FIX: dict[str, str] = {
    "ii": "II",
    "iii": "III",
    "iv": "IV",
    "v": "V",
    "vi": "VI",
    "vii": "VII",
    "viii": "VIII",
    "ix": "IX",
    "x": "X",
    "xi": "XI",
    "xii": "XII",
    "xv": "XV",
    "iq": "IQ",
    "rg": "RG",
    "mb": "MB",
    "pba": "PBA",
    "usbc": "USBC",
    "dv8": "DV8",
    "swag": "SWAG",
    "abs": "ABS",
    "hnt": "HNT",
    "ufo": "UFO",
    "dna": "DNA",
    "rst": "RST",
    "x-comp": "X-Comp",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def load_sitemap_urls() -> list[str]:
    urls: list[str] = []
    for page in (1, 2, 3, 4, 5):
        try:
            body = fetch(f"https://www.bowwwl.com/sitemap.xml?page={page}")
        except Exception as e:
            if page == 1:
                raise
            print(f"sitemap page {page} skip: {e}")
            break
        locs = re.findall(r"<loc>([^<]+)</loc>", body)
        if not locs:
            break
        urls.extend(locs)
        print(f"sitemap page {page}: {len(locs)}")
    return urls


def brand_display(slug: str) -> str:
    if slug in BRAND_DISPLAY:
        return BRAND_DISPLAY[slug]
    return " ".join(WORD_FIX.get(p, p.capitalize()) for p in slug.split("-"))


def name_from_slug(slug: str) -> str:
    parts: list[str] = []
    for p in slug.split("-"):
        if p in WORD_FIX:
            parts.append(WORD_FIX[p])
        elif re.fullmatch(r"\d+", p):
            parts.append(p)
        elif re.fullmatch(r"!\w+", p):
            parts.append("!" + p[1:].upper() if len(p) <= 3 else "!" + p[1:].capitalize())
        else:
            parts.append(p.capitalize())
    return " ".join(parts)


def parse_ball_url(url: str) -> tuple[str, str, str] | None:
    m = re.match(
        r"https://www\.bowwwl\.com/bowling-ball-database/([^/]+)/([^/?#]+)/?$",
        url,
    )
    if not m:
        return None
    brand_slug, ball_slug = m.group(1), m.group(2)
    if brand_slug in {"coverstocks", "cores"} or ball_slug in {"coverstocks", "cores"}:
        return None
    return brand_slug, ball_slug, url


def make_id(brand_slug: str, ball_slug: str) -> str:
    return f"{brand_slug}-{ball_slug}"


def empty_stub(brand: str, name: str, ball_id: str, source_url: str) -> dict:
    return {
        "id": ball_id,
        "brand": brand,
        "name": name,
        "coverName": "",
        "coverType": "",
        "finish": "",
        "coreName": "",
        "coreType": "",
        "rg": None,
        "diff": None,
        "mb": None,
        "rgClass": "",
        "diffClass": "",
        "memo": "",
        "releaseMonth": "",
        "imageUrl": "",
        "sourceUrl": source_url,
    }


def existing_key(ball: dict) -> str:
    return f"{ball.get('brand', '').strip().lower()}|{ball.get('name', '').strip().lower()}"


def main() -> None:
    existing: list[dict] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in existing}
    by_key = {existing_key(b): b for b in existing}

    urls = load_sitemap_urls()
    parsed = [p for u in urls if (p := parse_ball_url(u))]
    print(f"ball urls: {len(parsed)}")

    added = 0
    for brand_slug, ball_slug, url in parsed:
        ball_id = make_id(brand_slug, ball_slug)
        brand = brand_display(brand_slug)
        name = name_from_slug(ball_slug)
        key = f"{brand.lower()}|{name.lower()}"

        if ball_id in by_id or key in by_key:
            # 既存に sourceUrl が汎用DBだけの場合は個別URLへ更新
            cur = by_id.get(ball_id) or by_key.get(key)
            if cur and (
                not cur.get("sourceUrl")
                or cur.get("sourceUrl") == "https://www.bowwwl.com/bowling-ball-database"
            ):
                cur["sourceUrl"] = url
            continue

        stub = empty_stub(brand, name, ball_id, url)
        existing.append(stub)
        by_id[ball_id] = stub
        by_key[key] = stub
        added += 1

    existing.sort(
        key=lambda b: (
            (b.get("brand") or "").lower(),
            (b.get("name") or "").lower(),
        )
    )
    CATALOG_PATH.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"total: {len(existing)} (added {added})")


if __name__ == "__main__":
    main()
