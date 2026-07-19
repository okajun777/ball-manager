import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  emptyFrames,
  formatFrameDisplay,
  maxSecondRoll,
  parseRollInput,
  scoreGameFromFrames,
  type FrameRolls,
} from "../lib/bowlingScore";
import { formatSessionShareText } from "../lib/shareSession";
import {
  OSAKA_BOWLING_URL,
  findOsakaEvent,
  formatOsakaEventLabel,
  listOsakaEventsForPicker,
  setEventPatternPdf,
  type OsakaEvent,
} from "../lib/osakaBowling";
import { loadUserPrefs } from "../lib/prefs";
import { MemberPicker } from "../components/MemberPicker";
import { useStore } from "../lib/store";
import type { ScoreGame, ScoreSession, SessionType } from "../lib/types";
import { today, uid } from "../lib/types";

type EntryMode = "total" | "frames";

type GameDraft = {
  score: string;
  ballId: string;
  frames: FrameRolls[];
};

function blankGame(ballId: string): GameDraft {
  return { score: "", ballId, frames: emptyFrames() };
}

function padFrames(frames: number[][] | undefined): FrameRolls[] {
  const base = emptyFrames();
  if (!frames?.length) return base;
  return base.map((_, i) => (frames[i] ? [...frames[i]] : []));
}

function setFrameRoll(
  frames: FrameRolls[],
  frameIndex: number,
  rollIndex: number,
  value: number | null,
): FrameRolls[] {
  const next = frames.map((f) => [...f]);
  const frame = [...(next[frameIndex] ?? [])];

  if (value == null) {
    frame.splice(rollIndex);
    next[frameIndex] = frame;
    return next;
  }

  if (frameIndex < 9) {
    if (rollIndex === 0) {
      if (value === 10) next[frameIndex] = [10];
      else next[frameIndex] = [value];
      return next;
    }
    const first = frame[0] ?? 0;
    if (first >= 10) return next;
    const capped = Math.min(value, maxSecondRoll(first));
    next[frameIndex] = [first, capped];
    return next;
  }

  // 10th frame
  while (frame.length < rollIndex) frame.push(0);
  frame[rollIndex] = value;
  frame.length = rollIndex + 1;

  if (rollIndex === 0 && value < 10) {
    // keep only first until second entered
  } else if (rollIndex === 1) {
    const first = frame[0] ?? 0;
    if (first < 10) {
      frame[1] = Math.min(value, maxSecondRoll(first));
      if (first + frame[1] < 10) frame.length = 2;
    }
  }
  next[frameIndex] = frame;
  return next;
}

function FrameSheet({
  frames,
  onChange,
}: {
  frames: FrameRolls[];
  onChange: (frames: FrameRolls[]) => void;
}) {
  const total = scoreGameFromFrames(frames);

  function update(frameIndex: number, rollIndex: number, raw: string) {
    const prev = frames[frameIndex]?.[rollIndex - 1] ?? null;
    const parsed = parseRollInput(raw, prev);
    if (raw.trim() && parsed == null) return;
    onChange(setFrameRoll(frames, frameIndex, rollIndex, raw.trim() ? parsed : null));
  }

  function rollCount(frameIndex: number): number {
    if (frameIndex < 9) {
      return frames[frameIndex]?.[0] === 10 ? 1 : 2;
    }
    const f = frames[9] ?? [];
    if (!f.length) return 2;
    if (f[0] === 10 || (f.length >= 2 && f[0] + f[1] === 10)) return 3;
    return 2;
  }

  return (
    <div className="frame-sheet">
      <div className="frame-grid">
        {frames.map((frame, fi) => (
          <div className="frame-cell" key={fi}>
            <div className="frame-no">{fi + 1}</div>
            <div className="frame-rolls">
              {Array.from({ length: rollCount(fi) }, (_, ri) => (
                <input
                  key={ri}
                  className="frame-input"
                  inputMode="numeric"
                  placeholder={ri === 0 && fi < 9 ? "X" : ""}
                  value={frame[ri] == null ? "" : frame[ri] === 10 ? "X" : String(frame[ri])}
                  onChange={(e) => update(fi, ri, e.target.value)}
                />
              ))}
            </div>
            <div className="frame-mark">{formatFrameDisplay(frame, fi)}</div>
          </div>
        ))}
      </div>
      <div className="frame-total">合計 {total ?? "—"}</div>
    </div>
  );
}

