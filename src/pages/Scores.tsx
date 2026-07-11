import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import type { ScoreGame, ScoreSession, SessionType } from "../lib/types";
import { today, uid } from "../lib/types";

type GameDraft = { score: string; ballId: string };

export function Scores() {
  const { data, activeMember, memberBalls, addSession, memberSessions, deleteSession } =
    useStore();

  const [playedOn, setPlayedOn] = useState(today());
  const [sessionType, setSessionType] = useState<SessionType>("practice");
  const [tournamentName, setTournamentName] = useState("");
  const [shopName, setShopName] = useState("");
  const [oilNote, setOilNote] = useState("ハウス");
  const [memo, setMemo] = useState("");
  const [games, setGames] = useState<GameDraft[]>([
    { score: "", ballId: memberBalls[0]?.id ?? "" },
    { score: "", ballId: memberBalls[0]?.id ?? "" },
    { score: "", ballId: memberBalls[0]?.id ?? "" },
  ]);

  const defaultBallId = memberBalls[0]?.id ?? "";

  const ballName = useMemo(() => {
    const map = new Map(memberBalls.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [memberBalls]);

  if (!data || !activeMember) return null;

  function updateGame(i: number, patch: Partial<GameDraft>) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!memberBalls.length) {
      alert("先にマイボールを登録してください");
      return;
    }
    const parsed: { score: number; ballId: string }[] = [];
    for (const g of games) {
      if (!g.score.trim()) continue;
      const score = Number(g.score);
      if (!Number.isFinite(score) || score < 0 || score > 300) {
        alert("点数は 0〜300 で入力してください");
        return;
      }
      if (!g.ballId) {
        alert("ボールを選択してください");
        return;
      }
      parsed.push({ score, ballId: g.ballId });
    }
    if (!parsed.length) {
      alert("少なくとも1ゲーム入力してください");
      return;
    }

    const sessionId = uid("ses");
    const sessionGames: ScoreGame[] = parsed.map((g, i) => ({
      id: uid("game"),
      sessionId,
      gameNo: i + 1,
      score: g.score,
      ballId: g.ballId,
    }));

    const session: ScoreSession = {
      id: sessionId,
      groupId: data!.group.id,
      memberId: activeMember!.id,
      playedOn,
      sessionType,
      tournamentName: sessionType === "tournament" ? tournamentName.trim() : "",
      shopName: shopName.trim(),
      oilNote: oilNote.trim(),
      memo: memo.trim(),
      games: sessionGames,
    };
    await addSession(session);
    setGames([
      { score: "", ballId: defaultBallId },
      { score: "", ballId: defaultBallId },
      { score: "", ballId: defaultBallId },
    ]);
    setMemo("");
    alert("保存しました");
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>スコア入力</h1>
          <p>合計点のみ。ボールは所持ボールから選択</p>
        </div>
      </div>

      {!memberBalls.length ? (
        <div className="card empty">
          所持ボールがありません。
          <div style={{ marginTop: 10 }}>
            <Link className="btn" to="/balls">
              マイボールを登録
            </Link>
          </div>
        </div>
      ) : (
        <form className="card" onSubmit={onSubmit}>
          <div className="row three">
            <div className="field">
              <label>日付 *</label>
              <input type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
            </div>
            <div className="field">
              <label>区分 *</label>
              <select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value as SessionType)}
              >
                <option value="practice">練習</option>
                <option value="tournament">大会</option>
              </select>
            </div>
            <div className="field">
              <label>店舗（任意）</label>
              <input value={shopName} onChange={(e) => setShopName(e.target.value)} />
            </div>
          </div>

          {sessionType === "tournament" && (
            <div className="field">
              <label>大会名</label>
              <input
                value={tournamentName}
                onChange={(e) => setTournamentName(e.target.value)}
                placeholder="○○オープン"
              />
            </div>
          )}

          <div className="field">
            <label>オイル条件（任意）</label>
            <input value={oilNote} onChange={(e) => setOilNote(e.target.value)} />
          </div>

          <h3>ゲーム</h3>
          {games.map((g, i) => (
            <div className="game-row" key={i}>
              <div className="field">
                <label>G{i + 1}</label>
                <input
                  inputMode="numeric"
                  placeholder="187"
                  value={g.score}
                  onChange={(e) => updateGame(i, { score: e.target.value })}
                />
              </div>
              <div className="field" style={{ gridColumn: "span 2" }}>
                <label>ボール（所持）</label>
                <select
                  value={g.ballId}
                  onChange={(e) => updateGame(i, { ballId: e.target.value })}
                >
                  {memberBalls.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.brand ? `(${b.brand})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setGames((prev) => prev.filter((_, idx) => idx !== i))}
                disabled={games.length <= 1}
              >
                削除
              </button>
            </div>
          ))}
          <button
            className="btn secondary"
            type="button"
            onClick={() =>
              setGames((prev) => [...prev, { score: "", ballId: defaultBallId }])
            }
          >
            ＋ ゲーム追加
          </button>

          <div className="field" style={{ marginTop: 12 }}>
            <label>メモ</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          <div className="form-actions">
            <button className="btn" type="submit">
              保存
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>最近の記録</h3>
        {!memberSessions.length ? (
          <div className="empty">まだありません</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>日付</th>
                <th>区分</th>
                <th>スコア</th>
                <th>ボール</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {memberSessions.slice(0, 20).map((s) => (
                <tr key={s.id}>
                  <td>{s.playedOn}</td>
                  <td>
                    <span className={`badge ${s.sessionType}`}>
                      {s.sessionType === "practice" ? "練習" : "大会"}
                    </span>
                    {s.tournamentName ? ` ${s.tournamentName}` : ""}
                  </td>
                  <td>{s.games.map((g) => g.score).join(" / ")}</td>
                  <td>
                    {[...new Set(s.games.map((g) => ballName(g.ballId)))].join(", ")}
                  </td>
                  <td>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => {
                        if (confirm("この記録を削除しますか？")) void deleteSession(s.id);
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
