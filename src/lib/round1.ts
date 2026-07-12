/** ROUND1 プロショップ商品ビューア（GitHub Pages） */
export const ROUND1_VIEWER_URL = "https://okajun777.github.io/round1-proshop-viewer/";

/** ラウンドワン連携の既定入口（混雑状況） */
export const ROUND1_QUEUE_URL = `${ROUND1_VIEWER_URL}queue.html`;
export const ROUND1_QUEUE_JSON_URL = `${ROUND1_VIEWER_URL}queue.json`;
/** @deprecated 入口は ROUND1_QUEUE_URL を使う。商品一覧が必要なときのみ */
export const ROUND1_HOME_URL = ROUND1_QUEUE_URL;

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

export type Round1StoreWaitPatch = Pick<
  Round1QueueStore,
  "ok" | "available" | "wait_time" | "wait_group_num" | "update_time" | "detail"
>;

/**
 * 指定店舗だけの最新待ち時間を取得する。
 * ブラウザから公式APIは呼べないため、ページ内容経由で読む。
 */
export async function fetchRound1StoreWait(storeId: string): Promise<Round1StoreWaitPatch> {
  const page =
    "https://www.round1.co.jp/yoyaku/queue/bowling/index.php" +
    `?service_department_id=1&store_id=${encodeURIComponent(storeId)}`;
  const res = await fetch(`https://r.jina.ai/${page}`, {
    headers: { Accept: "text/plain" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`店舗の混雑を取得できません (${res.status})`);
  const text = await res.text();

  const timeMatch = text.match(/(\d{1,2}:\d{2})/);
  const update_time = timeMatch?.[1] ?? null;

  if (text.includes("営業時間外") || /ご利用できません/.test(text)) {
    const detailMatch = text.match(/営業時間外[^\n。]*。?/);
    return {
      ok: true,
      available: false,
      wait_time: null,
      wait_group_num: null,
      update_time,
      detail: detailMatch?.[0] ?? "ご利用できません",
    };
  }

  const groupMatch = text.match(/順番待ち組数\s*(\d+)\s*組/);
  const waitMatch = text.match(/待ち時間目安\s*約\s*(\d+)\s*分/);
  if (groupMatch && waitMatch) {
    return {
      ok: true,
      available: true,
      wait_time: Number(waitMatch[1]),
      wait_group_num: Number(groupMatch[1]),
      update_time,
      detail: null,
    };
  }

  if (text.includes("待ち時間はございません")) {
    return {
      ok: true,
      available: true,
      wait_time: 0,
      wait_group_num: 0,
      update_time,
      detail: null,
    };
  }

  throw new Error("混雑状況を読み取れませんでした");
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
