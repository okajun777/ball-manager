#!/usr/bin/env python3
"""自動生成の誤った nameJa を捨て、信頼できる日本名だけ残す／補完する。"""
from __future__ import annotations

import json
import re
from pathlib import Path

# enrich-catalog-name-ja の生成ロジックをここに最小限コピーして照合する
ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "src" / "data" / "catalogBalls.json"

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
    "deep impact": "ディープインパクト",
    "deep freeze": "ディープフリーズ",
    "nanodesu accu spare": "ナノデス・アキュスペア",
    "accu spare": "アキュスペア",
    "nanodesu accu drive 5": "ナノデス・アキュドライブ 5",
    "after dark": "アフターダーク",
    "after dark pearl": "アフターダーク・パール",
    "fever pitch": "フィーバーピッチ",
    "vintage gem": "ビンテージ・ジェム",
    "purple pearl urethane": "パープル・パール・ウレタン",
    "purple pearl urethane 78d": "パープル・パール・ウレタン 78D",
    "purple pearl urethane kr limited": "パープル・パール・ウレタン KR Limited",
    "black widow purple pearl urethane": "ブラックウィドー・パープル・パール・ウレタン",
    "effect purple pearl urethane": "エフェクト・パープル・パール・ウレタン",
    "sweep hard": "スイープ・ハード",
    "zenith": "ゼニス",
    "zenith hybrid": "ゼニス・ハイブリッド",
    "zenith pearl": "ゼニス・パール",
    "quantum bias": "カンタム・バイアス",
    "quantum bias pearl": "カンタム・バイアス・パール",
    "quantum bias urethane": "カンタム・バイアス・ウレタン",
}

# 単語単位の定訳（英名を組み立てる用）
WORD_JA: dict[str, str] = {
    "purple": "パープル",
    "pearl": "パール",
    "urethane": "ウレタン",
    "solid": "ソリッド",
    "hybrid": "ハイブリッド",
    "black": "ブラック",
    "white": "ホワイト",
    "blue": "ブルー",
    "red": "レッド",
    "green": "グリーン",
    "gold": "ゴールド",
    "silver": "シルバー",
    "orange": "オレンジ",
    "pink": "ピンク",
    "yellow": "イエロー",
    "dark": "ダーク",
    "after": "アフター",
    "fever": "フィーバー",
    "pitch": "ピッチ",
    "vintage": "ビンテージ",
    "gem": "ジェム",
    "spare": "スペア",
    "tour": "ツアー",
    "pro": "プロ",
    "limited": "リミテッド",
    "fresh": "フレッシュ",
    "hard": "ハード",
    "sweep": "スイープ",
    "widow": "ウィドー",
    "hammer": "ハンマー",
    "storm": "ストーム",
    "motiv": "モーティブ",
    "radical": "ラジカル",
    "nano": "ナノ",
    "desu": "デス",
    "nanodesu": "ナノデス",
    "accu": "アキュ",
    "drive": "ドライブ",
    "impact": "インパクト",
    "deep": "ディープ",
    "freeze": "フリーズ",
    "code": "コード",
    "iconic": "アイコニック",
}


def normalize_key(s: str) -> str:
    s = s.lower().strip().replace("!", "")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def looks_like_official_ja(ja: str) -> bool:
    """ハイスポーツ等の公式っぽい日本名。"""
    if not ja:
        return False
    if "・" in ja or "ｰ" in ja or "ー" in ja:
        # 中黒や長音があるだけでは足りないが、公式は多い
        pass
    # 漢字が含まれる
    if re.search(r"[\u4e00-\u9fff]", ja):
        return True
    # 括弧付きカラー名など
    if re.search(r"[（(].+[）)]", ja):
        return True
    # よくある正しい表記
    if any(
        x in ja
        for x in (
            "フィジックス",
            "フェイズ",
            "アイキュー",
            "ハイロード",
            "スイープ",
            "ナノデス",
            "アキュ",
            "ディープインパクト",
            "パープル",
            "パール",
            "ウレタン",
            "アフターダーク",
            "フィーバー",
            "ビンテージ",
            "ブラックウィドー",
        )
    ):
        return True
    return False


def looks_like_garbage_ja(ja: str) -> bool:
    if not ja:
        return False
    bad = (
        "プルプルエ",
        "ペアルル",
        "ウレサネ",
        "アフテル",
        "フェヴェル",
        "デエプ",
        "インプアクト",
        "アククウ",
        "ドルイヴェ",
        "フルエエゼ",
        "グルアヴィトイ",
        "ラトトレル",
        "ドウブルエ",
        "スプイリト",
        "イントエル",
        "プルプルエ",
    )
    if any(b in ja for b in bad):
        return True
    # スペース区切りカタカナが多く、中黒なし → 自動生成っぽい
    parts = [p for p in re.split(r"\s+", ja) if p]
    if len(parts) >= 3 and "・" not in ja and all(re.fullmatch(r"[ァ-ヶー]+", p) for p in parts):
        return True
    return False


def word_translate(name: str) -> str | None:
    key = normalize_key(name)
    if key in SPECIAL:
        return SPECIAL[key]
    for en, ja in sorted(SPECIAL.items(), key=lambda x: -len(x[0])):
        if key == en or key.startswith(en + " "):
            rest = key[len(en) :].strip()
            if not rest:
                return ja
            rest_ja = word_translate(rest)
            return f"{ja} {rest_ja}" if rest_ja else ja

    parts = key.split()
    out: list[str] = []
    for p in parts:
        if re.fullmatch(r"\d+[a-z]*", p) or p in {"ii", "iii", "iv", "78d", "kr"}:
            out.append(p.upper() if p.isalpha() else p.upper())
            continue
        if p in WORD_JA:
            out.append(WORD_JA[p])
        else:
            return None  # 未知語があれば無理に作らない
    return "・".join(out) if out else None


def main() -> None:
    balls: list[dict] = json.loads(CATALOG.read_text(encoding="utf-8"))
    cleared = 0
    fixed = 0
    kept = 0
    for b in balls:
        en = b.get("name") or ""
        ja = (b.get("nameJa") or "").strip()
        brand = b.get("brand") or ""

        # HI-SP は公式日本名を優先保持（ゴミ判定でも ・ 付きは残す）
        if brand == "HI-SP" and ja and ("・" in ja or "（" in ja or "(" in ja):
            kept += 1
            continue

        translated = word_translate(en)
        if translated:
            if ja != translated:
                b["nameJa"] = translated
                fixed += 1
            else:
                kept += 1
            continue

        if looks_like_garbage_ja(ja) or (ja and not looks_like_official_ja(ja) and " " in ja and "・" not in ja):
            b["nameJa"] = ""
            cleared += 1
            continue

        if looks_like_official_ja(ja):
            kept += 1
            continue

        # それ以外のスペース区切りカタカナは捨てて英名表示に戻す
        if ja and " " in ja and "・" not in ja and re.fullmatch(r"[ァ-ヶー0-9A-Za-z ]+", ja):
            b["nameJa"] = ""
            cleared += 1
        else:
            kept += 1

    CATALOG.write_text(json.dumps(balls, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"fixed={fixed} cleared={cleared} kept={kept} total={len(balls)}")
    for name in (
        "Purple Pearl Urethane",
        "After Dark Pearl",
        "Fever Pitch",
        "Vintage Gem",
        "Deep Impact",
    ):
        hit = next((b for b in balls if b.get("name") == name), None)
        if hit:
            print(f"  {hit['brand']} {hit['name']} => [{hit.get('nameJa') or '(empty→EN)'}]")


if __name__ == "__main__":
    main()
