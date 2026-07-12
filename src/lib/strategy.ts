import type { Ball, MemberHand, ScoreSession, SessionType } from "./types";
import { avg } from "./types";
import type { CatalogBall, OilPreset } from "./catalogTypes";

export type PerformanceFocus = "all" | "practice" | "tournament";

export type BallPerformance = {
  ballId: string;
  games: number;
  average: number;
  high: number;
  recentAverage: number | null;
  matchedConditionGames: number;
  matchedConditionAverage: number | null;
};

export type AdviceResult = {
  ballId: string;
  name: string;
  brand: string;
  source: "owned" | "catalog";
  score: number;
  reasons: string[];
  lineHint: string;
  adjustHint: string;
  coverType: string;
  playAdvice: {
    startBoard: string;
    targetBoard: string;
    breakpoint: string;
    ifEarly: string;
    ifLate: string;
  };
  performance: BallPerformance | null;
};

function coverStrength(coverType: string): number {
  if (coverType.includes("ソリッド") && coverType.includes("リアクティブ")) return 5;
  if (coverType.includes("ハイブリッド")) return 4;
  if (coverType.includes("パール") && coverType.includes("リアクティブ")) return 3;
  if (coverType.includes("ウレタン")) return 2;
  if (coverType.includes("ポリエステル")) return 1;
  return 3;
}

function inferCoverFromText(...parts: string[]): string {
  const t = parts.join(" ").toLowerCase();
  if (t.includes("solid") || t.includes("ソリッド")) return "ソリッド・リアクティブ";
  if (t.includes("hybrid") || t.includes("ハイブリッド")) return "ハイブリッド・リアクティブ";
  if (t.includes("pearl") || t.includes("パール")) return "パール・リアクティブ";
  if (t.includes("urethane") || t.includes("ウレタン")) return "ソリッド・ウレタン";
  if (t.includes("poly") || t.includes("プラス") || t.includes("スペア")) return "ポリエステル";
  return "";
}

export function findCatalogBall(owned: Ball, catalog: CatalogBall[]): CatalogBall | null {
  return lookupCatalogBall(owned.brand, owned.name, catalog);
}

/** 表示・登録用：日本名があればそれを優先 */
export function catalogPrimaryName(c: Pick<CatalogBall, "name" | "nameJa">): string {
  return (c.nameJa?.trim() || c.name).trim();
}

/** 副表示：日本名があるときの英名など */
export function catalogSecondaryName(c: Pick<CatalogBall, "name" | "nameJa">): string | null {
  const ja = c.nameJa?.trim();
  const en = c.name.trim();
  if (ja && en && ja !== en) return en;
  return null;
}

/** メーカー＋ボール名でカタログを探す（登録フォーム用・日本名優先） */
export function lookupCatalogBall(
  brand: string,
  name: string,
  catalog: CatalogBall[],
): CatalogBall | null {
  const raw = name.trim();
  if (!raw) return null;
  // 「日本名 / 英名」形式で入っている場合は日本名側を優先
  const primary = raw.split("/")[0]?.trim() || raw;
  const n = primary.toLowerCase();
  const nCompact = compactQuery(primary);
  const b = brand.trim().toLowerCase();

  const brandOk = (c: CatalogBall) =>
    !b ||
    c.brand.toLowerCase() === b ||
    n.includes(c.brand.toLowerCase()) ||
    c.brand.toLowerCase().includes(b);

  const nameMatches = (c: CatalogBall) => {
    const en = c.name.toLowerCase();
    const ja = normalizeBallQuery(c.nameJa || "");
    const enC = compactQuery(c.name);
    const jaC = compactQuery(c.nameJa || "");
    return (
      en === n ||
      ja === normalizeBallQuery(primary) ||
      enC === nCompact ||
      jaC === nCompact ||
      en.includes(n) ||
      n.includes(en) ||
      (jaC.length > 0 && (jaC.includes(nCompact) || nCompact.includes(jaC)))
    );
  };

  const exactJa = catalog.find(
    (c) => brandOk(c) && compactQuery(c.nameJa || "") === nCompact && nCompact.length > 0,
  );
  if (exactJa) return exactJa;

  const exactEn = catalog.find((c) => c.name.toLowerCase() === n && brandOk(c));
  if (exactEn) return exactEn;

  const sameBrand = b
    ? catalog.filter((c) => c.brand.toLowerCase() === b || c.brand.toLowerCase().includes(b))
    : catalog;

  const partial = sameBrand.find(nameMatches);
  if (partial) return partial;

  if (b) {
    return catalog.find(nameMatches) ?? null;
  }
  return null;
}

