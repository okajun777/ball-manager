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

export async function generateStrategyExplanation(input: {
  memberName: string;
  oil: OilPreset;
  note: string;
  focus: PerformanceFocus;
  usePerformance: boolean;
  results: AdviceResult[];
}): Promise<string> {
  const settings = loadLlmSettings();
  if (!settings.apiKey) {
    throw new Error("APIキーが未設定です。設定・共有から登録してください。");
  }

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

  const endpoint = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.6,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
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
