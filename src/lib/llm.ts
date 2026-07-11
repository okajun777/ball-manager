import type { OilPreset } from "./catalogTypes";
import type { AdviceResult, PerformanceFocus } from "./strategy";
import { focusLabel } from "./strategy";

const KEY_STORAGE = "ball-manager-llm-key";
const BASE_STORAGE = "ball-manager-llm-base";
const MODEL_STORAGE = "ball-manager-llm-model";

export type LlmSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type OilImageAnalysis = {
  length: number;
  volume: number;
  shape: number;
  label: string;
  summary: string;
  confidence: "high" | "medium" | "low";
};

function envDefaults(): LlmSettings {
  return {
    apiKey: String(import.meta.env.VITE_LLM_API_KEY ?? "").trim(),
    baseUrl: String(import.meta.env.VITE_LLM_BASE_URL ?? "").trim() || "https://api.openai.com/v1",
    model: String(import.meta.env.VITE_LLM_MODEL ?? "").trim() || "gpt-5.6",
  };
}

/** 共有キー（ビルドの VITE_LLM_*）を優先。なければ端末の保存値 */
export function loadLlmSettings(): LlmSettings {
  const env = envDefaults();
  return {
    apiKey: env.apiKey || localStorage.getItem(KEY_STORAGE) || "",
    baseUrl: env.apiKey ? env.baseUrl : localStorage.getItem(BASE_STORAGE) || env.baseUrl,
    model: env.apiKey ? env.model : localStorage.getItem(MODEL_STORAGE) || env.model,
  };
}

export function saveLlmSettings(settings: LlmSettings) {
  localStorage.setItem(KEY_STORAGE, settings.apiKey.trim());
  localStorage.setItem(BASE_STORAGE, settings.baseUrl.trim() || "https://api.openai.com/v1");
  localStorage.setItem(MODEL_STORAGE, settings.model.trim() || "gpt-5.6");
}

export function isLlmConfigured(): boolean {
  return Boolean(loadLlmSettings().apiKey);
}

export function hasSharedLlmKey(): boolean {
  return Boolean(envDefaults().apiKey);
}

function isGpt5Family(model: string): boolean {
  return /^gpt-5/i.test(model.trim());
}

async function chatCompletion(messages: unknown[], temperature = 0.4): Promise<string> {
  const settings = loadLlmSettings();
  if (!settings.apiKey) {
    throw new Error("APIキーが未設定です。設定・共有から登録してください。");
  }

  const endpoint = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
  };
  if (isGpt5Family(settings.model)) {
    // GPT-5系は max_tokens / 任意temperature 非対応
    body.max_completion_tokens = 4000;
  } else {
    body.temperature = temperature;
    body.max_tokens = 1800;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM APIエラー (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("LLMから空の応答が返りました");
  return content;
}

function clampOil(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(5, Math.max(1, Math.round(v)));
}

/** 画像を縮小して data URL にする（API送信用） */
export async function compressImageForVision(file: File, maxSide = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像の読み込みに失敗しました");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** PDFの先頭ページ（最大2ページ）を1枚のJPEG data URLに変換 */
async function renderPdfForVision(file: File, maxSide = 1280, maxPages = 2): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  if (!doc.numPages) throw new Error("PDFにページがありません");

  const pageCount = Math.min(doc.numPages, maxPages);
  const pages: HTMLCanvasElement[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.2, maxSide / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("PDFの描画に失敗しました");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    pages.push(canvas);
  }

  const width = Math.max(...pages.map((p) => p.width));
  const height = pages.reduce((sum, p) => sum + p.height, 0);
  const fit = Math.min(1, maxSide / Math.max(width, height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(width * fit));
  out.height = Math.max(1, Math.round(height * fit));
  const octx = out.getContext("2d");
  if (!octx) throw new Error("PDFの描画に失敗しました");
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const page of pages) {
    const dw = Math.round(page.width * fit);
    const dh = Math.round(page.height * fit);
    octx.drawImage(page, 0, y, dw, dh);
    y += dh;
  }
  return out.toDataURL("image/jpeg", 0.72);
}

/** 画像またはPDFを Vision API 用の data URL に変換 */
export async function prepareOilPatternFile(file: File): Promise<string> {
  if (isPdfFile(file)) {
    try {
      return await renderPdfForVision(file);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`PDFの読み込みに失敗しました: ${msg}`);
    }
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
    return compressImageForVision(file);
  }
  throw new Error("画像（JPG/PNGなど）またはPDFを選択してください");
}