function normalizeSearchText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[!！・./_\-–—'"’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** ひらがな→カタカナ（日本名検索用） */
function toKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

function normalizeBallQuery(s: string): string {
  return normalizeSearchText(toKatakana(s))
    .replace(/[・･]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactQuery(s: string): string {
  return normalizeBallQuery(s).replace(/\s+/g, "");
}

/**
 * 日本名検索の補助（自動カタカナ生成の誤変換や通称向け）。
 * キー・値はスペースなしカタカナ／英小文字で持つ。
 */
const JP_QUERY_ALIASES: Record<string, string[]> = {
  ディープインパクト: ["deep impact", "deepimpact", "デエプインプアクト"],
  アキュスペア: [
    "accu spare",
    "accuspare",
    "nanodesu accu spare",
    "ナノデスアキュスペア",
    "ナノデス・アキュスペア",
  ],
  ナノデスアキュスペア: ["accu spare", "nanodesu accu spare", "アキュスペア"],
};

function expandQueryAliases(query: string): string[] {
  const q = normalizeBallQuery(query);
  const qCompact = compactQuery(query);
  const out = new Set<string>([q, qCompact].filter(Boolean));
  for (const [ja, aliases] of Object.entries(JP_QUERY_ALIASES)) {
    const jaN = normalizeBallQuery(ja);
    const jaC = compactQuery(ja);
    if (q === jaN || qCompact === jaC || qCompact.includes(jaC) || jaC.includes(qCompact)) {
      for (const a of aliases) {
        out.add(normalizeBallQuery(a));
        out.add(compactQuery(a));
      }
    }
    for (const a of aliases) {
      const aN = normalizeBallQuery(a);
      const aC = compactQuery(a);
      if (q === aN || qCompact === aC) {
        out.add(jaN);
        out.add(jaC);
        for (const other of aliases) {
          out.add(normalizeBallQuery(other));
          out.add(compactQuery(other));
        }
      }
    }
  }
  return [...out].filter(Boolean);
}

function brandSearchBlob(brand: string): string {
  const extra =
    brand === "HI-SP"
      ? "ハイスポーツ ハイスポ hi-sp hisp"
      : brand === "ABS 300" || brand.startsWith("ABS")
        ? "ABS アメリカンボウリングサービス ナノデス nanodesu"
        : "";
  return normalizeBallQuery(`${brand} ${extra}`);
}

/** メーカー＋キーワードでカタログを複数件検索（英名・日本名） */
export function searchCatalogBalls(
  brand: string,
  query: string,
  catalog: CatalogBall[],
  limit = 80,
): CatalogBall[] {
  const b = normalizeSearchText(brand);
  const q = normalizeBallQuery(query);
  const qCompact = compactQuery(query);
  const qAliases = expandQueryAliases(query);
  const pool = b
    ? catalog.filter((c) => {
        const cb = normalizeSearchText(c.brand);
        const aliases = brandSearchBlob(c.brand);
        return (
          cb === b ||
          cb.includes(b) ||
          b.includes(cb) ||
          aliases.includes(b) ||
          (b.includes("ハイスポ") && cb === "hi-sp") ||
          (b === "abs" && cb.startsWith("abs"))
        );
      })
    : catalog;

  if (!q) {
    return pool
      .slice()
      .sort((a, c) => catalogPrimaryName(a).localeCompare(catalogPrimaryName(c), "ja"))
      .slice(0, limit);
  }

  const tokens = q.split(" ").filter(Boolean);
  const scored = pool
    .map((c) => {
      const nameEn = normalizeSearchText(c.name);
      const nameJa = normalizeBallQuery(c.nameJa || "");
      const nameEnC = compactQuery(c.name);
      const nameJaC = compactQuery(c.nameJa || "");
      const hay = normalizeBallQuery(
        `${c.name} ${c.nameJa || ""} ${c.coverName} ${c.coreName} ${c.coverType} ${c.coreType} ${c.memo}`,
      );
      const hayC = compactQuery(
        `${c.name} ${c.nameJa || ""} ${c.coverName} ${c.coreName} ${c.memo}`,
      );
      let score = 0;
      const aliasHit = qAliases.some(
        (a) =>
          a &&
          (nameEn === a ||
            nameJa === a ||
            nameEnC === a ||
            nameJaC === a ||
            nameEn.includes(a) ||
            nameJa.includes(a) ||
            nameEnC.includes(a) ||
            nameJaC.includes(a) ||
            hayC.includes(a)),
      );
      if (aliasHit) score += 90;
      // 日本名一致を英名より高く評価
      if (nameJa === q || nameJaC === qCompact) {
        score += 120;
      } else if (nameEn === q || nameEnC === qCompact) {
        score += 95;
      } else if (nameJa.startsWith(q) || nameJaC.startsWith(qCompact)) {
        score += 100;
      } else if (nameEn.startsWith(q) || nameEnC.startsWith(qCompact)) {
        score += 80;
      } else if (nameJa.includes(q) || nameJaC.includes(qCompact)) {
        score += 85;
      } else if (nameEn.includes(q) || nameEnC.includes(qCompact)) {
        score += 65;
      } else if (tokens.every((t) => nameJa.includes(t) || nameJaC.includes(compactQuery(t)))) {
        score += 70;
      } else if (tokens.every((t) => nameEn.includes(t) || hayC.includes(compactQuery(t)))) {
        score += 50;
      }
      if (tokens.length && tokens.every((t) => hay.includes(t) || hayC.includes(compactQuery(t)))) {
        score += 20;
      } else if (tokens.some((t) => hay.includes(t) || hayC.includes(compactQuery(t)))) {
        score += 8;
      }
      if (
        q.length >= 1 &&
        (nameJa.includes(q) ||
          nameJaC.includes(qCompact) ||
          nameEn.includes(q) ||
          nameEnC.includes(qCompact))
      ) {
        score = Math.max(score, nameJa.includes(q) || nameJaC.includes(qCompact) ? 55 : 40);
      }
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort(
      (a, c) =>
        c.score - a.score ||
        catalogPrimaryName(a.c).localeCompare(catalogPrimaryName(c.c), "ja"),
    );

  return scored.slice(0, limit).map((x) => x.c);
}

/** カタログヒットをマイボール詳細欄へ展開する */
export function catalogDetailFields(c: CatalogBall): {
  surfaceNote: string;
  memo: string;
  coverName: string;
  coverType: string;
  coreName: string;
  coreType: string;
  rg: number | null;
  diff: number | null;
  mb: number | null;
  releaseMonth: string;
} {
  return {
    surfaceNote: c.finish || "",
    memo: c.memo || "",
    coverName: c.coverName || "",
    coverType: c.coverType || "",
    coreName: c.coreName || "",
    coreType: c.coreType || "",
    rg: c.rg,
    diff: c.diff,
    mb: c.mb,
    releaseMonth: c.releaseMonth || "",
  };
}

type Candidate = {
  ballId: string;
  name: string;
  brand: string;
  source: "owned" | "catalog";
  rg: number | null;
  diff: number | null;
  coverType: string;
  coreType: string;
  memo: string;
};

function toCandidates(owned: Ball[], catalog: CatalogBall[], ownedOnly: boolean): Candidate[] {
  const fromOwned: Candidate[] = owned.map((b) => {
    const cat = findCatalogBall(b, catalog);
    return {
      ballId: b.id,
      name: b.name,
      brand: b.brand || cat?.brand || "",
      source: "owned" as const,
      rg: b.rg ?? cat?.rg ?? null,
      diff: b.diff ?? cat?.diff ?? null,
      coverType:
        b.coverType ||
        cat?.coverType ||
        inferCoverFromText(b.name, b.surfaceNote, b.memo),
      coreType: b.coreType || cat?.coreType || "",
      memo: b.memo || cat?.memo || "",
    };
  });

  if (ownedOnly) return fromOwned;

  const ownedNames = new Set(fromOwned.map((c) => c.name.toLowerCase()));
  const fromCatalog: Candidate[] = catalog
    .filter((c) => !ownedNames.has(c.name.toLowerCase()))
    .map((c) => ({
      ballId: c.id,
      name: c.name,
      brand: c.brand,
      source: "catalog" as const,
      rg: c.rg,
      diff: c.diff,
      coverType: c.coverType,
      coreType: c.coreType,
      memo: c.memo,
    }));

  return [...fromOwned, ...fromCatalog];
}

function scoreCandidate(c: Candidate, oil: OilPreset): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 50;
  const strength = coverStrength(c.coverType);
  const need = Math.round((oil.length + oil.volume) / 2);

  const coverGap = Math.abs(strength - need);
  score += (2 - coverGap) * 10;
  if (coverGap === 0) reasons.push(`カバー強度がパターン量・長さに合う（${c.coverType || "推定"}）`);
  else if (strength > need) reasons.push("やや強めのカバー。オイルが多い条件で安定しやすい");
  else if (strength < need && strength > 0) reasons.push("やや弱めのカバー。ドライ寄り・短い条件向き");

  if (c.rg != null) {
    if (oil.length >= 4 && c.rg <= 2.5) {
      score += 8;
      reasons.push(`RG ${c.rg} で早めに転がり、ロング条件の中盤〜後半に乗せやすい`);
    } else if (oil.length <= 2 && c.rg >= 2.52) {
      score += 8;
      reasons.push(`RG ${c.rg} で遅めの転がり。ショート条件でオーバーリアクションを抑えやすい`);
    } else {
      score += 3;
      reasons.push(`RG ${c.rg}`);
    }
  }

  if (c.diff != null) {
    if (oil.volume >= 4 && c.diff >= 0.045) {
      score += 7;
      reasons.push(`Diff ${c.diff} で曲がり幅を確保しやすい`);
    } else if (oil.volume <= 2 && c.diff <= 0.04) {
      score += 7;
      reasons.push(`Diff ${c.diff} でコントロールしやすい`);
    }
  }

  if (c.coreType.includes("非対称") && oil.volume >= 4) {
    score += 5;
    reasons.push("非対称コアでヘビー条件の継続力を期待");
  } else if (c.coreType.includes("対称") && oil.volume <= 3) {
    score += 4;
    reasons.push("対称コアで読みやすい動き");
  }

  if (c.source === "owned") {
    score += 12;
  }

  if (!reasons.length) reasons.push("スペック情報は限定的だが候補として検討可");

  return { score: Math.round(score), reasons: reasons.slice(0, 3) };
}

function lineHint(oil: OilPreset, hand: MemberHand = "right"): string {
  const left = hand === "left";
  const label = left ? "左投げ基準" : "右投げ基準";
  if (oil.id === "house" || oil.shape >= 4) {
    return left
      ? `${label}: 立ち位置12〜15枚目、アローで27〜30枚目狙い、ブレイクポイントは30〜33枚目付近（外のドライを使う）。`
      : `${label}: 立ち位置25〜28枚目、アローで10〜13枚目狙い、ブレイクポイントは7〜10枚目付近（外のドライを使う）。`;
  }
  if (oil.length >= 4 || oil.volume >= 4) {
    return left
      ? `${label}: 立ち位置16〜20枚目、アローで22〜25枚目狙い、ブレイクは27〜30枚目付近（ストレート寄りに入れて奥で曲げる）。`
      : `${label}: 立ち位置20〜24枚目、アローで15〜18枚目狙い、ブレイクは10〜13枚目付近（ストレート寄りに入れて奥で曲げる）。`;
  }
  if (oil.length <= 2 || oil.volume <= 2) {
    return left
      ? `${label}: 立ち位置8〜12枚目、アローで29〜32枚目狙い、ブレイクは32〜35枚目付近（手前の反応を抑える）。`
      : `${label}: 立ち位置28〜32枚目、アローで8〜11枚目狙い、ブレイクは5〜8枚目付近（手前の反応を抑える）。`;
  }
  return left
    ? `${label}: 立ち位置13〜17枚目、アローで25〜28枚目狙い、ブレイクは28〜32枚目付近から開始。`
    : `${label}: 立ち位置23〜27枚目、アローで12〜15枚目狙い、ブレイクは8〜12枚目付近から開始。`;
}

function adjustHint(oil: OilPreset, topCover: string, hand: MemberHand = "right"): string {
  const s = coverStrength(topCover);
  const left = hand === "left";
  const earlyDir = left ? "左" : "右";
  const lateDir = left ? "右" : "左";
  const move =
    `反応が早い（手前で曲がりすぎ／ハイヒットしすぎ）→ 立ち位置と狙いを${earlyDir}に1〜2枚ずつ寄せる。` +
    `反応が遅い（ピンまで届かない／薄い）→ ${lateDir}に1〜2枚寄せる、またはスピードを少し落とす。`;
  if (oil.volume >= 4 && s <= 3) {
    return `${move} それでも奥で足りなければ、表面を少し荒らすか強いカバーへボールアップ。`;
  }
  if (oil.volume <= 2 && s >= 4) {
    return `${move} それでも早すぎるなら、ポリッシュや弱い球へボールダウン。`;
  }
  return `${move} 1ゲーム見て、1〜2枚単位で動かす。`;
}

/** ボールごとの具体的な狙い・寄せ方（AI解説用） */
export function buildBallPlayAdvice(
  oil: OilPreset,
  coverType: string,
  rank: number,
  hand: MemberHand = "right",
): { startBoard: string; targetBoard: string; breakpoint: string; ifEarly: string; ifLate: string } {
  const s = coverStrength(coverType);
  const left = hand === "left";
  let start = 25;
  let target = 12;
  let brk = 9;
  if (oil.id === "house" || oil.shape >= 4) {
    start = s >= 4 ? 27 : 25;
    target = s >= 4 ? 10 : 12;
    brk = s >= 4 ? 7 : 9;
  } else if (oil.length >= 4 || oil.volume >= 4) {
    start = s >= 4 ? 22 : 20;
    target = s >= 4 ? 15 : 17;
    brk = s >= 4 ? 10 : 12;
  } else if (oil.length <= 2 || oil.volume <= 2) {
    start = s >= 4 ? 30 : 28;
    target = s >= 4 ? 8 : 10;
    brk = s >= 4 ? 5 : 7;
  } else {
    start = s >= 4 ? 26 : 24;
    target = s >= 4 ? 11 : 14;
    brk = s >= 4 ? 8 : 10;
  }
  if (rank >= 1) {
    start = Math.max(15, start - 2 * rank);
    target = Math.min(20, target + rank);
    brk = Math.min(15, brk + rank);
  }
  if (left) {
    start = 40 - start;
    target = 40 - target;
    brk = 40 - brk;
  }
  const handLabel = left ? "左投げ" : "右投げ";
  const earlyDir = left ? "左" : "右";
  const lateDir = left ? "右" : "左";
  const startLo = Math.min(start, start + 2);
  const startHi = Math.max(start, start + 2);
  const targetLo = Math.min(target, target + 2);
  const targetHi = Math.max(target, target + 2);
  const brkLo = Math.min(brk, brk + 2);
  const brkHi = Math.max(brk, brk + 2);
  return {
    startBoard: `立ち位置 ${startLo}〜${startHi}枚目（${handLabel}）`,
    targetBoard: `アロー狙い ${targetLo}〜${targetHi}枚目`,
    breakpoint: `ブレイク目安 ${brkLo}〜${brkHi}枚目`,
    ifEarly: `手前で曲がりすぎ → 立ち位置と狙いを${earlyDir}へ1〜2枚`,
    ifLate: `届かない／薄い → ${lateDir}へ1〜2枚、またはスピードを少し落とす`,
  };
}

function oilKeywords(oil: OilPreset): string[] {
  switch (oil.id) {
    case "house":
      return ["ハウス", "house", "一般"];
    case "short_dry":
      return ["ショート", "ドライ", "短い", "short", "dry"];
    case "medium":
      return ["ミディアム", "中間", "medium"];
    case "long_heavy":
      return ["ロング", "ヘビー", "長い", "long", "heavy"];
    default:
      return [];
  }
}

function sessionMatchesOil(session: ScoreSession, oil: OilPreset): boolean {
  const text = `${session.oilNote} ${session.memo}`.toLowerCase();
  if (!text.trim()) return false;
  return oilKeywords(oil).some((k) => text.includes(k.toLowerCase()));
}

function filterSessions(
  sessions: ScoreSession[],
  focus: PerformanceFocus,
): ScoreSession[] {
  if (focus === "practice") return sessions.filter((s) => s.sessionType === "practice");
  if (focus === "tournament") return sessions.filter((s) => s.sessionType === "tournament");
  return sessions;
}

export function buildBallPerformance(
  sessions: ScoreSession[],
  focus: PerformanceFocus,
  oil: OilPreset,
): Map<string, BallPerformance> {
  const filtered = filterSessions(sessions, focus);
  const map = new Map<string, { all: number[]; matched: number[]; recent: number[] }>();

  const sorted = [...filtered].sort((a, b) => b.playedOn.localeCompare(a.playedOn));

  for (const s of sorted) {
    const matched = sessionMatchesOil(s, oil);
    for (const g of s.games) {
      if (!g.ballId) continue;
      const row = map.get(g.ballId) ?? { all: [], matched: [], recent: [] };
      row.all.push(g.score);
      if (matched) row.matched.push(g.score);
      if (row.recent.length < 6) row.recent.push(g.score);
      map.set(g.ballId, row);
    }
  }

  const result = new Map<string, BallPerformance>();
  for (const [ballId, row] of map) {
    result.set(ballId, {
      ballId,
      games: row.all.length,
      average: avg(row.all) ?? 0,
      high: Math.max(...row.all),
      recentAverage: avg(row.recent),
      matchedConditionGames: row.matched.length,
      matchedConditionAverage: avg(row.matched),
    });
  }
  return result;
}

function applyPerformanceBonus(
  ballId: string,
  perfMap: Map<string, BallPerformance>,
  focus: PerformanceFocus,
  usePerformance: boolean,
): { bonus: number; reasons: string[]; performance: BallPerformance | null } {
  if (!usePerformance) return { bonus: 0, reasons: [], performance: null };
  const perf = perfMap.get(ballId) ?? null;
  if (!perf || perf.games === 0) {
    return { bonus: 0, reasons: ["まだこのボールのスコア実績が少ない"], performance: perf };
  }

  const reasons: string[] = [];
  let bonus = 0;
  const label =
    focus === "practice" ? "練習" : focus === "tournament" ? "大会" : "全体";

  // 平均点を 150〜220 想定で 0〜30 点に正規化
  const avgScore = perf.matchedConditionAverage ?? perf.average;
  const avgBonus = Math.max(-10, Math.min(30, Math.round((avgScore - 170) * 0.6)));
  bonus += avgBonus;
  if (perf.matchedConditionAverage != null && perf.matchedConditionGames >= 2) {
    reasons.push(
      `同系統条件の${label}平均 ${perf.matchedConditionAverage}（${perf.matchedConditionGames}G）`,
    );
  } else {
    reasons.push(`${label}平均 ${perf.average}（${perf.games}G）`);
  }

  if (perf.recentAverage != null && perf.games >= 3) {
    const trend = perf.recentAverage - perf.average;
    if (trend >= 8) {
      bonus += 8;
      reasons.push(`直近が好調（直近平均 ${perf.recentAverage}）`);
    } else if (trend <= -8) {
      bonus -= 8;
      reasons.push(`直近はやや下降（直近平均 ${perf.recentAverage}）`);
    }
  }

  if (perf.games >= 5) bonus += 4;

  return { bonus, reasons: reasons.slice(0, 2), performance: perf };
}

export function adviseBalls(options: {
  owned: Ball[];
  catalog: CatalogBall[];
  oil: OilPreset;
  ownedOnly: boolean;
  note?: string;
  sessions?: ScoreSession[];
  performanceFocus?: PerformanceFocus;
  usePerformance?: boolean;
  hand?: MemberHand;
}): AdviceResult[] {
  const candidates = toCandidates(options.owned, options.catalog, options.ownedOnly);
  const note = (options.note || "").toLowerCase();
  const focus = options.performanceFocus ?? "all";
  const usePerformance = options.usePerformance ?? true;
  const hand = options.hand && options.hand !== "unspecified" ? options.hand : "right";
  const perfMap = buildBallPerformance(options.sessions ?? [], focus, options.oil);

  const ranked = candidates
    .map((c) => {
      const { score, reasons } = scoreCandidate(c, options.oil);
      const perf = applyPerformanceBonus(c.ballId, perfMap, focus, usePerformance);
      let finalScore = score + perf.bonus;
      const allReasons = [...perf.reasons, ...reasons];

      if (note.includes("スペア") && coverStrength(c.coverType) === 1) {
        finalScore += 15;
        allReasons.unshift("スペア用途のメモに合わせて弱いカバーを優先");
      }
      if (note.includes("フック") && (c.diff ?? 0) >= 0.05) {
        finalScore += 5;
        allReasons.push("フックを求めるメモに合わせてDiff高めを加点");
      }

      return {
        ballId: c.ballId,
        name: c.name,
        brand: c.brand,
        source: c.source,
        score: Math.round(finalScore),
        reasons: allReasons.slice(0, 5),
        lineHint: lineHint(options.oil, hand),
        adjustHint: adjustHint(options.oil, c.coverType, hand),
        coverType: c.coverType || "不明",
        playAdvice: buildBallPlayAdvice(options.oil, c.coverType, 0, hand),
        performance: perf.performance,
      } satisfies AdviceResult;
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 8).map((r, i) => ({
    ...r,
    playAdvice: buildBallPlayAdvice(options.oil, r.coverType, i, hand),
    lineHint: lineHint(options.oil, hand),
    adjustHint: adjustHint(options.oil, r.coverType, hand),
  }));
}

export function focusLabel(focus: PerformanceFocus): string {
  if (focus === "practice") return "練習";
  if (focus === "tournament") return "大会";
  return "全体";
}

export type { SessionType };