export function Scores() {
  const {
    data,
    activeMember,
    setActiveMemberId,
    isAdmin,
    memberBalls,
    memberAllBalls,
    upsertSession,
    memberSessions,
    deleteSession,
  } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const prefs = useMemo(() => loadUserPrefs(), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [playedOn, setPlayedOn] = useState(today());
  const [sessionType, setSessionType] = useState<SessionType>("practice");
  const [tournamentName, setTournamentName] = useState("");
  const [shopName, setShopName] = useState(prefs.defaultShop);
  const [laneNote, setLaneNote] = useState("");
  const [oilNote, setOilNote] = useState(prefs.defaultOil || "ハウス");
  const [memo, setMemo] = useState("");
  const [osakaEventId, setOsakaEventId] = useState("");
  const [patternPdfUrl, setPatternPdfUrl] = useState("");
  const [osakaTick, setOsakaTick] = useState(0);
  const [entryMode, setEntryMode] = useState<EntryMode>("total");
  const [games, setGames] = useState<GameDraft[]>([
    blankGame(""),
    blankGame(""),
    blankGame(""),
  ]);

  const defaultBallId = memberBalls[0]?.id ?? "";
  const osakaEvents = useMemo(
    () => listOsakaEventsForPicker({ limit: 100 }),
    [osakaTick],
  );

  const ballName = useMemo(() => {
    const map = new Map(memberAllBalls.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? map.get(id) ?? "—" : "—");
  }, [memberAllBalls]);

  // 攻略AIなどからのディープリンク
  useEffect(() => {
    const ball = searchParams.get("ball");
    const oil = searchParams.get("oil");
    const asTournament = searchParams.get("tournament") === "1";
    const osakaId = searchParams.get("osakaEvent")?.trim() || "";
    if (!ball && !oil && !asTournament && !osakaId) return;
    if (asTournament) setSessionType("tournament");
    if (oil?.trim()) setOilNote(oil.trim());
    if (ball && memberBalls.some((b) => b.id === ball)) {
      setGames((prev) => {
        const next = prev.length ? [...prev] : [blankGame(ball)];
        next[0] = { ...next[0], ballId: ball };
        return next;
      });
    }
    if (osakaId) {
      const ev = findOsakaEvent(osakaId);
      if (ev) applyOsakaEvent(ev);
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, memberBalls, setSearchParams]);

  function applyOsakaEvent(ev: OsakaEvent) {
    setSessionType("tournament");
    setOsakaEventId(ev.id);
    setTournamentName(ev.name);
    setPlayedOn(ev.startDate);
    setShopName(ev.venue || shopName);
    setPatternPdfUrl(ev.patternPdfUrl || "");
    if (ev.patternPdfUrl) {
      setOilNote(`大会オイル: ${ev.name}`);
    }
  }

  const shopSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    if (prefs.defaultShop.trim()) {
      seen.add(prefs.defaultShop.trim());
      list.push(prefs.defaultShop.trim());
    }
    for (const s of memberSessions) {
      const name = s.shopName.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push(name);
      if (list.length >= 6) break;
    }
    return list;
  }, [memberSessions, prefs.defaultShop]);

  const laneSuggestions = useMemo(() => {
    const shop = shopName.trim();
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of memberSessions) {
      const lane = (s.laneNote ?? "").trim();
      if (!lane || seen.has(lane)) continue;
      if (shop && s.shopName.trim() && s.shopName.trim() !== shop) continue;
      seen.add(lane);
      list.push(lane);
      if (list.length >= 8) break;
    }
    return list;
  }, [memberSessions, shopName]);

  const oilSuggestions = useMemo(() => {
    const defaults = ["ハウス", "ショート", "ミディアム", "ロング"];
    const seen = new Set<string>(defaults);
    const list = [...defaults];
    if (prefs.defaultOil.trim() && !seen.has(prefs.defaultOil.trim())) {
      list.unshift(prefs.defaultOil.trim());
      seen.add(prefs.defaultOil.trim());
    }
    for (const s of memberSessions) {
      const name = s.oilNote.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push(name);
      if (list.length >= 8) break;
    }
    return list;
  }, [memberSessions, prefs.defaultOil]);

  const tournamentSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of memberSessions) {
      const name = s.tournamentName.trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      list.push(name);
      if (list.length >= 6) break;
    }
    return list;
  }, [memberSessions]);

  // 初回ボールIDを埋める
  useEffect(() => {
    if (!defaultBallId) return;
    setGames((prev) =>
      prev.map((g) => (g.ballId ? g : { ...g, ballId: defaultBallId })),
    );
  }, [defaultBallId]);

  if (!data || !activeMember) return null;

  function resetForm() {
    setEditingId(null);
    setPlayedOn(today());
    setSessionType("practice");
    setTournamentName("");
    setShopName(prefs.defaultShop);
    setLaneNote("");
    setOilNote(prefs.defaultOil || "ハウス");
    setMemo("");
    setOsakaEventId("");
    setPatternPdfUrl("");
    setEntryMode("total");
    setGames([blankGame(defaultBallId), blankGame(defaultBallId), blankGame(defaultBallId)]);
  }

  function copyLastSession() {
    const last = memberSessions[0];
    if (!last) {
      alert("コピーできる前回記録がありません");
      return;
    }
    setEditingId(null);
    setPlayedOn(today());
    setSessionType(last.sessionType);
    setTournamentName(last.tournamentName);
    setShopName(last.shopName);
    setLaneNote(last.laneNote ?? "");
    setOilNote(last.oilNote || "ハウス");
    setMemo("");
    setOsakaEventId(last.osakaEventId ?? "");
    setPatternPdfUrl(last.patternPdfUrl ?? "");
    setEntryMode("total");
    const activeIds = new Set(memberBalls.map((b) => b.id));
    const copied = last.games.map((g) =>
      blankGame(g.ballId && activeIds.has(g.ballId) ? g.ballId : defaultBallId),
    );
    setGames(
      copied.length
        ? copied
        : [blankGame(defaultBallId), blankGame(defaultBallId), blankGame(defaultBallId)],
    );
  }

  function startEdit(session: ScoreSession) {
    setEditingId(session.id);
    setPlayedOn(session.playedOn);
    setSessionType(session.sessionType);
    setTournamentName(session.tournamentName);
    setShopName(session.shopName);
    setLaneNote(session.laneNote ?? "");
    setOilNote(session.oilNote);
    setMemo(session.memo);
    setOsakaEventId(session.osakaEventId ?? "");
    setPatternPdfUrl(session.patternPdfUrl ?? "");

    const hasFrames = session.games.some((g) => g.frames && g.frames.length > 0);
    setEntryMode(hasFrames ? "frames" : "total");

    const drafts: GameDraft[] = session.games.map((g) => {
      if (g.frames && g.frames.length > 0) {
        return {
          score: String(g.score),
          ballId: g.ballId ?? defaultBallId,
          frames: padFrames(g.frames),
        };
      }
      return {
        score: String(g.score),
        ballId: g.ballId ?? defaultBallId,
        frames: emptyFrames(),
      };
    });
    setGames(drafts.length ? drafts : [blankGame(defaultBallId)]);
  }

  function updateGame(i: number, patch: Partial<GameDraft>) {
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, ...patch } : g)));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!memberBalls.length) {
      alert("先にマイボールを登録してください");
      return;
    }

    const parsed: { score: number; ballId: string; frames?: number[][] }[] = [];

    for (const g of games) {
      if (!g.ballId) {
        // 空ゲームはスキップ判定の後で
      }

      if (entryMode === "total") {
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
      } else {
        const hasAny = g.frames.some((f) => f.length > 0);
        if (!hasAny) continue;
        const score = scoreGameFromFrames(g.frames);
        if (score == null) {
          alert("フレーム入力が途中です。全フレームを埋めるか、合計点モードを使ってください");
          return;
        }
        if (!g.ballId) {
          alert("ボールを選択してください");
          return;
        }
        parsed.push({ score, ballId: g.ballId, frames: g.frames.map((f) => [...f]) });
      }
    }

    if (!parsed.length) {
      alert("少なくとも1ゲーム入力してください");
      return;
    }

    if (!editingId) {
      const sameDay = memberSessions.filter((s) => s.playedOn === playedOn);
      if (sameDay.length > 0) {
        const summary = sameDay
          .map(
            (s) =>
              `${s.sessionType === "practice" ? "練習" : "大会"} ${s.games.map((g) => g.score).join("/")}`,
          )
          .join("、");
        if (
          !confirm(
            `${playedOn} にはすでに記録があります（${summary}）。\n追加で保存しますか？`,
          )
        ) {
          return;
        }
      }
    }

    const sessionId = editingId ?? uid("ses");
    const existingGames = editingId
      ? (memberSessions.find((s) => s.id === editingId)?.games ?? [])
      : [];

    const sessionGames: ScoreGame[] = parsed.map((g, i) => ({
      id: existingGames[i]?.id ?? uid("game"),
      sessionId,
      gameNo: i + 1,
      score: g.score,
      ballId: g.ballId,
      ...(g.frames ? { frames: g.frames } : {}),
    }));

    const session: ScoreSession = {
      id: sessionId,
      groupId: data!.group.id,
      memberId: activeMember!.id,
      playedOn,
      sessionType,
      tournamentName: sessionType === "tournament" ? tournamentName.trim() : "",
      shopName: shopName.trim(),
      laneNote: laneNote.trim(),
      oilNote: oilNote.trim(),
      memo: memo.trim(),
      games: sessionGames,
      osakaEventId: sessionType === "tournament" ? osakaEventId || undefined : undefined,
      patternPdfUrl: sessionType === "tournament" ? patternPdfUrl.trim() || undefined : undefined,
    };
    const wasEditing = Boolean(editingId);
    await upsertSession(session);
    resetForm();
    alert(wasEditing ? "更新しました" : "保存しました");
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>スコア入力</h1>
          <p>
            {activeMember.displayName} の記録。合計点 or フレーム入力。保存先はクラウドです。
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin ? (
            <Link className="btn secondary" to="/admin">
              全員の状況
            </Link>
          ) : null}
          {memberSessions.length > 0 && memberBalls.length > 0 ? (
            <button className="btn secondary" type="button" onClick={copyLastSession}>
              前回をコピー
            </button>
          ) : null}
        </div>
      </div>

      {isAdmin ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <MemberPicker
            members={data.members}
            value={activeMember.id}
            onChange={setActiveMemberId}
            label="登録するメンバー（クラウドへ保存）"
          />
        </div>
      ) : null}

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
          <h3 style={{ marginTop: 0 }}>{editingId ? "記録を更新" : "スコア記録"}</h3>
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
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                list="shop-history"
                placeholder="ラウンドワン○○"
              />
              <datalist id="shop-history">
                {shopSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {shopSuggestions.length > 0 && (
                <div className="suggest-chips">
                  {shopSuggestions.map((s) => (
                    <button key={s} type="button" onClick={() => setShopName(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>レーン（任意）</label>
              <input
                value={laneNote}
                onChange={(e) => setLaneNote(e.target.value)}
                list="lane-history"
                placeholder="12 / 12-13"
              />
              <datalist id="lane-history">
                {laneSuggestions.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {laneSuggestions.length > 0 && (
                <div className="suggest-chips">
                  {laneSuggestions.map((s) => (
                    <button key={s} type="button" onClick={() => setLaneNote(s)}>
                      L{s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sessionType === "tournament" && (
            <>
              <div className="field">
                <label>大会情報から選ぶ</label>
                <select
                  value={osakaEventId}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) {
                      setOsakaEventId("");
                      return;
                    }
                    const ev = findOsakaEvent(id);
                    if (ev) applyOsakaEvent(ev);
                  }}
                >
                  <option value="">手入力する</option>
                  {osakaEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {formatOsakaEventLabel(ev)}
                    </option>
                  ))}
                </select>
                <p style={{ color: "var(--sub)", fontSize: "0.8rem", margin: "6px 0 0" }}>
                  <a href={OSAKA_BOWLING_URL} target="_blank" rel="noreferrer">
                    大阪府大会情報
                  </a>
                  の日程から選べます。オイルパターンPDFがあれば下にURLを残せます。
                </p>
              </div>
              <div className="field">
                <label>大会名</label>
                <input
                  value={tournamentName}
                  onChange={(e) => setTournamentName(e.target.value)}
                  list="tournament-history"
                  placeholder="○○オープン"
                />
                <datalist id="tournament-history">
                  {tournamentSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
                {tournamentSuggestions.length > 0 && (
                  <div className="suggest-chips">
                    {tournamentSuggestions.map((s) => (
                      <button key={s} type="button" onClick={() => setTournamentName(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="field">
                <label>オイルパターンPDF（任意）</label>
                <input
                  value={patternPdfUrl}
                  onChange={(e) => setPatternPdfUrl(e.target.value)}
                  placeholder="https://.../pattern.pdf"
                />
                <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                  {osakaEventId && patternPdfUrl.trim() ? (
                    <button
                      className="btn secondary"
                      type="button"
                      onClick={() => {
                        setEventPatternPdf(osakaEventId, patternPdfUrl.trim());
                        setOsakaTick((n) => n + 1);
                        alert("大会情報キャッシュにパターンを登録しました");
                      }}
                    >
                      大会一覧にパターンを登録
                    </button>
                  ) : null}
                  {patternPdfUrl.trim() ? (
                    <a
                      className="btn secondary"
                      href={patternPdfUrl.trim()}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDFを開く
                    </a>
                  ) : null}
                  {osakaEventId ? (
                    <Link
                      className="btn secondary"
                      to={`/strategy`}
                      onClick={() => {
                        /* strategy reads from cache via same event id selection manually */
                      }}
                    >
                      この大会で攻略AI
                    </Link>
                  ) : null}
                </div>
              </div>
            </>
          )}

          <div className="field">
            <label>オイル条件（任意）</label>
            <input
              value={oilNote}
              onChange={(e) => setOilNote(e.target.value)}
              list="oil-history"
              placeholder="ハウス"
            />
            <datalist id="oil-history">
              {oilSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <div className="suggest-chips">
              {oilSuggestions.map((s) => (
                <button key={s} type="button" onClick={() => setOilNote(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>入力方式</label>
            <div className="tabs" style={{ marginBottom: 0 }}>
              <button
                type="button"
                className={`tab ${entryMode === "total" ? "active" : ""}`}
                onClick={() => setEntryMode("total")}
              >
                合計点のみ
              </button>
              <button
                type="button"
                className={`tab ${entryMode === "frames" ? "active" : ""}`}
                onClick={() => setEntryMode("frames")}
              >
                フレーム入力
              </button>
            </div>
          </div>

          <h3>ゲーム</h3>
          {games.map((g, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div className="game-row">
                {entryMode === "total" ? (
                  <div className="field">
                    <label>G{i + 1}</label>
                    <input
                      inputMode="numeric"
                      placeholder="187"
                      value={g.score}
                      onChange={(e) => updateGame(i, { score: e.target.value })}
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>G{i + 1}</label>
                    <input
                      readOnly
                      value={scoreGameFromFrames(g.frames) ?? ""}
                      placeholder="自動"
                    />
                  </div>
                )}
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
                  onClick={() =>
                    setGames((prev) => [
                      ...prev.slice(0, i + 1),
                      {
                        score: "",
                        ballId: g.ballId || defaultBallId,
                        frames: emptyFrames(),
                      },
                      ...prev.slice(i + 1),
                    ])
                  }
                >
                  複製
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => setGames((prev) => prev.filter((_, idx) => idx !== i))}
                  disabled={games.length <= 1}
                >
                  削除
                </button>
              </div>
              {entryMode === "frames" && (
                <FrameSheet
                  frames={g.frames}
                  onChange={(frames) => updateGame(i, { frames })}
                />
              )}
            </div>
          ))}
          <button
            className="btn secondary"
            type="button"
            onClick={() => setGames((prev) => [...prev, blankGame(defaultBallId)])}
          >
            ＋ ゲーム追加
          </button>

          <div className="field" style={{ marginTop: 12 }}>
            <label>メモ</label>
            <textarea value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          <div className="form-actions">
            {editingId && (
              <button className="btn secondary" type="button" onClick={resetForm}>
                キャンセル
              </button>
            )}
            <button className="btn" type="submit">
              {editingId ? "記録を更新" : "保存"}
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
                <th>店舗 / レーン</th>
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
                  <td style={{ fontSize: "0.88rem", color: "var(--sub)" }}>
                    {s.shopName || "—"}
                    {s.laneNote ? (
                      <>
                        <br />
                        L{s.laneNote}
                      </>
                    ) : null}
                  </td>
                  <td>
                    {s.games.map((g) => g.score).join(" / ")}
                    {s.games.some((g) => g.frames?.length) ? (
                      <div style={{ color: "var(--sub)", fontSize: "0.75rem" }}>フレームあり</div>
                    ) : null}
                  </td>
                  <td>
                    {[...new Set(s.games.map((g) => ballName(g.ballId)))].join(", ")}
                  </td>
                  <td>
                    <div className="form-actions" style={{ margin: 0 }}>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={async () => {
                          const text = formatSessionShareText(
                            s,
                            memberAllBalls,
                            activeMember.displayName,
                          );
                          await navigator.clipboard.writeText(text);
                          alert("結果テキストをコピーしました");
                        }}
                      >
                        共有
                      </button>
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => startEdit(s)}
                      >
                        編集
                      </button>
                      <button
                        className="btn danger"
                        type="button"
                        onClick={() => {
                          if (confirm("この記録を削除しますか？")) void deleteSession(s.id);
                        }}
                      >
                        削除
                      </button>
                    </div>
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
