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

/** 家族に送る用。公開版URL＋招待コード */
export function appInviteUrl(inviteCode: string, base = APP_PUBLIC_URL): string {
  const url = new URL(base.endsWith("/") ? base : `${base}/`);
  url.searchParams.set("invite", inviteCode.trim());
  return url.toString();
}

export function readInviteFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const code = new URLSearchParams(window.location.search).get("invite");
  return code?.trim() || null;
}

export function clearInviteFromLocation() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("invite")) return;
  url.searchParams.delete("invite");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
