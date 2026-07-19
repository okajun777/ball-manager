/** 公開版（GitHub Pages）の入口URL */
export const APP_PUBLIC_URL = "https://okajun777.github.io/ball-manager/";

/** いま開いている場所の入口（ローカルならローカル、公開版なら公開版） */
export function appEntryUrl(): string {
  if (typeof window === "undefined") return APP_PUBLIC_URL;
  const { origin, pathname } = window.location;
  // /ball-manager/settings → /ball-manager/
  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  if (base !== "/" && pathname.startsWith(base.replace(/\/$/, ""))) {
    return `${origin}${base}`;
  }
  return `${origin}/`;
}

/** 管理者画面の入口 */
export function appAdminUrl(base = APP_PUBLIC_URL): string {
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}admin`;
}

/** LINE等に貼る用。外部ブラウザで開かせて古いキャッシュを避ける */
export function appShareUrl(base = APP_PUBLIC_URL): string {
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("openExternalBrowser", "1");
  return url.toString();
}

/** 昔の招待リンク (?invite=) をアドレスから消す */
export function stripLegacyInviteFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

/** Service Worker / Cache Storage を捨てて最新版を取り直す（LINE内ブラウザ向け） */
export async function forceAppUpdate(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* ignore */
  }
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}
