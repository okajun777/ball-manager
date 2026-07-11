/** 表面メンテのリマインダー設定（端末内） */

const KEY = "ball-manager-maint-reminder";

export type MaintReminderSettings = {
  enabled: boolean;
  /** 最終メンテから何日で「要メンテ」とみなすか */
  intervalDays: number;
  /** ブラウザ通知を使うか */
  notify: boolean;
};

const DEFAULTS: MaintReminderSettings = {
  enabled: true,
  intervalDays: 30,
  notify: false,
};

export function loadMaintReminderSettings(): MaintReminderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MaintReminderSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveMaintReminderSettings(settings: MaintReminderSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function daysSince(dateStr: string, today = new Date()): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const ms = today.getTime() - d.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export type MaintDueBall = {
  ballId: string;
  name: string;
  brand: string;
  lastDoneOn: string | null;
  days: number | null;
  status: "ok" | "due" | "never";
};

export function buildMaintDueList(input: {
  balls: { id: string; name: string; brand: string }[];
  maintenances: { ballId: string; doneOn: string }[];
  intervalDays: number;
  today?: Date;
}): MaintDueBall[] {
  const lastByBall = new Map<string, string>();
  for (const m of input.maintenances) {
    const prev = lastByBall.get(m.ballId);
    if (!prev || m.doneOn > prev) lastByBall.set(m.ballId, m.doneOn);
  }

  return input.balls
    .map((b) => {
      const last = lastByBall.get(b.id) ?? null;
      const days = last ? daysSince(last, input.today) : null;
      let status: MaintDueBall["status"] = "ok";
      if (!last) status = "never";
      else if (days != null && days >= input.intervalDays) status = "due";
      return {
        ballId: b.id,
        name: b.name,
        brand: b.brand,
        lastDoneOn: last,
        days,
        status,
      };
    })
    .sort((a, b) => {
      const rank = (s: MaintDueBall["status"]) => (s === "due" ? 0 : s === "never" ? 1 : 2);
      return rank(a.status) - rank(b.status) || (b.days ?? 9999) - (a.days ?? 9999);
    });
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function maybeNotifyMaintDue(count: number) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (count <= 0) return;
  const key = `ball-manager-maint-notified-${new Date().toISOString().slice(0, 10)}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  new Notification("Ball Manager", {
    body: `表面メンテが近い／未実施のボールが ${count} 個あります`,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
  });
}
