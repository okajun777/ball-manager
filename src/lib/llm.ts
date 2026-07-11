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

export function loadLlmSettings(): LlmSettings {
  return {
    apiKey: localStorage.getItem(KEY_STORAGE) ?? "",
    baseUrl: localStorage.getItem(BASE_STORAGE) || "https://api.openai.com/v1",
    model: localStorage.getItem(MODEL_STORAGE) || "gpt-4o-mini",
  };
}

export function saveLlmSettings(settings: LlmSettings) {
  localStorage.setItem(KEY_STORAGE, settings.apiKey.trim());
  localStorage.setItem(BASE_STORAGE, settings.baseUrl.trim() || "https://api.openai.com/v1");
  localStorage.setItem(MODEL_STORAGE, settings.model.trim() || "gpt-4o-mini");
}

export function isLlmConfigured(): boolean {
  return Boolean(loadLlmSettings().apiKey);
}

async function chatCompletion(messages: unknown[], temperature = 0.4): Promise<string> {
  const settings = loadLlmSettings();
  if (!settings.apiKey) {
    throw new Error("APIキーが未設定です。設定・共有から登録してください。");
  }

  const endpoint = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature,
      messages,
    }),
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

export async function analyzeOilPatternImage(imageDataUrl: string): Promise<OilImageAnalysis> {
  const system = `あなたはボウリングのオイルパターン解析アシスタントです。
画像（パターン図・レーンシート・掲示など）から、攻略用の粗い指標を推定してください。
必ず次のJSONだけを返してください（説明文やコードフェンス禁止）:
{"length":1-5,"volume":1-5,"shape":1-5,"label":"短い名前","summary":"日本語1〜2文","confidence":"high|medium|low"}
length: 1短い〜5長い / volume: 1少ない〜5多い / shape: 1タイト〜5ワイド
読めない場合は自信を下げ、ハウス寄りの中間値を返す。`;

  const content = await chatCompletion(
    [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "この画像のオイル条件を length / volume / shape で推定してください。",
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
  const top = input.results.slice(0, 3);
  const summary = top
    .map((r, i) => {
      const perf = r.performance
        ? `実績平均${r.performance.average}点/${r.performance.games}G`
        : "実績なし";
      return `#${i + 1} ${r.name}（${r.brand || "ブランド不明"}）適合${r.score} / ${perf}\n理由: ${r.reasons.join(" / ")}`;
    })
    .join("\n\n");

  const system = `あなたはボウリングのレーン攻略コーチです。
与えられた選球結果を、日本語で簡潔に解説してください。
・断定しすぎず、調整の余地も書く
・安全面や過度な保証はしない
・300〜500文字程度
・見出しは使わず、読みやすい短段落で`;

  const user = `プレイヤー: ${input.memberName}
オイル: ${input.oil.label}（長さ${input.oil.length}/量${input.oil.volume}/形状${input.oil.shape}）
説明: ${input.oil.description}
メモ: ${input.note || "なし"}
実績参照: ${input.usePerformance ? focusLabel(input.focus) : "なし（スペックのみ）"}

選球結果:
${summary}

上記をもとに、今日の攻め方（推奨ボール、ラインの考え方、合わなかった時の次手）を解説してください。`;

  return chatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    0.6,
  );
}
