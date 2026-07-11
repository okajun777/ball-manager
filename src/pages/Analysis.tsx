import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { avg } from "../lib/types";

type Mode = "all" | "practice" | "tournament" | "compare";

export function Analysis() {
  const { activeMember, memberBalls, memberSessions } = useStore();
  const [mode, setMode] = useState<Mode>("all");

  const filtered = useMemo(() => {
    if (mode === "practice") return memberSessions.filter((s) => s.sessionType === "practice");
    if (mode === "tournament")
      return memberSessions.filter((s) => s.sessionType === "tournament");
    return memberSessions;
  }, [memberSessions, mode]);

  const practiceScores = memberSessions
    .filter((s) => s.sessionType === "practice")
    .flatMap((s) => s.games.map((g) => g.score));
  const tournamentScores = memberSessions
    .filter((s) => s.sessionType === "tournament")
    .flatMap((s) => s.games.map((g) => g.score));
  const scores = filtered.flatMap((s) => s.games.map((g) => g.score));

  const byBall = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of filtered) {
      for (const g of s.games) {
        if (!g.ballId) continue;
        const list = map.get(g.ballId) ?? [];
        list.push(g.score);
        map.set(g.ballId, list);
      }
    }
    return [...map.entries()]
      .map(([ballId, list]) => {
        const ball = memberBalls.find((b) => b.id === ballId);
        return {
          ballId,
          name: ball?.name ?? "不明なボール",
          brand: ball?.brand ?? "",
          avg: avg(list),
          count: list.length,
          high: Math.max(...list),
        };
      })
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  }, [filtered, memberBalls]);

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>分析</h1>
          <p>{activeMember?.displayName} の練習 / 大会を分けて確認</p>
        </div>
      </div>

      <div className="tabs">
        {(
          [
            ["all", "すべて"],
            ["practice", "練習のみ"],
            ["tournament", "大会のみ"],
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

      {mode === "compare" ? (
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
                ? Math.round(((avg(practiceScores) as number) - (avg(tournamentScores) as number)) * 10) /
                  10
                : "—"}
            </div>
          </div>
          <div className="card stat">
            <div className="label">セッション数</div>
            <div className="value">
              {memberSessions.filter((s) => s.sessionType === "practice").length} /{" "}
              {memberSessions.filter((s) => s.sessionType === "tournament").length}
            </div>
            <div className="hint">練習 / 大会</div>
          </div>
        </div>
      ) : (
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
      )}

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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