export async function analyzeOilPatternImage(imageDataUrl: string): Promise<OilImageAnalysis> {
  const system = `あなたはボウリングのオイルパターン解析アシスタントです。
画像（パターン図・レーンシート・PDFの印刷物・掲示など）から、攻略用の粗い指標を推定してください。
必ず次のJSONだけを返してください（説明文やコードフェンス禁止）:
{"length":1-5,"volume":1-5,"shape":1-5,"label":"短い名前","summary":"日本語1〜2文","confidence":"high|medium|low"}
length: 1短い〜5長い / volume: 1少ない〜5多い / shape: 1タイト〜5ワイド
パターン名や距離（ft）が読める場合は label / summary に含める。
読めない場合は自信を下げ、ハウス寄りの中間値を返す。`;

  const content = await chatCompletion(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "このオイルパターン資料（画像またはPDF）の条件を length / volume / shape で推定してください。",
          },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
    0.2,
  );

  const jsonText = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    throw new Error("画像解析の応答を解釈できませんでした。別の画像か手動スライダーを試してください。");
  }

  const confidenceRaw = String(parsed.confidence ?? "medium");
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "low" ? confidenceRaw : "medium";

  return {
    length: clampOil(parsed.length, 3),
    volume: clampOil(parsed.volume, 3),
    shape: clampOil(parsed.shape, 3),
    label: String(parsed.label ?? "画像推定").slice(0, 40),
    summary: String(parsed.summary ?? "").slice(0, 200),
    confidence,
  };
}

export async function generateStrategyExplanation(input: {
  memberName: string;
  oil: OilPreset;
  note: string;
  focus: PerformanceFocus;
  usePerformance: boolean;
  results: AdviceResult[];
}): Promise<string> {
  const top = input.results.slice(0, 5);
  const summary = top
    .map((r, i) => {
      const perf = r.performance
        ? [
            `全体平均${r.performance.average}点/${r.performance.games}G`,
            `最高${r.performance.high}`,
            r.performance.recentAverage != null
              ? `直近平均${r.performance.recentAverage}`
              : null,
            r.performance.matchedConditionAverage != null
              ? `同系統条件平均${r.performance.matchedConditionAverage}（${r.performance.matchedConditionGames}G）`
              : null,
          ]
            .filter(Boolean)
            .join(" / ")
        : "実績なし";
      return [
        `#${i + 1} ${r.name}（${r.brand || "ブランド不明"} / ${r.source === "owned" ? "所持" : "カタログ"}）`,
        `適合スコア ${r.score}`,
        `実績: ${perf}`,
        `選出理由: ${r.reasons.join("；")}`,
        `ライン案: ${r.lineHint}`,
        `調整ヒント: ${r.adjustHint}`,
      ].join("\n");
    })
    .join("\n\n");

  const system = `あなたは競技・ハウス両方に詳しいボウリングのレーン攻略コーチです。
与えられた選球結果とオイル条件をもとに、今日の実戦で使える詳しい解説を日本語で書いてください。

必ず次の構成で書いてください（見出しは【】で、各見出しの下に2〜4文）:
【今日のレーンの読み】
オイルの長さ・量・形状がボールの動きにどう効くか。ハウスとの違いがあれば触れる。
【第一候補の使い方】
なぜその球が合うか。カバーの効き、スキッド〜フックのイメージ、狙い目（板・ブレイクポイントの考え方）、スピードや回転の調整の目安。
【合わなかったときのサインと次手】
早すぎるフック／足りないフック／乾きすぎなど、観察ポイントと、第2・第3候補への切り替え判断。
【ゲームの進め方】
序盤・中盤・終盤（レーン変化）でのボール・ラインの変え方。スペアの注意があれば一言。
【注意】
断定しすぎない。個人差・ドリル・表面状態で変わる旨を短く。過度な保証はしない。

分量の目安は800〜1400文字。箇条書きは最小限。絵文字や英語の長い専門用語の羅列は避ける。`;

  const user = `プレイヤー: ${input.memberName}
オイル: ${input.oil.label}（長さ${input.oil.length}/5・量${input.oil.volume}/5・形状${input.oil.shape}/5）
オイル説明: ${input.oil.description}
メモ: ${input.note || "なし"}
実績参照: ${input.usePerformance ? focusLabel(input.focus) : "なし（スペックのみ）"}

選球結果（上位）:
${summary}

上記をもとに、今日の攻め方を詳しく解説してください。`;

  return chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    0.55,
  );
}
