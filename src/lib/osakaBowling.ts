import scheduleData from "../data/osakaSchedule.json";

/** 大阪府ボウリング大会情報アプリ */
export const OSAKA_BOWLING_URL = "https://osaka-bowling.web.app/";

const CACHE_KEY = "ball-manager-osaka-events-v1";

export type OsakaEvent = {
  id: string;
  startDate: string;
  endDate: string;
  name: string;
  venue: string;
  hostType: string;
  categoryIds?: string[];
  mainTournaments?: string;
  /** オイルパターンPDF（大会情報で公開されたら入る） */
  patternPdfUrl: string;
  detailPdfUrl?: string;
};

type ScheduleFile = {
  source: string;
  updatedAt: string;
  events: OsakaEvent[];
};

function seedEvents(): OsakaEvent[] {
  const data = scheduleData as ScheduleFile;
  return (data.events ?? []).map((e) => ({
    ...e,
    patternPdfUrl: e.patternPdfUrl ?? "",
    detailPdfUrl: e.detailPdfUrl ?? "",
  }));
}

function loadOverrides(): Record<string, Partial<OsakaEvent>> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<OsakaEvent>>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveOverrides(map: Record<string, Partial<OsakaEvent>>) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(map));
}

/** シード日程 + 端末に保存したオイルPDF等の上書き */
export function listOsakaEvents(): OsakaEvent[] {
  const overrides = loadOverrides();
  const byId = new Map<string, OsakaEvent>();
  for (const e of seedEvents()) {
    const o = overrides[e.id];
    byId.set(e.id, o ? { ...e, ...o, id: e.id } : e);
  }
  // 上書きだけで追加されたイベント（ディープリンク等）
  for (const [id, o] of Object.entries(overrides)) {
    if (byId.has(id)) continue;
    if (!o.name || !o.startDate) continue;
    byId.set(id, {
      id,
      startDate: o.startDate,
      endDate: o.endDate || o.startDate,
      name: o.name,
      venue: o.venue || "",
      hostType: o.hostType || "osaka",
      patternPdfUrl: o.patternPdfUrl || "",
      detailPdfUrl: o.detailPdfUrl || "",
      mainTournaments: o.mainTournaments || "",
    });
  }
  return [...byId.values()].sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export function eventsWithOilPattern(): OsakaEvent[] {
  return listOsakaEvents().filter((e) => Boolean(e.patternPdfUrl?.trim()));
}

export function upsertOsakaEvent(patch: Partial<OsakaEvent> & { id: string }) {
  const map = loadOverrides();
  map[patch.id] = { ...(map[patch.id] ?? {}), ...patch };
  saveOverrides(map);
}

export function setEventPatternPdf(eventId: string, patternPdfUrl: string) {
  upsertOsakaEvent({ id: eventId, patternPdfUrl: patternPdfUrl.trim() });
}

export function findOsakaEvent(id: string): OsakaEvent | undefined {
  return listOsakaEvents().find((e) => e.id === id);
}

/** 直近・これから（大阪主催優先） */
export function listOsakaEventsForPicker(opts?: {
  onlyWithPattern?: boolean;
  hostOsakaOnly?: boolean;
  limit?: number;
}): OsakaEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  let list = listOsakaEvents();
  if (opts?.hostOsakaOnly) list = list.filter((e) => e.hostType === "osaka");
  if (opts?.onlyWithPattern) list = list.filter((e) => Boolean(e.patternPdfUrl?.trim()));

  // 日程一覧は直近90日〜未来。パターンありは全件（新しい順）
  if (!opts?.onlyWithPattern) {
    const past = new Date();
    past.setDate(past.getDate() - 90);
    const pastKey = past.toISOString().slice(0, 10);
    list = list.filter((e) => e.endDate >= pastKey || e.startDate >= pastKey);
  }

  list.sort((a, b) => {
    const aFuture = a.startDate >= today ? 0 : 1;
    const bFuture = b.startDate >= today ? 0 : 1;
    if (aFuture !== bFuture) return aFuture - bFuture;
    return aFuture === 0
      ? a.startDate.localeCompare(b.startDate)
      : b.startDate.localeCompare(a.startDate);
  });

  return list.slice(0, opts?.limit ?? 80);
}

export type OsakaDeepLink = {
  name: string;
  date: string;
  venue: string;
  patternPdf: string;
  detailPdf: string;
  goto: "strategy" | "scores" | "";
};

/** Ball Manager の ?osaka=1&name=... を解釈してキャッシュへ保存 */
export function consumeOsakaDeepLink(search: string): OsakaDeepLink | null {
  const q = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  if (q.get("osaka") !== "1" && !q.get("patternPdf") && !q.get("osakaName")) return null;

  const name = (q.get("name") || q.get("osakaName") || "").trim();
  const date = (q.get("date") || q.get("osakaDate") || "").trim();
  const venue = (q.get("venue") || q.get("osakaVenue") || "").trim();
  const patternPdf = (q.get("patternPdf") || "").trim();
  const detailPdf = (q.get("detailPdf") || "").trim();
  const gotoRaw = (q.get("goto") || "").trim();
  const goto = gotoRaw === "strategy" || gotoRaw === "scores" ? gotoRaw : "";

  if (!name && !patternPdf) return null;

  const id =
    q.get("id")?.trim() ||
    `osaka-link-${date || "nodate"}-${Math.abs(hashStr(name || patternPdf)) % 10_000_000}`;

  upsertOsakaEvent({
    id,
    name: name || "大会（大会情報から）",
    startDate: date || new Date().toISOString().slice(0, 10),
    endDate: date || new Date().toISOString().slice(0, 10),
    venue,
    hostType: "osaka",
    patternPdfUrl: patternPdf,
    detailPdfUrl: detailPdf,
  });

  return { name: name || "大会（大会情報から）", date, venue, patternPdf, detailPdf, goto };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function formatOsakaEventLabel(e: OsakaEvent): string {
  const oil = e.patternPdfUrl?.trim() ? " · オイルあり" : "";
  return `${e.startDate} ${e.name}${e.venue ? `（${e.venue}）` : ""}${oil}`;
}

/** OBF 直リンクは CORS 不可。ビルド時ミラー or 開発プロキシ経由のURLを返す */
export function patternFetchCandidates(remotePdfUrl: string): string[] {
  const remote = remotePdfUrl.trim();
  if (!remote) return [];
  const slugMatch = remote.match(/\/Tournament\/\d+\/([^/]+)\/pattern\.pdf/i);
  const slug = slugMatch?.[1];
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const out: string[] = [];
  if (slug) {
    out.push(`${base}osaka-patterns/${slug}.pdf`);
  }
  // Vite dev proxy
  if (import.meta.env.DEV) {
    try {
      const u = new URL(remote);
      if (u.hostname.includes("obf-bowling.net")) {
        out.push(`/obf-proxy${u.pathname}`);
      }
    } catch {
      /* ignore */
    }
  }
  out.push(remote);
  return [...new Set(out)];
}
