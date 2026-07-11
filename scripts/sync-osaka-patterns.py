# -*- coding: utf-8 -*-
"""Merge OBF tournament pattern PDFs into ball-manager osakaSchedule.json"""
from __future__ import annotations

import json
import re
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "src" / "data" / "osakaSchedule.json"
BASE = "https://www.obf-bowling.net"
PAGES = [
    f"{BASE}/Tournament/2025/index.shtml",
    f"{BASE}/Tournament/2026/index.shtml",
]


def abs_url(href: str) -> str:
    if not href:
        return ""
    if href.startswith("http"):
        return href.split("#")[0].split("?")[0]
    return BASE + ("/" + href.lstrip("/")).split("#")[0].split("?")[0]


def parse_date(text: str) -> str | None:
    m = re.search(
        r"(\d{4})年(\d{1,2})月(\d{1,2})日",
        text.replace(" ", "").replace("\u3000", ""),
    )
    if not m:
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_td = False
        self.in_a = False
        self.td_text: list[str] = []
        self.td_hrefs: list[str] = []
        self.row: list[tuple[str, list[str]]] = []
        self.rows: list[list[tuple[str, list[str]]]] = []
        self.in_tr = False
        self.in_table = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "table":
            self.in_table = True
        elif tag == "tr" and self.in_table:
            self.in_tr = True
            self.row = []
        elif tag == "td" and self.in_tr:
            self.in_td = True
            self.td_text = []
            self.td_hrefs = []
        elif tag == "a" and self.in_td:
            self.in_a = True
            href = attrs.get("href", "")
            if re.search(r"\.pdf", href, re.I):
                self.td_hrefs.append(abs_url(href))

    def handle_endtag(self, tag):
        if tag == "td" and self.in_td:
            self.row.append(("".join(self.td_text), list(self.td_hrefs)))
            self.in_td = False
        elif tag == "tr" and self.in_tr:
            if len(self.row) >= 3:
                self.rows.append(self.row)
            self.in_tr = False
            self.row = []
        elif tag == "table":
            self.in_table = False
        elif tag == "a":
            self.in_a = False

    def handle_data(self, data):
        if self.in_td:
            self.td_text.append(data)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "ball-manager-sync/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def find_pdf(row: list[tuple[str, list[str]]], *needles: str) -> str:
    for _text, hrefs in row:
        for href in hrefs:
            low = href.lower()
            if any(n in low for n in needles):
                return href
    return ""


def scrape(url: str) -> list[dict]:
    html = fetch(url)
    p = TableParser()
    p.feed(html)
    out = []
    for row in p.rows:
        name = re.sub(r"\s+", " ", row[0][0]).strip()
        date_s = parse_date(re.sub(r"\s+", " ", row[1][0]))
        venue = re.sub(r"\s+", " ", row[2][0]).strip() if len(row) > 2 else ""
        if not name or not date_s:
            continue
        out.append(
            {
                "name": name,
                "startDate": date_s,
                "endDate": date_s,
                "venue": venue,
                "detailPdfUrl": find_pdf(row, "detail", "youkou", "要項"),
                "patternPdfUrl": find_pdf(row, "pattern"),
                "resultPdfUrl": find_pdf(row, "result", "kekka"),
                "hostType": "osaka",
                "source": url,
            }
        )
    return out


def eid(date_s: str, name: str) -> str:
    h = abs(hash(name)) % 10_000_000
    return f"osaka-{date_s}-{h:07d}"


def is_real_pattern(url: str) -> bool:
    return bool(url) and "pattern" in url.lower()


def main():
    scraped = []
    for url in PAGES:
        try:
            scraped.extend(scrape(url))
            print("ok", url)
        except Exception as e:
            print("fail", url, e)

    with_pat = [e for e in scraped if is_real_pattern(e.get("patternPdfUrl", ""))]
    print("scraped", len(scraped), "with pattern", len(with_pat))

    existing: dict = {"source": "", "updatedAt": "", "events": []}
    if OUT.exists():
        existing = json.loads(OUT.read_text(encoding="utf-8"))

    by_key: dict[tuple[str, str], dict] = {}
    for e in existing.get("events", []):
        # Drop mis-tagged elimination PDFs from earlier sync
        url = e.get("patternPdfUrl") or ""
        if url and not is_real_pattern(url):
            e = {**e, "patternPdfUrl": ""}
        by_key[(e.get("startDate", ""), e.get("name", ""))] = e

    for s in scraped:
        key = (s["startDate"], s["name"])
        cur = by_key.get(key)
        pat = s.get("patternPdfUrl", "") if is_real_pattern(s.get("patternPdfUrl", "")) else ""
        if cur:
            if pat:
                cur["patternPdfUrl"] = pat
            elif cur.get("patternPdfUrl") and not is_real_pattern(cur["patternPdfUrl"]):
                cur["patternPdfUrl"] = ""
            if s.get("detailPdfUrl"):
                cur["detailPdfUrl"] = s["detailPdfUrl"]
            if s.get("venue") and not cur.get("venue"):
                cur["venue"] = s["venue"]
        else:
            by_key[key] = {
                "id": eid(s["startDate"], s["name"]),
                "startDate": s["startDate"],
                "endDate": s["endDate"],
                "name": s["name"],
                "venue": s["venue"],
                "hostType": s.get("hostType", "osaka"),
                "categoryIds": [],
                "mainTournaments": "",
                "patternPdfUrl": pat,
                "detailPdfUrl": s.get("detailPdfUrl", ""),
            }

    events = sorted(by_key.values(), key=lambda e: e["startDate"], reverse=True)
    payload = {
        "source": "osaka-bowling / obf-bowling.net Tournament index",
        "updatedAt": date.today().isoformat(),
        "events": events,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("wrote", OUT)
    n_pat = sum(1 for e in events if is_real_pattern(e.get("patternPdfUrl", "")))
    print("events", len(events), "patterns", n_pat)
    for e in events:
        if is_real_pattern(e.get("patternPdfUrl", "")):
            print("-", e["startDate"], e["name"], e["patternPdfUrl"])


if __name__ == "__main__":
    main()
