import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import catalogBalls from "../data/catalogBalls.json";
import { OIL_PRESETS, type CatalogBall, type OilPresetId } from "../lib/catalogTypes";
import {
  analyzeOilPatternImage,
  generateStrategyExplanation,
  isLlmConfigured,
  loadCachedOilAnalysis,
  prepareOilPatternFile,
  prepareOilPatternFromUrlCandidates,
  saveCachedOilAnalysis,
  type OilImageAnalysis,
} from "../lib/llm";
import {
  OSAKA_BOWLING_URL,
  findOsakaEvent,
  formatOsakaEventLabel,
  listOsakaEventsForPicker,
  patternFetchCandidates,
  setEventPatternPdf,
  type OsakaEvent,
} from "../lib/osakaBowling";
import { adviseBalls, focusLabel, type PerformanceFocus } from "../lib/strategy";
import { useStore } from "../lib/store";
import { MEMBER_HAND_LABEL } from "../lib/types";

const catalog = catalogBalls as CatalogBall[];

export function Strategy() {
  const { activeMember, memberBalls, memberSessions } = useStore();
  const [presetId, setPresetId] = useState<OilPresetId>("house");
  const [length, setLength] = useState(3);
  const [volume, setVolume] = useState(3);
  const [shape, setShape] = useState(4);
  const [note, setNote] = useState("");
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [usePerformance, setUsePerformance] = useState(true);
  const [performanceFocus, setPerformanceFocus] = useState<PerformanceFocus>("practice");
  const [ran, setRan] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [oilPreview, setOilPreview] = useState("");
  const [oilAnalysis, setOilAnalysis] = useState<OilImageAnalysis | null>(null);
  const [oilScanLoading, setOilScanLoading] = useState(false);
  const [oilScanError, setOilScanError] = useState("");
  const [osakaEventId, setOsakaEventId] = useState("");
  const [patternPdfDraft, setPatternPdfDraft] = useState("");
  const [osakaTick, setOsakaTick] = useState(0);
  const oilScanGen = useRef(0);
  const llmReady = isLlmConfigured();

  const osakaWithOil = useMemo(
    () => listOsakaEventsForPicker({ onlyWithPattern: true, limit: 80 }),
    [osakaTick],
  );
  const selectedOsaka = osakaEventId ? findOsakaEvent(osakaEventId) : undefined;

  const oil = useMemo(() => {
    const base = OIL_PRESETS.find((p) => p.id === presetId) ?? OIL_PRESETS[0];
    if (presetId !== "custom") return base;
    return {
      ...base,
      length,
      volume,
      shape,
      description: oilAnalysis?.summary || base.description,
      label: oilAnalysis?.label ? `画像: ${oilAnalysis.label}` : base.label,
    };
  }, [presetId, length, volume, shape, oilAnalysis]);

  const results = useMemo(() => {
    if (!ran) return [];
    return adviseBalls({
      owned: memberBalls,
      catalog,
      oil,
      ownedOnly,
      note,
      sessions: memberSessions,
      performanceFocus,
      usePerformance,
      hand: activeMember?.hand,
    });
  }, [
    ran,
    memberBalls,
    oil,
    ownedOnly,
    note,
    memberSessions,
    performanceFocus,
    usePerformance,
    activeMember?.hand,
  ]);

  function resetAdvice() {
    setRan(false);
    setAiText("");
    setAiError("");
  }

  function applyOilAnalysis(result: OilImageAnalysis, previewDataUrl?: string) {
    setOilAnalysis(result);
    setPresetId("custom");
    setLength(result.length);
    setVolume(result.volume);
    setShape(result.shape);
    if (previewDataUrl) {
      setOilPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return previewDataUrl;
      });
    }
    resetAdvice();
  }

  async function analyzePatternPdfUrl(remoteUrl: string) {
    const gen = ++oilScanGen.current;
    setOilScanError("");
    const cached = loadCachedOilAnalysis(remoteUrl);
    if (cached) {
      applyOilAnalysis(cached);
      return;
    }
    if (!isLlmConfigured()) {
      setOilScanError(
        "パターンPDFの自動読取には共有APIキーが必要です。未設定の場合はスライダーで手動指定してください。",
      );
      setPresetId("custom");
      resetAdvice();
      return;
    }
    setOilScanLoading(true);
    try {
      const dataUrl = await prepareOilPatternFromUrlCandidates(patternFetchCandidates(remoteUrl));
      if (gen !== oilScanGen.current) return;
      const result = await analyzeOilPatternImage(dataUrl);
      if (gen !== oilScanGen.current) return;
      saveCachedOilAnalysis(remoteUrl, result);
      applyOilAnalysis(result, dataUrl);
    } catch (err) {
      if (gen !== oilScanGen.current) return;
      setOilScanError(err instanceof Error ? err.message : "パターンPDFの解析に失敗しました");
      setPresetId("custom");
      resetAdvice();
    } finally {
      if (gen === oilScanGen.current) setOilScanLoading(false);
    }
  }

  function applyOsakaEvent(ev: OsakaEvent | undefined) {
    if (!ev) {
      setOsakaEventId("");
      return;
    }
    setOsakaEventId(ev.id);
    setPatternPdfDraft(ev.patternPdfUrl || "");
    const oilLabel = ev.patternPdfUrl ? `オイルパターンあり` : "オイル未公開";
    setNote(
      [
        `【大会情報】${ev.name}`,
        ev.venue ? `会場: ${ev.venue}` : "",
        `日程: ${ev.startDate}${ev.endDate !== ev.startDate ? `〜${ev.endDate}` : ""}`,
        oilLabel,
      ]
        .filter(Boolean)
        .join(" / "),
    );
    setPerformanceFocus("tournament");
    resetAdvice();
    if (ev.patternPdfUrl) {
      setPresetId("custom");
      void analyzePatternPdfUrl(ev.patternPdfUrl);
    }
  }

  function savePatternUrlToEvent() {
    if (!osakaEventId || !patternPdfDraft.trim()) return;
    setEventPatternPdf(osakaEventId, patternPdfDraft.trim());
    setOsakaTick((n) => n + 1);
    const ev = findOsakaEvent(osakaEventId);
    if (ev) applyOsakaEvent({ ...ev, patternPdfUrl: patternPdfDraft.trim() });
    alert("この大会にオイルパターンPDFを登録しました。次回から「パターンあり」で選べます。");
  }

  function onPresetChange(id: OilPresetId) {
    setPresetId(id);
    const p = OIL_PRESETS.find((x) => x.id === id);
    if (p && id !== "custom") {
      setLength(p.length);
      setVolume(p.volume);
      setShape(p.shape);
      setOilAnalysis(null);
    }
    resetAdvice();
  }

  async function onOilImage(file: File | null) {
    if (!file) return;
    setOilScanError("");
    setOilAnalysis(null);
    try {
      if (!isLlmConfigured()) {
        setOilScanError(
          "画像・PDFの自動読取には共有APIキーが必要です。未設定の場合はスライダーで手動指定してください。",
        );
        setPresetId("custom");
        resetAdvice();
        return;
      }
      setOilScanLoading(true);
      const dataUrl = await prepareOilPatternFile(file);
      setOilPreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return dataUrl;
      });
      const result = await analyzeOilPatternImage(dataUrl);
      setOilAnalysis(result);
      setPresetId("custom");
      setLength(result.length);
      setVolume(result.volume);
      setShape(result.shape);
      if (result.label && !note.trim()) {
        setNote(result.label);
      }
      resetAdvice();
    } catch (err) {
      setOilScanError(err instanceof Error ? err.message : "パターン資料の解析に失敗しました");
    } finally {
      setOilScanLoading(false);
    }
  }

  async function onGenerateAi() {
    if (!results.length || !activeMember) return;
    setAiLoading(true);
    setAiError("");
    try {
      const text = await generateStrategyExplanation({
        memberName: activeMember.displayName,
        member: activeMember,
        oil,
        note,
        focus: performanceFocus,
        usePerformance,
        results,
      });
      setAiText(text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI解説の生成に失敗しました");
    } finally {
      setAiLoading(false);
    }
  }

  const scoredGames = memberSessions.reduce((n, s) => n + s.games.length, 0);
  const slidersEnabled = presetId === "custom";

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>攻略AI</h1>
          <p>
            オイル条件 ＋ 自分の過去スコアで、おすすめボールを提案します
            {activeMember
              ? `（${activeMember.displayName}${
                  activeMember.hand && activeMember.hand !== "unspecified"
                    ? `・${MEMBER_HAND_LABEL[activeMember.hand]}`
                    : ""
                }）`
              : ""}
          </p>
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>オイルパターン</h3>

          <div className="field">
            <label>大会情報から選ぶ（大阪府ボウリング大会情報）</label>
            <select
              value={osakaEventId}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) {
                  setOsakaEventId("");
                  return;
                }
                applyOsakaEvent(findOsakaEvent(id));
              }}
            >
              <option value="">選択しない</option>
              {osakaWithOil.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {formatOsakaEventLabel(ev)}
                </option>
              ))}
            </select>
          </div>

          {osakaEventId ? (
            <div className="field">
              <label>オイルパターンPDFのURL</label>
              <input
                value={patternPdfDraft}
                onChange={(e) => setPatternPdfDraft(e.target.value)}
                placeholder="https://.../pattern.pdf"
              />
              <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                <button className="btn secondary" type="button" onClick={savePatternUrlToEvent}>
                  この大会にパターンを登録
                </button>
                {patternPdfDraft.trim() ? (
                  <a
                    className="btn secondary"
                    href={patternPdfDraft.trim()}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDFを開く
                  </a>
                ) : null}
                <a className="btn secondary" href={OSAKA_BOWLING_URL} target="_blank" rel="noreferrer">
                  大会情報を開く
                </a>
              </div>
            </div>
          ) : (
            <p style={{ marginTop: 0 }}>
              <a className="btn secondary" href={OSAKA_BOWLING_URL} target="_blank" rel="noreferrer">
                大会情報アプリを開く
              </a>
            </p>
          )}

          {selectedOsaka?.patternPdfUrl ? (
            <p style={{ color: "var(--good)", fontSize: "0.88rem" }}>
              選択中: {selectedOsaka.name}
              {oilScanLoading
                ? "（パターンPDFを読み取り中…）"
                : oilAnalysis
                  ? "（レーン条件を反映済み）"
                  : "（オイルパターン登録済み）"}
            </p>
          ) : null}

          <div className="field">
            <label>プリセット</label>
            <select
              value={presetId}
              onChange={(e) => onPresetChange(e.target.value as OilPresetId)}
            >
              {OIL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginTop: 0 }}>
            {oil.description}
          </p>

          <div className="field">
            <label>パターン画像 / PDF から読取（任意）</label>
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              onChange={(e) => void onOilImage(e.target.files?.[0] ?? null)}
            />
            <p style={{ color: "var(--sub)", fontSize: "0.8rem", margin: "6px 0 0" }}>
              レーンシート・パターン図の画像またはPDF → 長さ・量・形状を推定（要APIキー）
            </p>
          </div>
          {oilPreview && (
            <img
              src={oilPreview}
              alt="オイルパターン"
              style={{
                width: "100%",
                maxHeight: 180,
                objectFit: "contain",
                borderRadius: 10,
                border: "1px solid var(--line)",
                marginBottom: 10,
                background: "#fff",
              }}
            />
          )}
          {oilScanLoading && (
            <p style={{ color: "var(--sub)", fontSize: "0.88rem" }}>パターン資料を解析中…</p>
          )}
          {oilScanError && (
            <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{oilScanError}</p>
          )}
          {oilAnalysis && (
            <p style={{ color: "var(--good)", fontSize: "0.88rem" }}>
              推定: {oilAnalysis.label}（信頼度 {oilAnalysis.confidence}
              ）→ カスタムに反映済み。スライダーで微調整できます。
            </p>
          )}

          <div className="field">
            <label>長さ（短い ← → 長い）: {length}</label>
            <input
              type="range"
              min={1}
              max={5}
              value={length}
              disabled={!slidersEnabled}
              onChange={(e) => {
                setLength(Number(e.target.value));
                resetAdvice();
              }}
            />
          </div>
          <div className="field">
            <label>オイル量（少ない ← → 多い）: {volume}</label>
            <input
              type="range"
              min={1}
              max={5}
              value={volume}
              disabled={!slidersEnabled}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                resetAdvice();
              }}
            />
          </div>
          <div className="field">
            <label>形状（タイト ← → ワイド）: {shape}</label>
            <input
              type="range"
              min={1}
              max={5}
              value={shape}
              disabled={!slidersEnabled}
              onChange={(e) => {
                setShape(Number(e.target.value));
                resetAdvice();
              }}
            />
          </div>

          <div className="field">
            <label>メモ（任意）</label>
            <textarea
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                resetAdvice();
              }}
              placeholder="例: 後半ドライ / スペア多用 / フックを抑えたい"
            />
          </div>

          <div className="field">
            <label>実績の参照</label>
            <select
              value={performanceFocus}
              onChange={(e) => {
                setPerformanceFocus(e.target.value as PerformanceFocus);
                resetAdvice();
              }}
              disabled={!usePerformance}
            >
              <option value="practice">練習スコアを重視</option>
              <option value="tournament">大会スコアを重視</option>
              <option value="all">練習＋大会</option>
            </select>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={usePerformance}
              onChange={(e) => {
                setUsePerformance(e.target.checked);
                resetAdvice();
              }}
            />
            過去スコアを加味する（推奨）
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={ownedOnly}
              onChange={(e) => {
                setOwnedOnly(e.target.checked);
                resetAdvice();
              }}
            />
            所持ボールのみから選ぶ（推奨）
          </label>

          <p style={{ color: "var(--sub)", fontSize: "0.8rem", marginTop: 0 }}>
            実績データ: {scoredGames} ゲーム
            {scoredGames < 6 ? "（まだ少ないのでスペック比重が大きめ）" : ""}
          </p>

          {!memberBalls.length && ownedOnly ? (
            <div className="empty">
              マイボールがありません。
              <div style={{ marginTop: 8 }}>
                <Link className="btn" to="/balls">
                  マイボール登録
                </Link>{" "}
                <Link className="btn secondary" to="/catalog">
                  カタログから追加
                </Link>
              </div>
            </div>
          ) : (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setAiText("");
                setAiError("");
                setRan(true);
              }}
            >
              攻略する（{activeMember?.displayName}）
            </button>
          )}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>提案結果</h3>
          {!ran ? (
            <div className="empty">条件を選んで「攻略する」を押してください</div>
          ) : !results.length ? (
            <div className="empty">候補がありません</div>
          ) : (
            <>
              <p style={{ color: "var(--sub)", fontSize: "0.88rem" }}>
                パターン: <strong>{oil.label}</strong>
                {" · "}
                長さ{oil.length} / 量{oil.volume} / 形状{oil.shape}
                {usePerformance
                  ? ` · 実績: ${focusLabel(performanceFocus)}`
                  : " · 実績なし（スペックのみ）"}
              </p>
              <div style={{ display: "grid", gap: 12 }}>
                {results.map((r, i) => (
                  <div
                    key={`${r.ballId}-${i}`}
                    style={{
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      padding: 12,
                      background: i === 0 ? "var(--accent-soft)" : "#fff",
                    }}
                  >
                    <div style={{ fontSize: "0.75rem", color: "var(--sub)" }}>
                      #{i + 1} {r.source === "owned" ? "所持" : "カタログ"} · 適合 {r.score}
                      {r.performance
                        ? ` · 平均 ${r.performance.average}（${r.performance.games}G）`
                        : ""}
                    </div>
                    <div className="ball-title">
                      {r.name}
                      {r.brand ? ` / ${r.brand}` : ""}
                    </div>
                    <ul style={{ margin: "8px 0", paddingLeft: 18, fontSize: "0.9rem" }}>
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    {i === 0 && (
                      <>
                        <p style={{ margin: "8px 0 4px", fontSize: "0.9rem" }}>
                          <strong>ライン案:</strong> {r.lineHint}
                        </p>
                        <p style={{ margin: "0 0 4px", fontSize: "0.9rem" }}>
                          <strong>具体:</strong> {r.playAdvice.startBoard} ／ {r.playAdvice.targetBoard}{" "}
                          ／ {r.playAdvice.breakpoint}
                        </p>
                        <p style={{ margin: 0, fontSize: "0.9rem" }}>
                          <strong>調整:</strong> {r.adjustHint}
                        </p>
                      </>
                    )}
                    {i > 0 && (
                      <p style={{ margin: "8px 0 0", fontSize: "0.88rem", color: "var(--sub)" }}>
                        {r.playAdvice.startBoard} ／ {r.playAdvice.targetBoard}
                      </p>
                    )}
                    {r.source === "owned" && (
                      <div style={{ marginTop: 10 }}>
                        <Link
                          className="btn secondary"
                          to={`/scores?ball=${encodeURIComponent(r.ballId)}&oil=${encodeURIComponent(oil.label)}`}
                        >
                          この球でスコア入力
                        </Link>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: 16,
                  paddingTop: 14,
                  borderTop: "1px solid var(--line)",
                }}
              >
                <h4 style={{ margin: "0 0 8px" }}>AI解説（任意）</h4>
                <p style={{ color: "var(--sub)", fontSize: "0.85rem", marginTop: 0 }}>
                  レーンの読みに加え、立ち位置・狙い枚目・早い／遅いときの左右寄せまで具体的に出します。
                </p>
                {!llmReady ? (
                  <p style={{ color: "var(--warn)", fontSize: "0.88rem" }}>
                    APIキー未設定のため、ルール提案のみ利用できます。
                  </p>
                ) : (
                  <button
                    className="btn secondary"
                    type="button"
                    disabled={aiLoading}
                    onClick={onGenerateAi}
                  >
                    {aiLoading ? "生成中…" : aiText ? "AI解説を再生成" : "AI解説を生成"}
                  </button>
                )}
                {aiError && (
                  <p style={{ color: "#b42318", fontSize: "0.88rem", marginTop: 10 }}>
                    {aiError}
                  </p>
                )}
                {aiText && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 12,
                      borderRadius: 12,
                      background: "#f7fafc",
                      border: "1px solid var(--line)",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.65,
                      fontSize: "0.92rem",
                    }}
                  >
                    {aiText}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
