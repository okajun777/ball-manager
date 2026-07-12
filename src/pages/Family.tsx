import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import {
  avg,
  formatMemberProfile,
  type Member,
} from "../lib/types";

type MemberStats = {
  member: Member;
  balls: number;
  retired: number;
  sessions: number;
  games: number;
  practiceAvg: number | null;
  tournamentAvg: number | null;
  lastPlayed: string;
};

export function Family() {
  const { data, activeMember, setActiveMemberId, isAdmin } = useStore();
  const navigate = useNavigate();

  if (!data) return null;
  if (!isAdmin) {
    return (
      <div className="card">
        <h2 style={{ marginTop: 0 }}>管理者のみ</h2>
        <p style={{ color: "var(--sub)" }}>
          全員の登録状況の管理は、管理者（淳司）だけができます。
        </p>
        <button className="btn" type="button" onClick={() => navigate("/")}>
          ダッシュボードへ
        </button>
      </div>
    );
  }

  const rows: MemberStats[] = data.members.map((member) => {
    const balls = data.balls.filter((b) => b.memberId === member.id && !b.retired);
    const retired = data.balls.filter((b) => b.memberId === member.id && b.retired);
    const sessions = data.sessions
      .filter((s) => s.memberId === member.id)
      .sort((a, b) => b.playedOn.localeCompare(a.playedOn));
    const practice = sessions
      .filter((s) => s.sessionType === "practice")
      .flatMap((s) => s.games.map((g) => g.score));
    const tournament = sessions
      .filter((s) => s.sessionType === "tournament")
      .flatMap((s) => s.games.map((g) => g.score));
    return {
      member,
      balls: balls.length,
      retired: retired.length,
      sessions: sessions.length,
      games: sessions.reduce((n, s) => n + s.games.length, 0),
      practiceAvg: avg(practice),
      tournamentAvg: avg(tournament),
      lastPlayed: sessions[0]?.playedOn ?? "",
    };
  });

  function manage(memberId: string, path: string) {
    setActiveMemberId(memberId);
    navigate(path.startsWith("/admin") ? path : `/admin${path.startsWith("/") ? path : `/${path}`}`);
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>全員の登録状況</h1>
          <p>
            管理者画面（/admin）からのみ、各メンバーのボール・スコア・プロフィールをクラウド上で追記・変更できます。
          </p>
        </div>
        <Link className="btn secondary" to="/admin/settings">
          メンバー追加・設定
        </Link>
      </div>

      <div className="grid cards">
        {rows.map((row) => {
          const selected = row.member.id === activeMember?.id;
          return (
            <div
              key={row.member.id}
              className="card"
              style={{
                borderColor: selected ? "var(--accent)" : undefined,
                boxShadow: selected ? "0 0 0 1px var(--accent)" : undefined,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "baseline",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0 }}>{row.member.displayName}</h3>
                {selected ? (
                  <span style={{ color: "var(--accent)", fontSize: "0.82rem", fontWeight: 700 }}>
                    この端末で管理中
                  </span>
                ) : null}
              </div>
              <p style={{ margin: "6px 0 12px", color: "var(--sub)", fontSize: "0.85rem" }}>
                {formatMemberProfile(row.member)}
              </p>

              <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div className="stat" style={{ padding: 0, boxShadow: "none", border: "none" }}>
                  <div className="label">所持ボール</div>
                  <div className="value" style={{ fontSize: "1.25rem" }}>
                    {row.balls}
                    {row.retired ? (
                      <span style={{ fontSize: "0.75rem", color: "var(--sub)", fontWeight: 500 }}>
                        {" "}
                        / 引退 {row.retired}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="stat" style={{ padding: 0, boxShadow: "none", border: "none" }}>
                  <div className="label">スコア</div>
                  <div className="value" style={{ fontSize: "1.25rem" }}>
                    {row.games}
                    <span style={{ fontSize: "0.75rem", color: "var(--sub)", fontWeight: 500 }}>
                      {" "}
                      G（{row.sessions}回）
                    </span>
                  </div>
                </div>
                <div className="stat" style={{ padding: 0, boxShadow: "none", border: "none" }}>
                  <div className="label">練習平均</div>
                  <div className="value" style={{ fontSize: "1.25rem" }}>
                    {row.practiceAvg != null ? Math.round(row.practiceAvg) : "—"}
                  </div>
                </div>
                <div className="stat" style={{ padding: 0, boxShadow: "none", border: "none" }}>
                  <div className="label">大会平均</div>
                  <div className="value" style={{ fontSize: "1.25rem" }}>
                    {row.tournamentAvg != null ? Math.round(row.tournamentAvg) : "—"}
                  </div>
                </div>
              </div>

              <p style={{ margin: "10px 0 0", color: "var(--sub)", fontSize: "0.82rem" }}>
                最終プレー: {row.lastPlayed || "まだなし"}
              </p>

              <div className="form-actions" style={{ marginTop: 12, flexWrap: "wrap" }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => manage(row.member.id, "/admin/balls")}
                >
                  ボール管理
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => manage(row.member.id, "/admin/scores")}
                >
                  スコア入力
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => manage(row.member.id, "/admin/analysis")}
                >
                  分析
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => manage(row.member.id, "/admin/settings")}
                >
                  プロフィール
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
