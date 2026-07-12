#!/usr/bin/env python3
"""カタログ球に日本名 (nameJa) を付与する。

⚠️ 注意: このスクリプトの「英名→カタカナ自動生成」は誤訳が多い
（例: Purple Pearl → プルプルエ ペアルル）。
再実行しないこと。日本名の修正は scripts/sanitize-catalog-name-ja.py を使う。

1) 英名からカタカナ読みを生成
2) ハイスポーツ商品ページがあれば公式日本名で上書き
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "src" / "data" / "catalogBalls.json"

if __name__ == "__main__" and "--force" not in sys.argv:
    print(
        "ERROR: enrich-catalog-name-ja.py は自動カタカナ生成で誤訳を量産します。\n"
        "日本名の修正は scripts/sanitize-catalog-name-ja.py を使ってください。\n"
        "どうしても再実行する場合のみ: python scripts/enrich-catalog-name-ja.py --force",
        file=sys.stderr,
    )
    raise SystemExit(1)

UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.0)"}
WORKERS = 10

# 特殊表記（生成より優先）
SPECIAL: dict[str, str] = {
    "physix": "フィジックス",
    "phaze": "フェイズ",
    "phaze ii": "フェイズ II",
    "phaze iii": "フェイズ III",
    "phaze 4": "フェイズ 4",
    "!q": "アイキュー",
    "iq": "アイキュー",
    "iq tour": "アイキューツアー",
    "hy-road": "ハイロード",
    "hy road": "ハイロード",
    "black widow": "ブラックウィドー",
    "motiv": "モーティブ",
    "swag": "スワッグ",
    "dv8": "ディーブイエイト",
    "900 global": "ナインハンドレッドグローバル",
    "roto grip": "ロトグリップ",
    "deep impact": "ディープインパクト",
    "deep freeze": "ディープフリーズ",
    "nanodesu accu spare": "ナノデス・アキュスペア",
    "accu spare": "アキュスペア",
    "nanodesu accu drive 5": "ナノデス・アキュドライブ 5",
}

# 長い順にマッチする音節
SYLLABLES: list[tuple[str, str]] = sorted(
    [
        ("physix", "フィジックス"),
        ("phaze", "フェイズ"),
        ("tion", "ション"),
        ("sion", "ジョン"),
        ("ture", "チャー"),
        ("sure", "シャー"),
        ("ture", "チャー"),
        ("ough", "オー"),
        ("augh", "オー"),
        ("eigh", "エイ"),
        ("ight", "アイト"),
        ("ault", "オルト"),
        ("ance", "アンス"),
        ("ence", "エンス"),
        ("que", "ク"),
        ("qua", "クァ"),
        ("qui", "クイ"),
        ("quo", "クォ"),
        ("sch", "シュ"),
        ("thr", "スル"),
        ("str", "ストル"),
        ("spr", "スプル"),
        ("spl", "スプル"),
        ("scr", "スクル"),
        ("chr", "クル"),
        ("phe", "フェ"),
        ("phi", "フィ"),
        ("pho", "フォ"),
        ("pha", "ファ"),
        ("phy", "フィ"),
        ("che", "チェ"),
        ("chi", "チ"),
        ("cha", "チャ"),
        ("cho", "チョ"),
        ("chu", "チュ"),
        ("she", "シェ"),
        ("shi", "シ"),
        ("sha", "シャ"),
        ("sho", "ショ"),
        ("shu", "シュ"),
        ("the", "ザ"),
        ("thi", "ティ"),
        ("tha", "サ"),
        ("tho", "ソ"),
        ("thu", "サ"),
        ("wha", "ワ"),
        ("whe", "ウェ"),
        ("whi", "ウィ"),
        ("who", "フー"),
        ("why", "ワイ"),
        ("ght", "ト"),
        ("dge", "ッジ"),
        ("tch", "ッチ"),
        ("ck", "ック"),
        ("ng", "ング"),
        ("nk", "ンク"),
        ("mb", "ム"),
        ("mp", "ンプ"),
        ("nt", "ント"),
        ("nd", "ンド"),
        ("ld", "ルド"),
        ("lt", "ルト"),
        ("rt", "ルト"),
        ("rd", "ルド"),
        ("rk", "ルク"),
        ("rl", "ルル"),
        ("rm", "ルム"),
        ("rn", "ルン"),
        ("st", "スト"),
        ("sp", "スプ"),
        ("sk", "スク"),
        ("sm", "スム"),
        ("sn", "スン"),
        ("sw", "スワ"),
        ("tr", "トル"),
        ("dr", "ドル"),
        ("pr", "プル"),
        ("br", "ブル"),
        ("cr", "クル"),
        ("gr", "グル"),
        ("fr", "フル"),
        ("pl", "プル"),
        ("bl", "ブル"),
        ("cl", "クル"),
        ("gl", "グル"),
        ("fl", "フル"),
        ("tw", "トゥ"),
        ("dw", "ドゥ"),
        ("qu", "ク"),
        ("x", "ックス"),
        ("q", "ク"),
        ("ci", "シ"),
        ("ce", "ス"),
        ("cy", "シー"),
        ("ge", "ジ"),
        ("gi", "ジ"),
        ("gy", "ジー"),
        ("ja", "ジャ"),
        ("ju", "ジュ"),
        ("jo", "ジョ"),
        ("je", "ジェ"),
        ("ji", "ジ"),
        ("va", "ヴァ"),
        ("vi", "ヴィ"),
        ("vu", "ヴ"),
        ("ve", "ヴェ"),
        ("vo", "ヴォ"),
        ("wa", "ワ"),
        ("wi", "ウィ"),
        ("wu", "ウ"),
        ("we", "ウェ"),
        ("wo", "ウォ"),
        ("ya", "ヤ"),
        ("yu", "ユ"),
        ("yo", "ヨ"),
        ("ye", "イェ"),
        ("yi", "イ"),
        ("za", "ザ"),
        ("zi", "ジ"),
        ("zu", "ズ"),
        ("ze", "ゼ"),
        ("zo", "ゾ"),
        ("ba", "バ"),
        ("bi", "ビ"),
        ("bu", "ブ"),
        ("be", "ベ"),
        ("bo", "ボ"),
        ("pa", "パ"),
        ("pi", "ピ"),
        ("pu", "プ"),
        ("pe", "ペ"),
        ("po", "ポ"),
        ("da", "ダ"),
        ("di", "ディ"),
        ("du", "ドゥ"),
        ("de", "デ"),
        ("do", "ド"),
        ("ta", "タ"),
        ("ti", "ティ"),
        ("tu", "トゥ"),
        ("te", "テ"),
        ("to", "ト"),
        ("ka", "カ"),
        ("ki", "キ"),
        ("ku", "ク"),
        ("ke", "ケ"),
        ("ko", "コ"),
        ("ga", "ガ"),
        ("gi", "ギ"),
        ("gu", "グ"),
        ("ge", "ゲ"),
        ("go", "ゴ"),
        ("sa", "サ"),
        ("si", "シ"),
        ("su", "ス"),
        ("se", "セ"),
        ("so", "ソ"),
        ("za", "ザ"),
        ("ha", "ハ"),
        ("hi", "ヒ"),
        ("hu", "フ"),
        ("he", "ヘ"),
        ("ho", "ホ"),
        ("fa", "ファ"),
        ("fi", "フィ"),
        ("fu", "フ"),
        ("fe", "フェ"),
        ("fo", "フォ"),
        ("ma", "マ"),
        ("mi", "ミ"),
        ("mu", "ム"),
        ("me", "メ"),
        ("mo", "モ"),
        ("na", "ナ"),
        ("ni", "ニ"),
        ("nu", "ヌ"),
        ("ne", "ネ"),
        ("no", "ノ"),
        ("ra", "ラ"),
        ("ri", "リ"),
        ("ru", "ル"),
        ("re", "レ"),
        ("ro", "ロ"),
        ("la", "ラ"),
        ("li", "リ"),
        ("lu", "ル"),
        ("le", "レ"),
        ("lo", "ロ"),
        ("a", "ア"),
        ("i", "イ"),
        ("u", "ウ"),
        ("e", "エ"),
        ("o", "オ"),
        ("b", "ブ"),
        ("c", "ク"),
        ("d", "ド"),
        ("f", "フ"),
        ("g", "グ"),
        ("h", "フ"),
        ("j", "ジ"),
        ("k", "ク"),
        ("l", "ル"),
        ("m", "ム"),
        ("n", "ン"),
        ("p", "プ"),
        ("r", "ル"),
        ("s", "ス"),
        ("t", "ト"),
        ("v", "ブ"),
        ("w", "ウ"),
        ("y", "イ"),
        ("z", "ズ"),
    ],
    key=lambda x: -len(x[0]),
)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def clean_text(s: str) -> str:
    return unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def is_mostly_kana(s: str) -> bool:
    if not s:
        return False
    kana = sum(1 for c in s if "\u30a0" <= c <= "\u30ff" or "\u3040" <= c <= "\u309f" or c == "ー")
    letters = sum(1 for c in s if c.isalpha() or ("\u30a0" <= c <= "\u30ff") or ("\u3040" <= c <= "\u309f") or c == "ー")
    return letters > 0 and kana / letters >= 0.6


def normalize_key(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("!", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slugify(s: str) -> str:
    return normalize_key(s).replace(" ", "-")


def english_to_katakana(name: str) -> str:
    key = normalize_key(name)
    if not key:
        return ""
    if key in SPECIAL:
        return SPECIAL[key]
    # 部分特殊（先頭一致）
    for en, ja in sorted(SPECIAL.items(), key=lambda x: -len(x[0])):
        if key == en or key.startswith(en + " "):
            rest = key[len(en) :].strip()
            return (ja + (" " + english_to_katakana(rest) if rest else "")).strip()

    parts = key.split()
    out: list[str] = []
    for part in parts:
        if re.fullmatch(r"\d+", part):
            out.append(part)
            continue
        if part in {"ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xv"}:
            out.append(part.upper())
            continue
        if part == "x":
            out.append("X")
            continue
        i = 0
        buf = ""
        while i < len(part):
            matched = False
            for eng, kana in SYLLABLES:
                if part.startswith(eng, i):
                    buf += kana
                    i += len(eng)
                    matched = True
                    break
            if not matched:
                i += 1
        if buf:
            out.append(buf)
    return " ".join(out)


def load_hisp_product_urls() -> list[str]:
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


def extract_hisp_names(html: str, slug: str) -> tuple[str, str]:
    """returns (english_hint, japanese_name)"""
    h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    h1 = clean_text(h1_m.group(1)) if h1_m else ""
    title_m = re.search(r"<title>([^<]+)</title>", html)
    title = clean_text(title_m.group(1)).split("-")[0].strip() if title_m else ""

    ja = ""
    if is_mostly_kana(h1):
        ja = h1
    elif is_mostly_kana(title):
        ja = title

    if not ja:
        # IDENTITY アイデンティティー
        m = re.search(
            rf"\b{re.escape(slug.replace('-', '[\\s\\-]*'))}\b[™]?\s*([ぁ-んァ-ヶー]{{2,40}})",
            html,
            re.I,
        )
        if m:
            ja = m.group(1)
    if not ja:
        # 「フィジックス」
        desc = re.search(r'og:description" content="([^"]+)"', html)
        text = unescape(desc.group(1)) if desc else ""
        quotes = re.findall(r"「([ァ-ヶー]{2,40})」", text)
        if quotes:
            ja = quotes[0]
        else:
            quotes = re.findall(r"「([ァ-ヶー]{2,40})」", html)
            if quotes:
                # avoid generic
                for q in quotes:
                    if q not in {"ボール", "シリーズ", "コア", "カバー"}:
                        ja = q
                        break

    en = h1 if h1 and not is_mostly_kana(h1) else (title if title and not is_mostly_kana(title) else slug.replace("-", " "))
    return en.strip(), ja.strip()


def fetch_hisp(url: str) -> tuple[str, str, str] | None:
    slug = url.rstrip("/").split("/")[-1]
    try:
        html = fetch(url)
    except urllib.error.HTTPError:
        return None
    except Exception:
        return None
    en, ja = extract_hisp_names(html, slug)
    return slug, en, ja


def main() -> None:
    balls: list[dict] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))

    # 1) 生成カタカナ
    for b in balls:
        generated = english_to_katakana(b.get("name") or "")
        if generated:
            b["nameJa"] = generated

    # 2) ハイスポーツ上書き
    urls = load_hisp_product_urls()
    print(f"hi-sp products: {len(urls)}")
    by_slug: dict[str, str] = {}
    by_en: dict[str, str] = {}
    done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_hisp, u): u for u in urls}
        for fut in as_completed(futs):
            done += 1
            row = fut.result()
            if row:
                slug, en, ja = row
                if ja:
                    by_slug[slug.lower()] = ja
                    by_en[normalize_key(en)] = ja
                    by_en[normalize_key(slug.replace("-", " "))] = ja
            if done % 100 == 0 or done == len(urls):
                print(f"hi-sp {done}/{len(urls)} mapped={len(by_slug)}")

    overwritten = 0
    for b in balls:
        slug = ""
        src = b.get("sourceUrl") or ""
        m = re.search(r"/([^/]+)/?$", src)
        if m and "bowling-ball-database" in src:
            slug = m.group(1).lower()
        ja = by_slug.get(slug) or by_en.get(normalize_key(b.get("name") or ""))
        if ja:
            b["nameJa"] = ja
            overwritten += 1

    CATALOG_PATH.write_text(
        json.dumps(balls, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    with_ja = sum(1 for b in balls if b.get("nameJa"))
    print(f"done with_ja={with_ja}/{len(balls)} hisp_overwrite={overwritten}")
    # samples
    for bid in ("storm-physix", "storm-phaze-ii", "storm-identity", "storm-monsoon", "hammer-black-widow-20"):
        hit = next((b for b in balls if b["id"] == bid), None)
        if hit:
            print(f"  {hit['name']} => {hit.get('nameJa')}")


if __name__ == "__main__":
    main()
