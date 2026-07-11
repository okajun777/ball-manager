import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { avg } from "../lib/types";

export function Dashboard() {
  const { activeMember, memberBalls, memberSessions } = useStore();

  const practiceScores = memberSessions
    .filter((s) => s.sessionType === "practice")
    .flatMap((s) => s.games.map((g) => g.score));
  const tournamentScores = memberSessions
    .filter((s) => s.sessionType === "tournament")
    .flatMap((s) => s.games.map((g) => g.score));
  const recent = memberSessions[0];

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>ダッシュボード</h1>
          <p>{activeMember?.displayName} の概要</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn secondary" to="/catalog">
            カタログ
          </Link>
          <Link className="btn secondary" to="/balls">
            ボール追加
          </Link>
          <Link className="btn secondary" to="/strategy">
            攻略AI
          </Link>
          <Link className="btn" to="/scores">
            スコア入力
          </Link>
        </div>
      </div>

      <div className="grid stats">
        <div className="card stat">
          <div className="label">所持ボール</div>
          <div className="value">{memberBalls.length}</div>
        </div>
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
          <div className="label">総ゲーム数</div>
          <div className="value">
            {memberSessions.reduce((n, s) => n + s.games.length, 0)}
          </div>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>直近のスコア</h3>
          {!recent ? (
            <div className="empty">まだスコアがありません</div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className={`badge ${recent.sessionType}`}>
                  {recent.sessionType === "practice" ? "練習" : "大会"}
                </span>
                <strong>{recent.playedOn}</strong>
                {recent.tournamentName && <span>{recent.tournamentName}</span>}
              </div>
              <p style={{ margin: "10px 0" }}>
                {recent.games.map((g) => g.score).join(" / ")}　平均{" "}
                {avg(recent.games.map((g) => g.score))}
              </p>
              <Link className="btn secondary" to="/analysis">
                分析を見る
              </Link>
            </>
          )}
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>マイボール（抜粋）</h3>
          {!memberBalls.length ? (
            <div className="empty">ボール未登録です</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {memberBalls.slice(0, 5).map((b) => (
                <li key={b.id} style={{ marginBottom: 6 }}>
                  <strong>{b.name}</strong>
                  <span style={{ color: "var(--sub)" }}>
                    {" "}
                    / {b.brand || "—"} / {b.shopName || "ショップ未設定"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
