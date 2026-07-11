import { useMemo, useState } from "react";
import { summarizeFrames, type FrameRolls } from "../lib/bowlingScore";
import { downloadScoresCsv } from "../lib/csvExport";
import { buildInsights } from "../lib/insights";
import { useStore } from "../lib/store";
import { avg } from "../lib/types";

type Mode = "all" | "practice" | "tournament" | "compare" | "events";
type Period = "all" | "30" | "90" | "365";

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function cutoffDate(period: Period): string | null {
  if (period === "all") return null;
  const days = Number(period);
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function Analysis() {
  const { activeMember, memberAllBalls, memberSessions } = useStore();
  const [mode, setMode] = useState<Mode>("all");
  const [period, setPeriod] = useState<Period>("all");

  const periodSessions = useMemo(() => {
    const cut = cutoffDate(period);
    if (!cut) return memberSessions;
    return memberSessions.filter((s) => s.playedOn >= cut);
  }, [memberSessions, period]);

  const insights = useMemo(
    () => buildInsights(periodSessions, memberAllBalls),
    [periodSessions, memberAllBalls],
  );

  const filtered = useMemo(() => {
    if (mode === "practice") return periodSessions.filter((s) => s.sessionType === "practice");
    if (mode === "tournament")
      return periodSessions.filter((s) => s.sessionType === "tournament");
    return periodSessions;
  }, [periodSessions, mode]);

  const practiceScores = periodSessions
    .filter((s) => s.sessionType === "practice")
    .flatMap((s) => s.games.map((g) => g.score));
  const tournamentScores = periodSessions
    .filter((s) => s.sessionType === "tournament")
    .flatMap((s) => s.games.map((g) => g.score));
  const scores = filtered.flatMap((s) => s.games.map((g) => g.score));

  const frameStats = useMemo(() => {
    const framesList = filtered
      .flatMap((s) => s.games)
      .filter((g) => g.frames && g.frames.length === 10)
      .map((g) => g.frames as FrameRolls[]);
    return summarizeFrames(framesList);
  }, [filtered]);

  const byBall = useMemo(() => {
    const map = new Map<string, { scores: number[]; frames: FrameRolls[][] }>();
    for (const s of filtered) {
      for (const g of s.games) {
        if (!g.ballId) continue;
        const row = map.get(g.ballId) ?? { scores: [], frames: [] };
        row.scores.push(g.score);
        if (g.frames?.length === 10) row.frames.push(g.frames as FrameRolls[]);
        map.set(g.ballId, row);
      }
    }
    return [...map.entries()]
      .map(([ballId, row]) => {
        const ball = memberAllBalls.find((b) => b.id === ballId);
        const marks = summarizeFrames(row.frames);
        return {
          ballId,
          name: ball?.name ?? "不明なボール",
          brand: ball?.brand ?? "",
          avg: avg(row.scores),
          count: row.scores.length,
          high: Math.max(...row.scores),
          strikeRate: pct(marks.strikes, marks.framesCounted),
          spareRate: pct(marks.spares, marks.framesCounted),
          hasFrames: marks.framesCounted > 0,
        };
      })
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [filtered, memberAllBalls]);

  const byShop = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of filtered) {
      const key = s.shopName.trim() || "（未記入）";
      const list = map.get(key) ?? [];
      list.push(...s.games.map((g) => g.score));
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, avg: avg(list), count: list.length }))
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [filtered]);

  const byOil = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of filtered) {
      const key = s.oilNote.trim() || "（未記入）";
      const list = map.get(key) ?? [];
      list.push(...s.games.map((g) => g.score));
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, avg: avg(list), count: list.length }))
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [filtered]);

  const byLane = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of filtered) {
      const lane = (s.laneNote ?? "").trim();
      if (!lane) continue;
      const shop = s.shopName.trim();
      const key = shop ? `${shop} / L${lane}` : `L${lane}`;
      const list = map.get(key) ?? [];
      list.push(...s.games.map((g) => g.score));
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({ key, avg: avg(list), count: list.length }))
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [filtered]);

  const sessionTrend = useMemo(() => {
    return [...filtered]
      .slice()
      .sort((a, b) => a.playedOn.localeCompare(b.playedOn))
      .slice(-12)
      .map((s) => ({
        id: s.id,
        date: s.playedOn,
        avg: avg(s.games.map((g) => g.score)) ?? 0,
        type: s.sessionType,
      }));
  }, [filtered]);

  const trendMax = Math.max(200, ...sessionTrend.map((t) => t.avg), 1);

  const byTournament = useMemo(() => {
    const map = new Map<
      string,
      { name: string; dates: string[]; scores: number[]; sessions: number; shop: string }
    >();
    for (const s of periodSessions.filter((x) => x.sessionType === "tournament")) {
      const name = s.tournamentName.trim() || "（大会名なし）";
      const row = map.get(name) ?? {
        name,
        dates: [],
        scores: [],
        sessions: 0,
        shop: s.shopName,
      };
      row.dates.push(s.playedOn);
      row.scores.push(...s.games.map((g) => g.score));
      row.sessions += 1;
      if (!row.shop && s.shopName) row.shop = s.shopName;
      map.set(name, row);
    }
    return [...map.values()]
      .map((row) => ({
        ...row,
        avg: avg(row.scores),
        high: row.scores.length ? Math.max(...row.scores) : null,
        low: row.scores.length ? Math.min(...row.scores) : null,
        lastDate: [...row.dates].sort().at(-1) ?? "",
      }))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [periodSessions]);

  const ballCompare = useMemo(() => {
    const map = new Map<
      string,
      { practice: number[]; tournament: number[] }
    >();
    for (const s of periodSessions) {
      for (const g of s.games) {
        if (!g.ballId) continue;
        const row = map.get(g.ballId) ?? { practice: [], tournament: [] };
        if (s.sessionType === "practice") row.practice.push(g.score);
        else row.tournament.push(g.score);
        map.set(g.ballId, row);
      }
    }
    return [...map.entries()]
      .map(([ballId, row]) => {
        const ball = memberAllBalls.find((b) => b.id === ballId);
        const pAvg = avg(row.practice);
        const tAvg = avg(row.tournament);
        return {
          ballId,
          name: ball?.name ?? "不明なボール",
          brand: ball?.brand ?? "",
          practiceAvg: pAvg,
          practiceCount: row.practice.length,
          tournamentAvg: tAvg,
          tournamentCount: row.tournament.length,
          gap:
            pAvg != null && tAvg != null
              ? Math.round((pAvg - tAvg) * 10) / 10
              : null,
        };
      })
      .filter((r) => r.practiceCount > 0 || r.tournamentCount > 0)
      .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
  }, [periodSessions, memberAllBalls]);

  const topGames = useMemo(() => {
    return filtered
      .flatMap((s) =>
        s.games.map((g) => ({
          sessionId: s.id,
          playedOn: s.playedOn,
          sessionType: s.sessionType,
          tournamentName: s.tournamentName,
          shopName: s.shopName,
          laneNote: s.laneNote ?? "",
          score: g.score,
          ballName: memberAllBalls.find((b) => b.id === g.ballId)?.name ?? "—",
        })),
      )
      .sort((a, b) => b.score - a.score || b.playedOn.localeCompare(a.playedOn))
      .slice(0, 10);
  }, [filtered, memberAllBalls]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of filtered) {
      const key = s.playedOn.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const list = map.get(key) ?? [];
      list.push(...s.games.map((g) => g.score));
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([key, list]) => ({
        key,
        avg: avg(list),
        high: list.length ? Math.max(...list) : null,
        count: list.length,
      }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [filtered]);

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>分析</h1>
          <p>{activeMember?.displayName} の練習 / 大会を分けて確認</p>
        </div>
        <button
          className="btn secondary"
          type="button"
          onClick={() =>
            downloadScoresCsv(
              periodSessions,
              memberAllBalls,
              activeMember?.displayName ?? "member",
            )
          }
        >
          CSV書き出し
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 10 }}>
        {(
          [
            ["all", "全期間"],
            ["30", "直近30日"],
            ["90", "直近90日"],
            ["365", "直近1年"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${period === key ? "active" : ""}`}
            onClick={() => setPeriod(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>気づき</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--sub)", lineHeight: 1.55 }}>
          {insights.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <div className="tabs">
        {(
          [
            ["all", "すべて"],
            ["practice", "練習のみ"],
            ["tournament", "大会のみ"],
            ["events", "大会まとめ"],
            ["compare", "比較"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`tab ${mode === key ? "active" : ""}`}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "events" ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>大会ごとの成績</h3>
          {!byTournament.length ? (
            <div className="empty">大会記録がありません。スコア入力で区分を「大会」にして保存してください。</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>大会</th>
                  <th>直近</th>
                  <th>平均</th>
                  <th>最高</th>
                  <th>最低</th>
                  <th>G数</th>
                  <th>回</th>
                </tr>
              </thead>
              <tbody>
                {byTournament.map((row) => (
                  <tr key={row.name}>
                    <td>
                      <strong>{row.name}</strong>
                      {row.shop ? (
                        <div style={{ color: "var(--sub)", fontSize: "0.8rem" }}>{row.shop}</div>
                      ) : null}
                    </td>
                    <td>{row.lastDate}</td>
                    <td>{row.avg ?? "—"}</td>
                    <td>{row.high ?? "—"}</td>
                    <td>{row.low ?? "—"}</td>
                    <td>{row.scores.length}</td>
                    <td>{row.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : mode === "compare" ? (
        <>
          <div className="grid stats">
            <div className="card stat">
              <div className="label">練習 平均</div>
              <div className="value">{avg(practiceScores) ?? "—"}</div>
              <div className="hint">{practiceScores.length} games</div>
            </div>
            <div className="card stat">
              <div className="label">大会 平均</div>
              <div className="value">{avg(tournamentScores) ?? "—"}</div>
              <div className="hint">{tournamentScores.length} games</div>
            </div>
            <div className="card stat">
              <div className="label">差（練習−大会）</div>
              <div className="value">
                {avg(practiceScores) != null && avg(tournamentScores) != null
                  ? Math.round(
                      ((avg(practiceScores) as number) - (avg(tournamentScores) as number)) * 10,
                    ) / 10
                  : "—"}
              </div>
            </div>
            <div className="card stat">
              <div className="label">セッション数</div>
              <div className="value">
                {periodSessions.filter((s) => s.sessionType === "practice").length} /{" "}
                {periodSessions.filter((s) => s.sessionType === "tournament").length}
              </div>
              <div className="hint">練習 / 大会</div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>ボール別：練習 vs 大会</h3>
            <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginTop: 0 }}>
              差が大きい球ほど、本番で落ちやすい／上がりやすい可能性があります。
            </p>
            {!ballCompare.length ? (
              <div className="empty">比較できるボール記録がありません</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ボール</th>
                    <th>練習平均</th>
                    <th>大会平均</th>
                    <th>差</th>
                    <th>G数</th>
                  </tr>
                </thead>
                <tbody>
                  {ballCompare.map((row) => (
                    <tr key={row.ballId}>
                      <td>
                        <strong>{row.name}</strong>
                        {row.brand ? (
                          <div style={{ color: "var(--sub)", fontSize: "0.8rem" }}>{row.brand}</div>
                        ) : null}
                      </td>
                      <td>
                        {row.practiceAvg ?? "—"}
                        <div style={{ color: "var(--sub)", fontSize: "0.75rem" }}>
                          {row.practiceCount}G
                        </div>
                      </td>
                      <td>
                        {row.tournamentAvg ?? "—"}
                        <div style={{ color: "var(--sub)", fontSize: "0.75rem" }}>
                          {row.tournamentCount}G
                        </div>
                      </td>
                      <td
                        style={{
                          color:
                            row.gap == null
                              ? undefined
                              : row.gap >= 10
                                ? "var(--warn)"
                                : row.gap <= -8
                                  ? "var(--good)"
                                  : undefined,
                          fontWeight: 700,
                        }}
                      >
                        {row.gap == null ? "—" : row.gap > 0 ? `+${row.gap}` : row.gap}
                      </td>
                      <td>
                        {row.practiceCount}/{row.tournamentCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="grid stats">
            <div className="card stat">
              <div className="label">平均</div>
              <div className="value">{avg(scores) ?? "—"}</div>
            </div>
            <div className="card stat">
              <div className="label">最高</div>
              <div className="value">{scores.length ? Math.max(...scores) : "—"}</div>
            </div>
            <div className="card stat">
              <div className="label">ゲーム数</div>
              <div className="value">{scores.length}</div>
            </div>
            <div className="card stat">
              <div className="label">セッション</div>
              <div className="value">{filtered.length}</div>
            </div>
          </div>

          {frameStats.framesCounted > 0 && (
            <div className="grid stats" style={{ marginTop: 14 }}>
              <div className="card stat">
                <div className="label">ストライク率</div>
                <div className="value">{pct(frameStats.strikes, frameStats.framesCounted)}</div>
                <div className="hint">{frameStats.strikes} / {frameStats.framesCounted}F</div>
              </div>
              <div className="card stat">
                <div className="label">スペア率</div>
                <div className="value">{pct(frameStats.spares, frameStats.framesCounted)}</div>
                <div className="hint">{frameStats.spares} / {frameStats.framesCounted}F</div>
              </div>
              <div className="card stat">
                <div className="label">オープン率</div>
                <div className="value">{pct(frameStats.opens, frameStats.framesCounted)}</div>
                <div className="hint">{frameStats.opens} / {frameStats.framesCounted}F</div>
              </div>
              <div className="card stat">
                <div className="label">フレーム記録</div>
                <div className="value">
                  {
                    filtered.flatMap((s) => s.games).filter((g) => g.frames?.length === 10)
                      .length
                  }
                </div>
                <div className="hint">フレーム入力したゲーム</div>
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>最高ゲーム（Top 10）</h3>
            {!topGames.length ? (
              <div className="empty">データがありません</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>日付</th>
                    <th>スコア</th>
                    <th>ボール</th>
                    <th>条件</th>
                  </tr>
                </thead>
                <tbody>
                  {topGames.map((g, i) => (
                    <tr key={`${g.sessionId}-${g.score}-${i}`}>
                      <td>{i + 1}</td>
                      <td>
                        {g.playedOn}
                        <div style={{ color: "var(--sub)", fontSize: "0.75rem" }}>
                          {g.sessionType === "practice" ? "練習" : "大会"}
                          {g.tournamentName ? ` ${g.tournamentName}` : ""}
                        </div>
                      </td>
                      <td>
                        <strong>{g.score}</strong>
                      </td>
                      <td>{g.ballName}</td>
                      <td style={{ fontSize: "0.85rem", color: "var(--sub)" }}>
                        {g.shopName || "—"}
                        {g.laneNote ? ` / L${g.laneNote}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>月別平均</h3>
            {!byMonth.length ? (
              <div className="empty">データがありません</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>月</th>
                    <th>平均</th>
                    <th>最高</th>
                    <th>G数</th>
                  </tr>
                </thead>
                <tbody>
                  {byMonth.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td>
                      <td>{row.avg ?? "—"}</td>
                      <td>{row.high ?? "—"}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {mode !== "compare" && mode !== "events" && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>ボール別パフォーマンス</h3>
            {!byBall.length ? (
              <div className="empty">データがありません</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>ボール</th>
                    <th>平均</th>
                    <th>最高</th>
                    <th>使用数</th>
                    <th>X率</th>
                    <th>/率</th>
                  </tr>
                </thead>
                <tbody>
                  {byBall.map((row) => (
                    <tr key={row.ballId}>
                      <td>
                        <strong>{row.name}</strong>
                        {row.brand ? (
                          <div style={{ color: "var(--sub)", fontSize: "0.8rem" }}>{row.brand}</div>
                        ) : null}
                      </td>
                      <td>{row.avg ?? "—"}</td>
                      <td>{row.high}</td>
                      <td>{row.count}</td>
                      <td>{row.hasFrames ? row.strikeRate : "—"}</td>
                      <td>{row.hasFrames ? row.spareRate : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid two" style={{ marginTop: 14 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>店舗別平均</h3>
              {!byShop.length ? (
                <div className="empty">店舗メモのある記録がありません</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>店舗</th>
                      <th>平均</th>
                      <th>G数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byShop.map((row) => (
                      <tr key={row.key}>
                        <td>{row.key}</td>
                        <td>{row.avg ?? "—"}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>オイル条件別平均</h3>
              {!byOil.length ? (
                <div className="empty">オイルメモのある記録がありません</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>オイル</th>
                      <th>平均</th>
                      <th>G数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byOil.map((row) => (
                      <tr key={row.key}>
                        <td>{row.key}</td>
                        <td>{row.avg ?? "—"}</td>
                        <td>{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>レーン別平均</h3>
            {!byLane.length ? (
              <div className="empty">レーン番号のある記録がありません</div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>店舗 / レーン</th>
                    <th>平均</th>
                    <th>G数</th>
                  </tr>
                </thead>
                <tbody>
                  {byLane.map((row) => (
                    <tr key={row.key}>
                      <td>{row.key}</td>
                      <td>{row.avg ?? "—"}</td>
                      <td>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <h3 style={{ marginTop: 0 }}>スコア推移（セッション平均）</h3>
            {!sessionTrend.length ? (
              <div className="empty">データがありません</div>
            ) : (
              <div className="trend-chart tall" aria-label="スコア推移">
                {sessionTrend.map((t) => (
                  <div key={t.id} className="trend-col">
                    <div
                      className={`trend-bar ${t.type}`}
                      style={{ height: `${Math.max(8, (t.avg / trendMax) * 100)}%` }}
                      title={`${t.date}: ${t.avg}`}
                    />
                    <div className="trend-label">{t.date.slice(5)}</div>
                    <div className="trend-val">{t.avg}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
