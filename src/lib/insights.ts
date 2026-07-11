import { summarizeFrames, type FrameRolls } from "./bowlingScore";
import type { Ball, ScoreSession } from "./types";
import { avg } from "./types";

/** 分析画面向けの自動気づき（ルールベース） */
export function buildInsights(
  sessions: ScoreSession[],
  balls: Ball[],
): string[] {
  const tips: string[] = [];
  const games = sessions.flatMap((s) => s.games.map((g) => ({ ...g, session: s })));
  if (games.length < 3) {
    tips.push("ゲームがまだ少ないです。合計点でも続けて記録すると傾向が見えてきます。");
    return tips;
  }

  const practice = games.filter((g) => g.session.sessionType === "practice").map((g) => g.score);
  const tournament = games
    .filter((g) => g.session.sessionType === "tournament")
    .map((g) => g.score);
  const pAvg = avg(practice);
  const tAvg = avg(tournament);
  if (pAvg != null && tAvg != null && practice.length >= 3 && tournament.length >= 2) {
    const gap = Math.round((pAvg - tAvg) * 10) / 10;
    if (gap >= 12) {
      tips.push(
        `練習平均 ${pAvg} に対し大会平均 ${tAvg}（差 ${gap}）。本番用の球・ラインを練習で先に固めるとよさそうです。`,
      );
    } else if (gap <= -8) {
      tips.push(
        `大会平均 ${tAvg} が練習 ${pAvg} より高いです。本番の集中が効いているか、練習条件が厳しすぎる可能性があります。`,
      );
    }
  }

  const byBall = new Map<string, number[]>();
  for (const g of games) {
    if (!g.ballId) continue;
    const list = byBall.get(g.ballId) ?? [];
    list.push(g.score);
    byBall.set(g.ballId, list);
  }
  const ballRows = [...byBall.entries()]
    .map(([ballId, scores]) => ({
      ballId,
      name: balls.find((b) => b.id === ballId)?.name ?? "不明",
      avg: avg(scores),
      count: scores.length,
    }))
    .filter((r) => r.avg != null && r.count >= 3)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

  if (ballRows.length >= 2) {
    const best = ballRows[0];
    const worst = ballRows[ballRows.length - 1];
    const spread = Math.round(((best.avg as number) - (worst.avg as number)) * 10) / 10;
    if (spread >= 15) {
      tips.push(
        `${best.name} の平均 ${best.avg} が最も高く、${worst.name} は ${worst.avg}（差 ${spread}）。条件に合わせて使い分けを意識するとよさそうです。`,
      );
    }
  }

  const byOil = new Map<string, number[]>();
  for (const s of sessions) {
    const key = s.oilNote.trim();
    if (!key) continue;
    const list = byOil.get(key) ?? [];
    list.push(...s.games.map((g) => g.score));
    byOil.set(key, list);
  }
  const oilRows = [...byOil.entries()]
    .map(([key, scores]) => ({ key, avg: avg(scores), count: scores.length }))
    .filter((r) => r.avg != null && r.count >= 3)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  if (oilRows.length >= 2) {
    const top = oilRows[0];
    const bottom = oilRows[oilRows.length - 1];
    tips.push(
      `オイル別では「${top.key}」平均 ${top.avg}、「${bottom.key}」平均 ${bottom.avg}。苦手条件の球選びを攻略AIで見直せます。`,
    );
  }

  const sortedSessions = [...sessions].sort((a, b) => a.playedOn.localeCompare(b.playedOn));
  if (sortedSessions.length >= 4) {
    const recent = sortedSessions.slice(-3).flatMap((s) => s.games.map((g) => g.score));
    const older = sortedSessions.slice(0, -3).flatMap((s) => s.games.map((g) => g.score));
    const rAvg = avg(recent);
    const oAvg = avg(older);
    if (rAvg != null && oAvg != null && older.length >= 3) {
      const delta = Math.round((rAvg - oAvg) * 10) / 10;
      if (delta >= 10) {
        tips.push(`直近3回の平均 ${rAvg} はそれ以前 ${oAvg} より +${delta}。調子は上向きです。`);
      } else if (delta <= -10) {
        tips.push(
          `直近3回の平均 ${rAvg} はそれ以前 ${oAvg} より ${delta}。表面メンテや球のローテを確認してみてください。`,
        );
      }
    }
  }

  const framesList = games
    .filter((g) => g.frames && g.frames.length === 10)
    .map((g) => g.frames as FrameRolls[]);
  if (framesList.length >= 2) {
    const marks = summarizeFrames(framesList);
    if (marks.framesCounted >= 20) {
      const sparePct = marks.spares / marks.framesCounted;
      const openPct = marks.opens / marks.framesCounted;
      if (openPct >= 0.35) {
        tips.push(
          `オープン率が ${Math.round(openPct * 1000) / 10}% と高めです。スペア練習を優先すると平均が伸びやすいです。`,
        );
      } else if (sparePct >= 0.45 && marks.strikes / marks.framesCounted < 0.35) {
        tips.push(
          `スペア率は良好（${Math.round(sparePct * 1000) / 10}%）です。ストライクを増やす球・ライン調整が次の伸びしろです。`,
        );
      }
    }
  } else if (games.length >= 6) {
    tips.push("フレーム入力をすると X率・スペア率の気づきも出せます。");
  }

  if (!tips.length) {
    tips.push("大きな偏りは見当たりません。記録を続けて条件別の差を見ていきましょう。");
  }

  return tips.slice(0, 5);
}
