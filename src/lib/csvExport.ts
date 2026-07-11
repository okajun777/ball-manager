import type { Ball, ScoreSession } from "./types";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** メンバーのスコアをゲーム単位で CSV 化 */
export function buildScoresCsv(
  sessions: ScoreSession[],
  balls: Ball[],
  memberName: string,
): string {
  const ballName = (id: string | null) =>
    id ? (balls.find((b) => b.id === id)?.name ?? id) : "";

  const header = [
    "member",
    "played_on",
    "session_type",
    "tournament_name",
    "shop",
    "lane",
    "oil",
    "game_no",
    "score",
    "ball",
    "has_frames",
    "memo",
  ];

  const rows = [...sessions]
    .sort((a, b) => a.playedOn.localeCompare(b.playedOn))
    .flatMap((s) =>
      s.games.map((g) =>
        [
          memberName,
          s.playedOn,
          s.sessionType,
          s.tournamentName,
          s.shopName,
          s.laneNote ?? "",
          s.oilNote,
          g.gameNo,
          g.score,
          ballName(g.ballId),
          g.frames?.length === 10 ? "1" : "0",
          s.memo,
        ]
          .map(csvEscape)
          .join(","),
      ),
    );

  return [header.join(","), ...rows].join("\n");
}

export function downloadScoresCsv(
  sessions: ScoreSession[],
  balls: Ball[],
  memberName: string,
) {
  const csv = buildScoresCsv(sessions, balls, memberName);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  const safe = memberName.replace(/[\\/:*?"<>|]/g, "_") || "member";
  a.href = url;
  a.download = `ball-manager-scores-${safe}-${day}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
