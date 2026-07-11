export type CatalogBall = {
  id: string;
  brand: string;
  name: string;
  coverName: string;
  coverType: string;
  finish: string;
  coreName: string;
  coreType: string;
  rg: number | null;
  diff: number | null;
  mb: number | null;
  rgClass: string;
  diffClass: string;
  memo: string;
  releaseMonth: string;
  imageUrl: string;
  sourceUrl: string;
};

export type OilPresetId =
  | "house"
  | "short_dry"
  | "medium"
  | "long_heavy"
  | "custom";

export type OilPreset = {
  id: OilPresetId;
  label: string;
  description: string;
  /** 1=短い/ドライ寄り … 5=長い/ヘビー寄り */
  length: number;
  volume: number;
  /** 1=タイト … 5=ワイド */
  shape: number;
};

export const OIL_PRESETS: OilPreset[] = [
  {
    id: "house",
    label: "ハウス（一般）",
    description: "内側多め・外側ドライ。多くのセンターの標準",
    length: 3,
    volume: 3,
    shape: 4,
  },
  {
    id: "short_dry",
    label: "ショート／ドライ",
    description: "短い・量が少ない。手前から反応しやすい球が有利",
    length: 2,
    volume: 2,
    shape: 3,
  },
  {
    id: "medium",
    label: "ミディアム",
    description: "中間的な長さと量。コントロールしやすい球向き",
    length: 3,
    volume: 3,
    shape: 3,
  },
  {
    id: "long_heavy",
    label: "ロング／ヘビー",
    description: "長い・量が多い。後半まで粘る強カバー向き",
    length: 5,
    volume: 5,
    shape: 3,
  },
  {
    id: "custom",
    label: "カスタム",
    description: "長さ・量・形状を自分で指定",
    length: 3,
    volume: 3,
    shape: 3,
  },
];
