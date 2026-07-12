import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import catalogBalls from "../data/catalogBalls.json";
import type { CatalogBall } from "../lib/catalogTypes";
import { findCatalogBall, catalogPrimaryName, resolveBallImageUrl } from "../lib/strategy";
import {
  generateCompareConsultation,
  isLlmConfigured,
  type CompareCandidate,
} from "../lib/llm";
import { useStore } from "../lib/store";
import type { Ball } from "../lib/types";
import { publicUrl } from "../lib/paths";

const catalog = catalogBalls as CatalogBall[];

type SourceMode = "owned" | "catalog" | "both";

type ChartPoint = {
  id: string;
  key: string;
  name: string;
  nameEn: string;
  brand: string;
  rg: number;
  diff: number;
  mb: number | null;
  coverType: string;
  coreType: string;
  coverName: string;
  coreName: string;
  finish: string;
  releaseMonth: string;
  imageUrl: string;
  source: "owned" | "catalog";
  owned: boolean;
};

const BRAND_COLORS = [
  "#0b6bcb",
  "#0f7b4d",
  "#b54708",
  "#7a3e9d",
  "#c11574",
  "#027a48",
  "#175cd3",
  "#b42318",
  "#6941c6",
  "#088ab2",
  "#dc6803",
  "#3538cd",
];

function brandColor(brand: string, map: Map<string, string>): string {
  if (!map.has(brand)) {
    map.set(brand, BRAND_COLORS[map.size % BRAND_COLORS.length]);
  }
  return map.get(brand)!;
}

function resolveOwnedSpecs(ball: Ball): {
  rg: number | null;
  diff: number | null;
  mb: number | null;
  coverType: string;
  coreType: string;
  coverName: string;
  coreName: string;
  finish: string;
  releaseMonth: string;
  imageUrl: string;
} {
  const hit = findCatalogBall(ball, catalog);
  return {
    rg: ball.rg ?? hit?.rg ?? null,
    diff: ball.diff ?? hit?.diff ?? null,
    mb: ball.mb ?? hit?.mb ?? null,
    coverType: ball.coverType || hit?.coverType || "",
    coreType: ball.coreType || hit?.coreType || "",
    coverName: ball.coverName || hit?.coverName || "",
    coreName: ball.coreName || hit?.coreName || "",
    finish: ball.surfaceNote || hit?.finish || "",
    releaseMonth: ball.releaseMonth || hit?.releaseMonth || "",
    imageUrl: resolveBallImageUrl(ball, catalog) || hit?.imageUrl || "",
  };
}

function ownedToPoint(ball: Ball): ChartPoint | null {
  const s = resolveOwnedSpecs(ball);
  if (s.rg == null || s.diff == null) return null;
  const cat = findCatalogBall(ball, catalog);
  return {
    id: ball.id,
    key: `owned:${ball.id}`,
    name: catalogPrimaryName({ name: ball.name, nameJa: cat?.nameJa }) || ball.name,
    nameEn: cat?.name || ball.name,
    brand: ball.brand,
    rg: s.rg,
    diff: s.diff,
    mb: s.mb,
    coverType: s.coverType,
    coreType: s.coreType,
    coverName: s.coverName,
    coreName: s.coreName,
    finish: s.finish,
    releaseMonth: s.releaseMonth,
    imageUrl: s.imageUrl,
    source: "owned",
    owned: true,
  };
}

function catalogToPoint(ball: CatalogBall, ownedKeys: Set<string>): ChartPoint | null {
  if (ball.rg == null || ball.diff == null) return null;
  const nameKey = `${ball.brand}|${ball.name}`.toLowerCase();
  const owned = ownedKeys.has(nameKey);
  return {
    id: ball.id,
    key: `catalog:${ball.id}`,
    name: catalogPrimaryName(ball),
    nameEn: ball.name,
    brand: ball.brand,
    rg: ball.rg,
    diff: ball.diff,
    mb: ball.mb,
    coverType: ball.coverType,
    coreType: ball.coreType,
    coverName: ball.coverName,
    coreName: ball.coreName,
    finish: ball.finish,
    releaseMonth: ball.releaseMonth,
    imageUrl: ball.imageUrl,
    source: owned ? "owned" : "catalog",
    owned,
  };
}

