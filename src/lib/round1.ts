/** ROUND1 プロショップ商品ビューア（GitHub Pages） */
export const ROUND1_VIEWER_URL = "https://okajun777.github.io/round1-proshop-viewer/";

/** ボウリング混雑一覧（同サイト内） */
export const ROUND1_QUEUE_URL = `${ROUND1_VIEWER_URL}queue.html`;
export const ROUND1_QUEUE_JSON_URL = `${ROUND1_VIEWER_URL}queue.json`;

/** queue.html と共有（同一オリジンの localStorage） */
const FAV_KEY = "round1-queue-favorites";

export type Round1QueueStore = {
  id: string;
  name: string;
  prefecture: string;
  region: string;
  ok: boolean;
  available: boolean | null;
  wait_time: number | null;
  wait_group_num: number | null;
  update_time: string | null;
  detail: string | null;
  queue_url: string;
};

export type Round1QueueData = {
  updated_at: string;
  updated_at_display: string;
  store_count: number;
  waiting_count: number;
  stores: Round1QueueStore[];
};

export function round1SearchUrl(query?: string, category = "ball"): string {
  const url = new URL(ROUND1_VIEWER_URL);
  if (category) url.searchParams.set("cat", category);
  if (query?.trim()) url.searchParams.set("q", query.trim());
  return url.toString();
}

export function loadRound1FavoriteStoreIds(): string[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export async function fetchRound1Queue(): Promise<Round1QueueData> {
  const res = await fetch(ROUND1_QUEUE_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`混雑データを取得できません (${res.status})`);
  return (await res.json()) as Round1QueueData;
}

export function normalizeShopQuery(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ラウンドワン|round\s*1|round1/gi, "")
    .replace(/[\s　・\-ー店]/g, "");
}

/** 設定の「よく使う店舗」から ROUND1 店舗を推定 */
export function matchRound1Store(
  stores: Round1QueueStore[],
  shopName: string,
): Round1QueueStore | null {
  const q = normalizeShopQuery(shopName);
  if (!q) return null;

  const scored = stores
    .map((s) => {
      const name = normalizeShopQuery(s.name);
      if (!name) return { s, score: 0 };
      if (name === q || q === name) return { s, score: 100 };
      if (name.includes(q) || q.includes(name)) return { s, score: 80 };
      return { s, score: 0 };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.s.name.localeCompare(b.s.name, "ja"));

  return scored[0]?.s ?? null;
}

export type WaitLevel = "free" | "light" | "busy" | "off";

export function waitLevelOf(store: Round1QueueStore): WaitLevel {
  if (!store.ok || store.available === false) return "off";
  const t = store.wait_time;
  if (t == null) return "off";
  if (t <= 0) return "free";
  if (t < 30) return "light";
  return "busy";
}

export function formatWait(store: Round1QueueStore): { label: string; detail: string } {
  const lvl = waitLevelOf(store);
  if (lvl === "off") {
    return {
      label: "受付外",
      detail: store.detail ? store.detail.replace(/<[^>]+>/g, "") : "ご利用できません",
    };
  }
  if (lvl === "free") return { label: "待ちなし", detail: "0分" };
  const groups = store.wait_group_num != null ? `${store.wait_group_num}組` : "";
  return {
    label: `約${store.wait_time}分`,
    detail: groups ? `待ち ${groups}` : "待ちあり",
  };
}
