#!/usr/bin/env python3
"""bowwwl 詳細ページからスペックを取得して catalogBalls.json を埋める。"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "src" / "data" / "catalogBalls.json"
PROGRESS_PATH = ROOT / "scripts" / ".catalog-enrich-progress.json"

UA = {"User-Agent": "Mozilla/5.0 (compatible; BallManagerCatalog/1.0)"}
WORKERS = 10
SAVE_EVERY = 40
PREFERRED_WEIGHTS = ("15", "16", "14", "13", "12")

COVER_TYPE_JA = {
    "solid reactive": "ソリッド・リアクティブ",
    "pearl reactive": "パール・リアクティブ",
    "hybrid reactive": "ハイブリッド・リアクティブ",
    "particle reactive": "パーティクル・リアクティブ",
    "urethane": "ウレタン",
    "polyurethane": "ウレタン",
    "polyester": "プラスティック",
    "plastic": "プラスティック",
}

CORE_TYPE_JA = {
    "symmetric": "対称コア",
    "asymmetric": "非対称コア",
    "asymmetrical": "非対称コア",
}

MONTHS = {
    "jan": "01",
    "feb": "02",
    "mar": "03",
    "apr": "04",
    "may": "05",
    "jun": "06",
    "jul": "07",
    "aug": "08",
    "sep": "09",
    "oct": "10",
    "nov": "11",
    "dec": "12",
}

write_lock = Lock()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")


def clean_text(s: str) -> str:
    return unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


def field_link_title(html: str, name: str) -> str | None:
    m = re.search(
        rf'field--name-field-{re.escape(name)}\b[\s\S]*?<a[^>]*>(.*?)</a>',
        html,
        re.S | re.I,
    )
    if m:
        return clean_text(m.group(1)) or None
    m = re.search(
        rf'field--name-field-{re.escape(name)}\b[\s\S]*?field__item[^>]*>(.*?)</div>',
        html,
        re.S | re.I,
    )
    if not m:
        return None
    return clean_text(m.group(1)) or None


def field_item(html: str, name: str) -> str | None:
    m = re.search(
        rf'field--name-field-{re.escape(name)}\b[\s\S]*?field__item[^>]*>(.*?)</div>',
        html,
        re.S | re.I,
    )
    if not m:
        return None
    return clean_text(m.group(1)) or None


def parse_weight_specs(html: str) -> dict[str, dict[str, float | None]]:
    out: dict[str, dict[str, float | None]] = {}
    for m in re.finditer(
        r'card-title[^>]*>(\d+)\s*pounds</h6>([\s\S]*?)(?=card-title[^>]*>\d+\s*pounds</h6>|Buy at|</article>|$)',
        html,
        re.I,
    ):
        weight = m.group(1)
        block = m.group(2)
        rg_m = re.search(r'field--name-field-rg\b[\s\S]*?field__item[^>]*>([^<]+)', block, re.I)
        diff_m = re.search(
            r'field--name-field-differential\b[\s\S]*?field__item[^>]*>([^<]+)',
            block,
            re.I,
        )
        mb_m = re.search(
            r'field--name-field-mass-bias-differential\b[\s\S]*?field__item[^>]*>([^<]+)',
            block,
            re.I,
        )
        try:
            rg = float(rg_m.group(1).strip()) if rg_m else None
        except ValueError:
            rg = None
        try:
            diff = float(diff_m.group(1).strip()) if diff_m else None
        except ValueError:
            diff = None
        try:
            mb = float(mb_m.group(1).strip()) if mb_m else None
        except ValueError:
            mb = None
        if rg is not None or diff is not None:
            out[weight] = {"rg": rg, "diff": diff, "mb": mb}
    return out


def pick_specs(html: str) -> tuple[float | None, float | None, float | None]:
    by_w = parse_weight_specs(html)
    for w in PREFERRED_WEIGHTS:
        if w in by_w and by_w[w].get("rg") is not None:
            s = by_w[w]
            mb = s.get("mb")
            if mb is None:
                top_mb = field_item(html, "mass-bias-differential")
                if top_mb:
                    try:
                        mb = float(top_mb)
                    except ValueError:
                        mb = None
            return s.get("rg"), s.get("diff"), mb
    # fallback top-level (often lightest weight — last resort)
    rg = diff = mb = None
    try:
        if field_item(html, "rg"):
            rg = float(field_item(html, "rg"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        pass
    try:
        if field_item(html, "differential"):
            diff = float(field_item(html, "differential"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        pass
    try:
        if field_item(html, "mass-bias-differential"):
            mb = float(field_item(html, "mass-bias-differential"))  # type: ignore[arg-type]
    except (TypeError, ValueError):
        pass
    return rg, diff, mb


def cover_type_ja(en: str | None) -> str:
    if not en:
        return ""
    key = en.strip().lower()
    if key in COVER_TYPE_JA:
        return COVER_TYPE_JA[key]
    if "hybrid" in key:
        return "ハイブリッド・リアクティブ"
    if "pearl" in key:
        return "パール・リアクティブ"
    if "solid" in key:
        return "ソリッド・リアクティブ"
    if "urethane" in key:
        return "ウレタン"
    if "polyester" in key or "plastic" in key:
        return "プラスティック"
    return en.strip()


def core_type_ja(en: str | None) -> str:
    if not en:
        return ""
    return CORE_TYPE_JA.get(en.strip().lower(), en.strip())


def decorate_cover_name(name: str | None, cover_type: str) -> str:
    if not name:
        return ""
    n = re.sub(r"\s+Coverstock\s*$", "", name, flags=re.I).strip()
    if "ハイブリッド" in cover_type and "ハイブリッド" not in n:
        return f"{n} ハイブリッド"
    if "パール" in cover_type and "パール" not in n:
        return f"{n} パール"
    if "ソリッド" in cover_type and "ソリッド" not in n:
        return f"{n} ソリッド"
    return n


def clean_core_name(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"\s+Core\s*$", "", name, flags=re.I).strip()


def release_month(s: str | None) -> str:
    if not s:
        return ""
    m = re.search(r"([A-Za-z]{3})\s+(\d{4})", s)
    if m:
        mon = MONTHS.get(m.group(1)[:3].lower())
        if mon:
            return f"{m.group(2)}-{mon}"
    m = re.search(r"(\d{4})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}"
    return ""


def rg_class(rg: float | None) -> str:
    if rg is None:
        return ""
    if rg <= 2.48:
        return "かなり早い"
    if rg <= 2.51:
        return "早め"
    if rg <= 2.54:
        return "標準"
    if rg <= 2.59:
        return "やや遅め"
    return "遅い"


def diff_class(diff: float | None) -> str:
    if diff is None:
        return ""
    if diff <= 0.029:
        return "低め"
    if diff <= 0.044:
        return "中間"
    if diff <= 0.054:
        return "高め"
    return "かなり高い"


def build_memo(rg_c: str, diff_c: str, core_t: str) -> str:
    parts: list[str] = []
    if rg_c in ("かなり早い", "早め"):
        parts.append("転がり出し早め")
    elif rg_c in ("やや遅め", "遅い"):
        parts.append("転がり出し遅め")
    else:
        parts.append("標準〜中間")
    if diff_c in ("かなり高い", "高め"):
        parts.append("曲がり幅あり" if diff_c == "高め" else "フレア大・曲がり強め")
    elif diff_c == "低め":
        parts.append("曲がり控えめ")
    else:
        parts.append("曲がり普通")
    if "非対称" in core_t:
        parts.append("非対称コア")
    elif "対称" in core_t:
        parts.append("対称コア")
    return " / ".join(parts)


def parse_h1(html: str) -> str | None:
    m = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    if not m:
        return None
    return clean_text(m.group(1)) or None


def enrich_from_html(html: str) -> dict:
    cover_en = field_item(html, "coverstock-type") or field_item(html, "type")
    # nested Type under coverstock often equals coverstock-type
    if not cover_en:
        cover_en = field_item(html, "coverstock-type")
    core_en = field_item(html, "core-type")
    cover_name_raw = field_link_title(html, "coverstock")
    core_name_raw = field_link_title(html, "core")
    finish = field_item(html, "factory-finish") or ""
    rel = release_month(field_item(html, "release-date"))
    rg, diff, mb = pick_specs(html)
    cover_type = cover_type_ja(cover_en)
    core_type = core_type_ja(core_en)
    rg_c = rg_class(rg)
    diff_c = diff_class(diff)
    return {
        "name": parse_h1(html),
        "coverName": decorate_cover_name(cover_name_raw, cover_type),
        "coverType": cover_type,
        "finish": finish,
        "coreName": clean_core_name(core_name_raw),
        "coreType": core_type,
        "rg": rg,
        "diff": diff,
        "mb": mb,
        "rgClass": rg_c,
        "diffClass": diff_c,
        "memo": build_memo(rg_c, diff_c, core_type),
        "releaseMonth": rel,
    }


def needs_enrich(ball: dict) -> bool:
    if not ball.get("sourceUrl") or "bowwwl.com/bowling-ball-database/" not in ball["sourceUrl"]:
        return False
    return ball.get("rg") is None


def fetch_one(ball: dict) -> tuple[str, dict | None, str | None]:
    url = ball["sourceUrl"]
    try:
        html = fetch(url)
        data = enrich_from_html(html)
        if data.get("rg") is None and not data.get("coverType"):
            return ball["id"], None, "no-specs"
        return ball["id"], data, None
    except urllib.error.HTTPError as e:
        return ball["id"], None, f"http-{e.code}"
    except Exception as e:
        return ball["id"], None, type(e).__name__


def apply_enrich(ball: dict, data: dict) -> None:
    if data.get("name"):
        ball["name"] = data["name"]
    for key in (
        "coverName",
        "coverType",
        "finish",
        "coreName",
        "coreType",
        "rg",
        "diff",
        "mb",
        "rgClass",
        "diffClass",
        "memo",
        "releaseMonth",
    ):
        val = data.get(key)
        if val is None or val == "":
            continue
        ball[key] = val


def save_catalog(balls: list[dict]) -> None:
    CATALOG_PATH.write_text(
        json.dumps(balls, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    balls: list[dict] = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    by_id = {b["id"]: b for b in balls}
    targets = [b for b in balls if needs_enrich(b)]
    print(f"targets: {len(targets)} / {len(balls)}")

    done = 0
    ok = 0
    fail = 0
    t0 = time.time()

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = {ex.submit(fetch_one, b): b["id"] for b in targets}
        for fut in as_completed(futs):
            ball_id, data, err = fut.result()
            done += 1
            if data:
                apply_enrich(by_id[ball_id], data)
                ok += 1
            else:
                fail += 1
                if fail <= 20:
                    print(f"fail {ball_id}: {err}")
            if done % SAVE_EVERY == 0 or done == len(targets):
                with write_lock:
                    save_catalog(balls)
                elapsed = time.time() - t0
                rate = done / elapsed if elapsed else 0
                print(
                    f"progress {done}/{len(targets)} ok={ok} fail={fail} "
                    f"{rate:.1f}/s eta={((len(targets)-done)/rate if rate else 0):.0f}s"
                )

    save_catalog(balls)
    with_rg = sum(1 for b in balls if b.get("rg") is not None)
    print(f"done. with_rg={with_rg}/{len(balls)} ok={ok} fail={fail}")


if __name__ == "__main__":
    main()
