import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import catalogBalls from "../data/catalogBalls.json";
import { OIL_PRESETS, type CatalogBall } from "../lib/catalogTypes";
import {
  buildMaintDueList,
  loadMaintReminderSettings,
  maybeNotifyMaintDue,
} from "../lib/maintReminder";
import { formatSessionShareText } from "../lib/shareSession";
import { adviseBalls } from "../lib/strategy";
import { useStore } from "../lib/store";
import { ROUND1_QUEUE_URL } from "../lib/round1";
import {
  OSAKA_BOWLING_URL,
  eventsWithOilPattern,
} from "../lib/osakaBowling";
import { Round1QueueWidget } from "../components/Round1QueueWidget";
import { avg, today } from "../lib/types";

const catalog = catalogBalls as CatalogBall[];
const houseOil = OIL_PRESETS.find((p) => p.id === "house") ?? OIL_PRESETS[0];

export function Dashboard() {
  const { activeMember, memberBalls, memberAllBalls, memberSessions, memberMaintenances } =
    useStore();

  const practiceScores = memberSessions
    .filter((s) => s.sessionType === "practice")
    .flatMap((s) => s.games.map((g) => g.score));
  const tournamentScores = memberSessions
    .filter((s) => s.sessionType === "tournament")
    .flatMap((s) => s.games.map((g) => g.score));
  const recent = memberSessions[0];
  const todayKey = today();
  const todaySessions = useMemo(
    () => memberSessions.filter((s) => s.playedOn === todayKey),
    [memberSessions, todayKey],
  );

  const weekSessions = useMemo(() => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // Mon=0
    const start = new Date(now);
    start.setDate(now.getDate() - day);
    const startKey = start.toISOString().slice(0, 10);
    return memberSessions.filter((s) => s.playedOn >= startKey && s.playedOn <= todayKey);
  }, [memberSessions, todayKey]);

  const weekScores = weekSessions.flatMap((s) => s.games.map((g) => g.score));
  const weekAvg = avg(weekScores);

  const reminder = loadMaintReminderSettings();
  const maintDue = useMemo(() => {
    if (!reminder.enabled) return [];
    return buildMaintDueList({
      balls: memberBalls,
      maintenances: memberMaintenances,
      intervalDays: reminder.intervalDays,
    }).filter((b) => b.status !== "ok");
  }, [memberBalls, memberMaintenances, reminder.enabled, reminder.intervalDays]);

  useEffect(() => {
    if (reminder.enabled && reminder.notify) {
      maybeNotifyMaintDue(maintDue.length);
    }
  }, [maintDue.length, reminder.enabled, reminder.notify]);

  const recommendations = useMemo(() => {
    if (!memberBalls.length) return [];
    return adviseBalls({
      owned: memberBalls,
      catalog,
      oil: houseOil,
      ownedOnly: true,
      note: "ハウス",
      sessions: memberSessions,
      performanceFocus: "practice",
      usePerformance: true,
      hand: activeMember?.hand,
    }).slice(0, 3);
  }, [memberBalls, memberSessions, activeMember?.hand]);

  const trend = useMemo(() => {
    return [...memberSessions]
      .slice(0, 8)
      .reverse()
      .map((s) => ({
        id: s.id,
        label: s.playedOn.slice(5),
        avg: avg(s.games.map((g) => g.score)) ?? 0,
        type: s.sessionType,
      }));
  }, [memberSessions]);

  const trendMax = Math.max(200, ...trend.map((t) => t.avg), 1);

  const topBalls = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of memberSessions) {
      for (const g of s.games) {
        if (!g.ballId) continue;
        const list = map.get(g.ballId) ?? [];
        list.push(g.score);
        map.set(g.ballId, list);
      }
    }
    return [...map.entries()]
      .map(([ballId, scores]) => {
        const ball = memberAllBalls.find((b) => b.id === ballId);
        return {
          ballId,
          name: ball?.name ?? "不明",
          avg: avg(scores),
          count: scores.length,
        };
      })
      .filter((r) => r.count >= 1)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
      .slice(0, 3);
  }, [memberSessions, memberAllBalls]);

  const oilEvents = useMemo(() => eventsWithOilPattern().slice(0, 5), []);

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>ダッシュボード</h1>
          <p>{activeMember?.displayName} の概要</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn secondary" href={OSAKA_BOWLING_URL} target="_blank" rel="noreferrer">
            大阪府大会情報
          </a>
          <a className="btn secondary" href={ROUND1_QUEUE_URL} target="_blank" rel="noreferrer">
            ラウンドワン
          </a>
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

      <Round1QueueWidget />

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>大阪府ボウリング大会情報</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          日程・会場・開催要項・オイルパターンは大会情報アプリで確認できます。パターン公開後は攻略AIで選択、スコア入力にも大会を紐づけられます。
        </p>
        {oilEvents.length > 0 ? (
          <ul style={{ margin: "0 0 10px", paddingLeft: 18, fontSize: "0.9rem" }}>
            {oilEvents.map((e) => (
              <li key={e.id} style={{ marginBottom: 4 }}>
                {e.startDate} {e.name}
                {e.venue ? `（${e.venue}）` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ color: "var(--sub)", fontSize: "0.88rem" }}>
            いま端末に「オイルパターン付き」の大会はまだありません。大会情報でPDFが公開されたら、攻略AI／スコア入力から選べます。
          </p>
        )}
        <div className="form-actions" style={{ justifyContent: "flex-start", margin: 0, flexWrap: "wrap" }}>
          <a className="btn" href={OSAKA_BOWLING_URL} target="_blank" rel="noreferrer">
            大会情報アプリを開く
          </a>
          <Link className="btn secondary" to="/strategy">
            攻略AIでパターン選択
          </Link>
          <Link className="btn secondary" to="/scores?tournament=1">
            大会スコアを入力
          </Link>
        </div>
      </div>

      <div className="grid two" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>今日（{todayKey}）</h3>
          {!todaySessions.length ? (
            <div>
              <p style={{ color: "var(--sub)", marginTop: 0 }}>まだ今日の記録がありません。</p>
              <Link className="btn" to="/scores">
                今日のスコアを入力
              </Link>
            </div>
          ) : (
            <div>
              <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
                {todaySessions.map((s) => (
                  <li key={s.id} style={{ marginBottom: 6 }}>
                    <span className={`badge ${s.sessionType}`}>
                      {s.sessionType === "practice" ? "練習" : "大会"}
                    </span>{" "}
                    {s.games.map((g) => g.score).join(" / ")}
                    {avg(s.games.map((g) => g.score)) != null
                      ? `（平均 ${avg(s.games.map((g) => g.score))}）`
                      : ""}
                    {s.shopName ? ` · ${s.shopName}` : ""}
                    {s.laneNote ? ` · L${s.laneNote}` : ""}
                  </li>
                ))}
              </ul>
              <div className="form-actions" style={{ justifyContent: "flex-start", margin: 0 }}>
                <Link className="btn" to="/scores">
                  追加で入力
                </Link>
                <Link className="btn secondary" to="/analysis">
                  分析を見る
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>今週</h3>
          {!weekScores.length ? (
            <p style={{ color: "var(--sub)", marginTop: 0 }}>今週の記録はまだありません。</p>
          ) : (
            <>
              <div className="grid stats" style={{ marginBottom: 8 }}>
                <div className="stat" style={{ padding: 0 }}>
                  <div className="label">平均</div>
                  <div className="value" style={{ fontSize: "1.6rem" }}>
                    {weekAvg ?? "—"}
                  </div>
                </div>
                <div className="stat" style={{ padding: 0 }}>
                  <div className="label">最高</div>
                  <div className="value" style={{ fontSize: "1.6rem" }}>
                    {Math.max(...weekScores)}
                  </div>
                </div>
                <div className="stat" style={{ padding: 0 }}>
                  <div className="label">ゲーム</div>
                  <div className="value" style={{ fontSize: "1.6rem" }}>
                    {weekScores.length}
                  </div>
                </div>
                <div className="stat" style={{ padding: 0 }}>
                  <div className="label">回数</div>
                  <div className="value" style={{ fontSize: "1.6rem" }}>
                    {weekSessions.length}
                  </div>
                </div>
              </div>
              <p style={{ color: "var(--sub)", fontSize: "0.85rem", margin: 0 }}>
                月曜始まり。練習{" "}
                {weekSessions.filter((s) => s.sessionType === "practice").length} / 大会{" "}
                {weekSessions.filter((s) => s.sessionType === "tournament").length}
              </p>
            </>
          )}
        </div>
      </div>

      {reminder.enabled && maintDue.length > 0 && (
        <div
          className="card"
          style={{ marginBottom: 14, borderColor: "#f6c7a0", background: "#fff8f1" }}
        >
          <h3 style={{ marginTop: 0, color: "var(--warn)" }}>表面メンテのリマインダー</h3>
          <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginTop: 0 }}>
            {reminder.intervalDays}日以上未実施、または記録なしのボールです。
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 18 }}>
            {maintDue.slice(0, 5).map((b) => (
              <li key={b.ballId} style={{ marginBottom: 4 }}>
                <strong>{b.name}</strong>
                <span style={{ color: "var(--sub)" }}>
                  {b.status === "never"
                    ? " · メンテ未記録"
                    : ` · 最終 ${b.lastDoneOn}（${b.days}日前）`}
                </span>
              </li>
            ))}
          </ul>
          <Link className="btn secondary" to="/balls">
            マイボールで記録
          </Link>
        </div>
      )}

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
          <h3 style={{ marginTop: 0 }}>今日の推奨（ハウス想定）</h3>
          {!memberBalls.length ? (
            <div className="empty">
              マイボールを登録すると推奨が出ます
              <div style={{ marginTop: 8 }}>
                <Link className="btn" to="/balls">
                  マイボール登録
                </Link>
              </div>
            </div>
          ) : !recommendations.length ? (
            <div className="empty">候補がありません</div>
          ) : (
            <>
              <div style={{ display: "grid", gap: 10 }}>
                {recommendations.map((r, i) => (
                  <div key={r.ballId} className="dash-rec">
                    <div className="dash-rec-rank">#{i + 1}</div>
                    <div>
                      <div className="ball-title">{r.name}</div>
                      <div style={{ color: "var(--sub)", fontSize: "0.82rem" }}>
                        {r.brand || "—"}
                        {r.performance
                          ? ` · 平均 ${r.performance.average}（${r.performance.games}G）`
                          : " · 実績少なめ"}
                      </div>
                      <div style={{ fontSize: "0.82rem", marginTop: 4 }}>
                        {r.reasons[0]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <Link className="btn secondary" to="/strategy">
                  条件を変えて攻略
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>直近の調子</h3>
          {!trend.length ? (
            <div className="empty">スコアを入れると推移が出ます</div>
          ) : (
            <>
              <div className="trend-chart" aria-label="直近セッション平均">
                {trend.map((t) => (
                  <div key={t.id} className="trend-col">
                    <div
                      className={`trend-bar ${t.type}`}
                      style={{ height: `${Math.max(8, (t.avg / trendMax) * 100)}%` }}
                      title={`${t.label}: ${t.avg}`}
                    />
                    <div className="trend-label">{t.label}</div>
                    <div className="trend-val">{t.avg}</div>
                  </div>
                ))}
              </div>
              {recent && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginTop: 0 }}>
                    直近: {recent.playedOn}{" "}
                    <span className={`badge ${recent.sessionType}`}>
                      {recent.sessionType === "practice" ? "練習" : "大会"}
                    </span>{" "}
                    {recent.games.map((g) => g.score).join(" / ")}
                    {recent.laneNote ? ` · L${recent.laneNote}` : ""}
                    {avg(recent.games.map((g) => g.score)) != null
                      ? ` · 平均 ${avg(recent.games.map((g) => g.score))}`
                      : ""}
                  </p>
                  <div className="form-actions" style={{ marginTop: 8, justifyContent: "flex-start" }}>
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={async () => {
                        const text = formatSessionShareText(
                          recent,
                          memberAllBalls,
                          activeMember?.displayName ?? "",
                        );
                        await navigator.clipboard.writeText(text);
                        alert("直近結果をコピーしました");
                      }}
                    >
                      直近を共有
                    </button>
                    <Link className="btn secondary" to="/scores">
                      スコアへ
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>成績の良いボール</h3>
          {!topBalls.length ? (
            <div className="empty">まだありません</div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {topBalls.map((b) => (
                <li key={b.ballId} style={{ marginBottom: 6 }}>
                  <strong>{b.name}</strong>
                  <span style={{ color: "var(--sub)" }}>
                    {" "}
                    平均 {b.avg}（{b.count}G）
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 10 }}>
            <Link className="btn secondary" to="/analysis">
              分析を見る
            </Link>
          </div>
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