function toCandidate(p: ChartPoint): CompareCandidate {
  return {
    key: p.key,
    name: p.name,
    nameEn: p.nameEn,
    brand: p.brand,
    rg: p.rg,
    diff: p.diff,
    mb: p.mb,
    coverType: p.coverType,
    coreType: p.coreType,
    owned: p.owned,
  };
}

const CONCERN_CHIPS = [
  "手前で引っかかる／早く反応しすぎる",
  "奥で曲がらずピンまで足りない",
  "スペアが不安で安定球が欲しい",
  "マイボールの中から役割分担を整理したい",
  "今の所持に足りないカバー／コアを知りたい",
  "オイル多めの日に強い球が欲しい",
];

const PAD = { top: 28, right: 24, bottom: 48, left: 58 };
const CHART_W = 760;
const CHART_H = 520;
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

export function Compare() {
  const { memberBalls, activeMember } = useStore();
  const [source, setSource] = useState<SourceMode>("catalog");
  const [brand, setBrand] = useState("");
  const [cover, setCover] = useState("");
  const [core, setCore] = useState("");
  const [q, setQ] = useState("");
  const [colorBy, setColorBy] = useState<"brand" | "cover" | "source">("brand");
  const [pinned, setPinned] = useState<string[]>([]);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  const [concern, setConcern] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiAdvice, setAiAdvice] = useState("");
  const [aiSuggestedKeys, setAiSuggestedKeys] = useState<string[]>([]);
  const llmReady = isLlmConfigured();

  const ownedKeys = useMemo(
    () => new Set(memberBalls.map((b) => `${b.brand}|${b.name}`.toLowerCase())),
    [memberBalls],
  );

  const brands = useMemo(
    () => [...new Set(catalog.map((b) => b.brand))].sort((a, b) => a.localeCompare(b, "ja")),
    [],
  );
  const covers = useMemo(
    () =>
      [...new Set(catalog.map((b) => b.coverType).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [],
  );
  const cores = useMemo(
    () =>
      [...new Set(catalog.map((b) => b.coreType).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "ja"),
      ),
    [],
  );

  const points = useMemo(() => {
    const list: ChartPoint[] = [];
    const query = q.trim().toLowerCase();

    const pass = (p: ChartPoint) => {
      if (brand && p.brand !== brand) return false;
      if (cover && p.coverType !== cover) return false;
      if (core && p.coreType !== core) return false;
      if (query) {
        const hay = `${p.name} ${p.brand} ${p.coverName} ${p.coreName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    };

    if (source === "owned" || source === "both") {
      for (const b of memberBalls) {
        const p = ownedToPoint(b);
        if (p && pass(p)) list.push(p);
      }
    }
    if (source === "catalog" || source === "both") {
      const ownedIds = new Set(list.map((p) => `${p.brand}|${p.name}`.toLowerCase()));
      for (const b of catalog) {
        const p = catalogToPoint(b, ownedKeys);
        if (!p || !pass(p)) continue;
        // both のときマイボールと二重表示しない
        if (source === "both" && ownedIds.has(`${p.brand}|${p.name}`.toLowerCase())) continue;
        list.push(p);
      }
    }
    return list;
  }, [source, memberBalls, ownedKeys, brand, cover, core, q]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    if (colorBy === "brand") {
      for (const p of points) brandColor(p.brand, map);
    } else if (colorBy === "cover") {
      const coversUnique = [...new Set(points.map((p) => p.coverType || "不明"))];
      coversUnique.forEach((c, i) => map.set(c, BRAND_COLORS[i % BRAND_COLORS.length]));
    } else {
      map.set("owned", "#0f7b4d");
      map.set("catalog", "#0b6bcb");
    }
    return map;
  }, [points, colorBy]);

  const domain = useMemo(() => {
    if (!points.length) {
      return { rgMin: 2.45, rgMax: 2.7, diffMin: 0.01, diffMax: 0.06 };
    }
    const rgs = points.map((p) => p.rg);
    const diffs = points.map((p) => p.diff);
    const rgMin = Math.min(...rgs);
    const rgMax = Math.max(...rgs);
    const diffMin = Math.min(...diffs);
    const diffMax = Math.max(...diffs);
    const rgPad = Math.max(0.01, (rgMax - rgMin) * 0.08);
    const diffPad = Math.max(0.002, (diffMax - diffMin) * 0.08);
    return {
      rgMin: rgMin - rgPad,
      rgMax: rgMax + rgPad,
      diffMin: Math.max(0, diffMin - diffPad),
      diffMax: diffMax + diffPad,
    };
  }, [points]);

  function xOf(diff: number) {
    const t = (diff - domain.diffMin) / (domain.diffMax - domain.diffMin || 1);
    return PAD.left + t * INNER_W;
  }
  // 低い RG（転がり早い）を上へ
  function yOf(rg: number) {
    const t = (rg - domain.rgMin) / (domain.rgMax - domain.rgMin || 1);
    return PAD.top + (1 - t) * INNER_H;
  }

  const hover = points.find((p) => p.key === hoverKey) ?? null;
  const pinnedPoints = pinned
    .map((k) => points.find((p) => p.key === k))
    .filter((p): p is ChartPoint => !!p);

  function togglePin(key: string) {
    setPinned((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= 8 ? prev : [...prev, key],
    );
  }

  function pinSuggested(keys: string[]) {
    setPinned((prev) => {
      const next = [...prev];
      for (const k of keys) {
        if (!next.includes(k) && next.length < 8) next.push(k);
      }
      return next;
    });
    if (keys[0]) setHoverKey(keys[0]);
  }

  async function onConsultAi() {
    setAiLoading(true);
    setAiError("");
    try {
      const ownedPts = memberBalls
        .map(ownedToPoint)
        .filter((p): p is ChartPoint => !!p);
      const ownedKeysSet = new Set(ownedPts.map((p) => p.key));
      // 比較固定があれば優先。なければ所持＋表示中から最大36件
      let pool: ChartPoint[];
      if (pinnedPoints.length > 0) {
        pool = [...pinnedPoints];
        for (const p of ownedPts) {
          if (!pool.some((x) => x.key === p.key) && pool.length < 36) pool.push(p);
        }
      } else {
        pool = [...ownedPts];
        const rest = points.filter((p) => !ownedKeysSet.has(p.key));
        const step = Math.max(1, Math.ceil(rest.length / Math.max(1, 36 - pool.length)));
        for (let i = 0; i < rest.length && pool.length < 36; i += step) {
          pool.push(rest[i]!);
        }
      }
      const result = await generateCompareConsultation({
        memberName: activeMember?.displayName || "プレイヤー",
        member: activeMember,
        concern,
        owned: ownedPts.map(toCandidate),
        candidates: pool.map(toCandidate),
      });
      setAiAdvice(result.advice);
      setAiSuggestedKeys(result.suggestedKeys);
      if (result.suggestedKeys.length) pinSuggested(result.suggestedKeys);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI相談に失敗しました");
    } finally {
      setAiLoading(false);
    }
  }

  const xTicks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return domain.diffMin + t * (domain.diffMax - domain.diffMin);
    });
  }, [domain]);

  const yTicks = useMemo(() => {
    const n = 5;
    return Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1);
      return domain.rgMin + t * (domain.rgMax - domain.rgMin);
    });
  }, [domain]);

  const legendItems = useMemo(() => {
    if (colorBy === "source") {
      return [
        { label: "マイボール", color: colorMap.get("owned")! },
        { label: "カタログ", color: colorMap.get("catalog")! },
      ];
    }
    if (colorBy === "cover") {
      return [...colorMap.entries()].slice(0, 12).map(([label, color]) => ({ label, color }));
    }
    const brandsOnChart = [...new Set(points.map((p) => p.brand))].slice(0, 12);
    return brandsOnChart.map((b) => ({ label: b, color: colorMap.get(b)! }));
  }, [colorBy, colorMap, points]);

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>ボール比較</h1>
          <p>
            縦軸＝転がり（RG・上が早い）／横軸＝曲がり幅（Diff） · 表示 {points.length} 件
            {" · "}悩みからAIに相談できます
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row three">
          <div className="field">
            <label>表示</label>
            <select value={source} onChange={(e) => setSource(e.target.value as SourceMode)}>
              <option value="owned">マイボール</option>
              <option value="catalog">カタログ</option>
              <option value="both">両方</option>
            </select>
          </div>
          <div className="field">
            <label>メーカー</label>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">すべて</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>カバー</label>
            <select value={cover} onChange={(e) => setCover(e.target.value)}>
              <option value="">すべて</option>
              {covers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row three" style={{ marginTop: 10 }}>
          <div className="field">
            <label>コア</label>
            <select value={core} onChange={(e) => setCore(e.target.value)}>
              <option value="">すべて</option>
              {cores.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>キーワード</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="球名・カバー・コア"
            />
          </div>
          <div className="field">
            <label>色分け</label>
            <select
              value={colorBy}
              onChange={(e) => setColorBy(e.target.value as "brand" | "cover" | "source")}
            >
              <option value="brand">メーカー</option>
              <option value="cover">カバー種別</option>
              <option value="source">マイボール／カタログ</option>
            </select>
          </div>
        </div>
        <label style={{ display: "inline-flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: "0.9rem" }}>
          <input
            type="checkbox"
            checked={showLabels}
            onChange={(e) => setShowLabels(e.target.checked)}
          />
          すべての点に名前を表示（多いと見づらいことがあります）
        </label>
      </div>

      <div className="grid two" style={{ alignItems: "start" }}>
        <div className="card compare-chart-card">
          {!points.length ? (
            <div className="empty" style={{ padding: 40 }}>
              {source === "owned"
                ? "スペック付きのマイボールがありません。カタログ表示に切り替えるか、ボールを登録してください。"
                : "条件に合うボールがありません。フィルタを緩めてください。"}
            </div>
          ) : (
            <div className="compare-chart-wrap">
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="compare-chart"
                role="img"
                aria-label="転がりと曲がり幅の散布図"
              >
                <rect x={0} y={0} width={CHART_W} height={CHART_H} fill="#fff" rx={12} />
                {/* grid */}
                {xTicks.map((v) => (
                  <line
                    key={`vx-${v}`}
                    x1={xOf(v)}
                    x2={xOf(v)}
                    y1={PAD.top}
                    y2={PAD.top + INNER_H}
                    stroke="#eef1f5"
                  />
                ))}
                {yTicks.map((v) => (
                  <line
                    key={`hy-${v}`}
                    x1={PAD.left}
                    x2={PAD.left + INNER_W}
                    y1={yOf(v)}
                    y2={yOf(v)}
                    stroke="#eef1f5"
                  />
                ))}
                {/* axes */}
                <line
                  x1={PAD.left}
                  x2={PAD.left + INNER_W}
                  y1={PAD.top + INNER_H}
                  y2={PAD.top + INNER_H}
                  stroke="#98a2b3"
                />
                <line
                  x1={PAD.left}
                  x2={PAD.left}
                  y1={PAD.top}
                  y2={PAD.top + INNER_H}
                  stroke="#98a2b3"
                />
                {xTicks.map((v) => (
                  <text
                    key={`xt-${v}`}
                    x={xOf(v)}
                    y={PAD.top + INNER_H + 18}
                    textAnchor="middle"
                    fontSize={11}
                    fill="#667085"
                  >
                    {v.toFixed(3)}
                  </text>
                ))}
                {yTicks.map((v) => (
                  <text
                    key={`yt-${v}`}
                    x={PAD.left - 10}
                    y={yOf(v) + 4}
                    textAnchor="end"
                    fontSize={11}
                    fill="#667085"
                  >
                    {v.toFixed(3)}
                  </text>
                ))}
                <text
                  x={PAD.left + INNER_W / 2}
                  y={CHART_H - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill="#152033"
                >
                  曲がり幅（Diff） →
                </text>
                <text
                  x={16}
                  y={PAD.top + INNER_H / 2}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill="#152033"
                  transform={`rotate(-90 16 ${PAD.top + INNER_H / 2})`}
                >
                  転がり（RG・上が早い）
                </text>

                {points.map((p) => {
                  const cx = xOf(p.diff);
                  const cy = yOf(p.rg);
                  const isPinned = pinned.includes(p.key);
                  const isHover = hoverKey === p.key;
                  const isAi = aiSuggestedKeys.includes(p.key);
                  const fill =
                    colorBy === "source"
                      ? colorMap.get(p.owned ? "owned" : "catalog")!
                      : colorBy === "cover"
                        ? colorMap.get(p.coverType || "不明")!
                        : colorMap.get(p.brand)!;
                  const r = isPinned || p.owned || isAi ? 7 : points.length > 400 ? 3.5 : 5;
                  return (
                    <g key={p.key}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHover || isPinned || isAi ? r + 2 : r}
                        fill={fill}
                        fillOpacity={isPinned || isHover || p.owned || isAi ? 0.95 : 0.55}
                        stroke={isAi ? "#b54708" : isPinned ? "#152033" : "#fff"}
                        strokeWidth={isAi || isPinned ? 2.5 : 1}
                        style={{ cursor: "pointer" }}
                        onMouseEnter={() => setHoverKey(p.key)}
                        onMouseLeave={() => setHoverKey((k) => (k === p.key ? null : k))}
                        onClick={() => togglePin(p.key)}
                      />
                      {(showLabels || isPinned || isHover || isAi) && (
                        <text
                          x={cx + 8}
                          y={cy - 8}
                          fontSize={10}
                          fontWeight={isPinned || isHover ? 700 : 500}
                          fill="#152033"
                          style={{ pointerEvents: "none" }}
                        >
                          {p.name}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              <div className="compare-legend">
                {legendItems.map((item) => (
                  <span key={item.label} className="compare-legend-item">
                    <i style={{ background: item.color }} />
                    {item.label}
                  </span>
                ))}
              </div>
              <p style={{ margin: "8px 0 0", color: "var(--sub)", fontSize: "0.82rem" }}>
                点をクリックすると比較リストに固定できます（最大8件）。点が多いときはメーカーやキーワードで絞ると見やすくなります。
              </p>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>詳細</h3>
          {hover || pinnedPoints[0] ? (
            <PointDetail point={hover ?? pinnedPoints[0]!} />
          ) : (
            <p style={{ color: "var(--sub)", margin: 0 }}>チャート上の点にマウスを合わせると詳細が出ます。</p>
          )}

          {pinnedPoints.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>比較中（{pinnedPoints.length}）</h3>
                <button className="btn secondary" type="button" onClick={() => setPinned([])}>
                  クリア
                </button>
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {pinnedPoints.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="compare-pin-row"
                    onClick={() => setHoverKey(p.key)}
                    onDoubleClick={() => togglePin(p.key)}
                  >
                    <span
                      className="compare-pin-dot"
                      style={{
                        background:
                          colorBy === "source"
                            ? colorMap.get(p.owned ? "owned" : "catalog")
                            : colorBy === "cover"
                              ? colorMap.get(p.coverType || "不明")
                              : colorMap.get(p.brand),
                      }}
                    />
                    <span style={{ flex: 1, textAlign: "left" }}>
                      <strong>
                        {p.brand} {p.name}
                      </strong>
                      <div style={{ color: "var(--sub)", fontSize: "0.82rem" }}>
                        RG {p.rg.toFixed(3)} · Diff {p.diff.toFixed(3)}
                        {p.mb != null ? ` · MB ${p.mb.toFixed(3)}` : ""}
                      </div>
                    </span>
                    <span
                      style={{ color: "var(--sub)", fontSize: "0.8rem" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(p.key);
                      }}
                    >
                      外す
                    </span>
                  </button>
                ))}
              </div>
              {pinnedPoints.length >= 2 ? (
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>項目</th>
                      {pinnedPoints.map((p) => (
                        <th key={p.key}>{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["RG", (p: ChartPoint) => p.rg.toFixed(3)],
                        ["Diff", (p: ChartPoint) => p.diff.toFixed(3)],
                        ["MB", (p: ChartPoint) => (p.mb != null ? p.mb.toFixed(3) : "—")],
                        ["カバー", (p: ChartPoint) => p.coverType || "—"],
                        ["コア", (p: ChartPoint) => p.coreType || "—"],
                      ] as const
                    ).map(([label, fn]) => (
                      <tr key={label}>
                        <td>{label}</td>
                        {pinnedPoints.map((p) => (
                          <td key={p.key}>{fn(p)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>AI相談（ボール選び）</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginTop: 0 }}>
          悩みを書くと、いま表示中（または比較固定中）の候補から適した球を提案します。提案球はチャートに自動で固定されます。
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {CONCERN_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              className="btn secondary"
              style={{ fontSize: "0.82rem", padding: "6px 10px" }}
              onClick={() =>
                setConcern((prev) => (prev.trim() ? `${prev.trim()}\n${chip}` : chip))
              }
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="field">
          <label>悩み・相談内容</label>
          <textarea
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
            rows={4}
            placeholder="例: ハウスコンディションで手前に張り付く。もう少し奥まで走る球が欲しい。マイボール中心で考えたい。"
          />
        </div>
        {!llmReady ? (
          <p style={{ color: "var(--warn)", fontSize: "0.88rem" }}>
            APIキー未設定です。<Link to="/settings">設定・共有</Link>から登録してください。
          </p>
        ) : (
          <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              disabled={aiLoading || !concern.trim() || points.length === 0}
              onClick={() => void onConsultAi()}
            >
              {aiLoading ? "相談中…" : aiAdvice ? "もう一度相談する" : "AIに相談する"}
            </button>
            {aiSuggestedKeys.length > 0 ? (
              <button
                className="btn secondary"
                type="button"
                onClick={() => pinSuggested(aiSuggestedKeys)}
              >
                提案球をチャートに再固定（{aiSuggestedKeys.length}）
              </button>
            ) : null}
          </div>
        )}
        {aiError ? (
          <p style={{ color: "#b42318", fontSize: "0.88rem", marginTop: 10 }}>{aiError}</p>
        ) : null}
        {aiAdvice ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              borderRadius: 12,
              background: "#f8fafc",
              border: "1px solid var(--line)",
              whiteSpace: "pre-wrap",
              lineHeight: 1.65,
              fontSize: "0.92rem",
            }}
          >
            {aiAdvice}
          </div>
        ) : null}
        {aiSuggestedKeys.length > 0 ? (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <strong style={{ fontSize: "0.9rem" }}>提案球</strong>
            {aiSuggestedKeys.map((key) => {
              const p = points.find((x) => x.key === key);
              if (!p) return null;
              return (
                <button
                  key={key}
                  type="button"
                  className="compare-pin-row"
                  onClick={() => {
                    setHoverKey(key);
                    if (!pinned.includes(key)) togglePin(key);
                  }}
                >
                  {p.imageUrl ? (
                    <img
                      src={publicUrl(p.imageUrl)}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6 }}
                    />
                  ) : (
                    <span className="compare-pin-dot" style={{ background: "#0b6bcb" }} />
                  )}
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <strong>
                      {p.brand} {p.name}
                    </strong>
                    <div style={{ color: "var(--sub)", fontSize: "0.82rem" }}>
                      RG {p.rg.toFixed(3)} · Diff {p.diff.toFixed(3)}
                      {p.owned ? " · 所持" : " · カタログ"}
                    </div>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PointDetail({ point }: { point: ChartPoint }) {
  return (
    <div className="compare-detail">
      {point.imageUrl ? (
        <img src={publicUrl(point.imageUrl)} alt="" className="compare-detail-img" />
      ) : (
        <div className="compare-detail-img placeholder" />
      )}
      <div>
        <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>
          {point.brand} {point.name}
        </div>
        <div style={{ color: "var(--sub)", fontSize: "0.85rem", marginTop: 2 }}>
          {point.owned ? "マイボール" : "カタログ"}
          {point.releaseMonth ? ` · ${point.releaseMonth}` : ""}
        </div>
        <div className="compare-spec-grid">
          <div>
            <span>RG</span>
            <strong>{point.rg.toFixed(3)}</strong>
          </div>
          <div>
            <span>Diff</span>
            <strong>{point.diff.toFixed(3)}</strong>
          </div>
          <div>
            <span>MB</span>
            <strong>{point.mb != null ? point.mb.toFixed(3) : "—"}</strong>
          </div>
        </div>
        <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: "var(--sub)" }}>
          {[point.coverName || point.coverType, point.coreName || point.coreType, point.finish]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </div>
  );
}
