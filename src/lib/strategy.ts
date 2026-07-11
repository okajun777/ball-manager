import type { Ball, ScoreSession, SessionType } from "./types";
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

function matchCatalog(owned: Ball, catalog: CatalogBall[]): CatalogBall | null {
  const name = owned.name.toLowerCase();
  const brand = owned.brand.toLowerCase();
  const exact = catalog.find(
    (c) =>
      c.name.toLowerCase() === name &&
      (!brand || c.brand.toLowerCase() === brand || name.includes(c.brand.toLowerCase())),
  );
  if (exact) return exact;
  return (
    catalog.find(
      (c) =>
        name.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(name.replace(/\s+/g, " ").trim()),
    ) ?? null
  );
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
    const cat = matchCatalog(b, catalog);
    return {
      ballId: b.id,
      name: b.name,
      brand: b.brand || cat?.brand || "",
      source: "owned" as const,
      rg: cat?.rg ?? null,
      diff: cat?.diff ?? null,
      coverType: cat?.coverType || inferCoverFromText(b.name, b.surfaceNote, b.memo),
      coreType: cat?.coreType || "",
      memo: cat?.memo || b.memo || "",
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

function lineHint(oil: OilPreset): string {
  if (oil.id === "house" || oil.shape >= 4) {
    return "やや内めの立ち位置から、外のドライを使うライン。ターゲットは2〜3枚外を目安に調整。";
  }
  if (oil.length >= 4) {
    return "ストレート寄りに入れて、ブレークポイントを深めに設定。スピードを落としすぎない。";
  }
  if (oil.length <= 2) {
    return "開きすぎず、手前の反応を抑えるライン。ボールダウンや表面を滑らかにする選択も有効。";
  }
  return "センター寄りの基準ラインから、反応点を見て左右に微調整。";
}

function adjustHint(oil: OilPreset, topCover: string): string {
  const s = coverStrength(topCover);
  if (oil.volume >= 4 && s <= 3) return "合わなければ表面を少し荒らす／より強いカバーへボールアップ。";
  if (oil.volume <= 2 && s >= 4) return "早すぎる場合はポリッシュや弱い球へボールダウン。";
  return "1ゲーム見て、反応が早い／遅いで立ち位置を1〜2枚ずつ動かす。";
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
}): AdviceResult[] {
  const candidates = toCandidates(options.owned, options.catalog, options.ownedOnly);
  const note = (options.note || "").toLowerCase();
  const focus = options.performanceFocus ?? "all";
  const usePerformance = options.usePerformance ?? true;
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
        lineHint: lineHint(options.oil),
        adjustHint: adjustHint(options.oil, c.coverType),
        performance: perf.performance,
      } satisfies AdviceResult;
    })
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, 8);
}

export function focusLabel(focus: PerformanceFocus): string {
  if (focus === "practice") return "練習";
  if (focus === "tournament") return "大会";
  return "全体";
}

export type { SessionType };
