import type { Ball, ScoreSession } from "./types";
import { avg } from "./types";

/** セッション結果をLINE等に貼れるテキストにする */
export function formatSessionShareText(
  session: ScoreSession,
  balls: Ball[],
  memberName: string,
): string {
  const ballName = (id: string | null) =>
    id ? (balls.find((b) => b.id === id)?.name ?? "—") : "—";

  const typeLabel = session.sessionType === "practice" ? "練習" : "大会";
  const scores = session.games.map((g) => g.score);
  const average = avg(scores);
  const lines = [
    `【Bowling】${memberName} ${session.playedOn}`,
    `${typeLabel}${session.tournamentName ? ` ${session.tournamentName}` : ""}`,
  ];

  const meta: string[] = [];
  if (session.shopName.trim()) meta.push(session.shopName.trim());
  if (session.laneNote?.trim()) meta.push(`L${session.laneNote.trim()}`);
  if (session.oilNote.trim()) meta.push(session.oilNote.trim());
  if (meta.length) lines.push(meta.join(" / "));

  lines.push(
    ...session.games.map(
      (g) => `G${g.gameNo}  ${g.score}  ${ballName(g.ballId)}`,
    ),
  );

  if (scores.length) {
    lines.push(
      `平均 ${average ?? "—"}  最高 ${Math.max(...scores)}  ${scores.length}G`,
    );
  }
  if (session.memo.trim()) lines.push(`メモ: ${session.memo.trim()}`);

  return lines.join("\n");
}
