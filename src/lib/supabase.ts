import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_STORAGE = "ball-manager-supabase-url";
const KEY_STORAGE = "ball-manager-supabase-anon";

export type SupabaseSettings = {
  url: string;
  anonKey: string;
};

function envUrl(): string {
  return String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
}

function envKey(): string {
  return String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
}

/** 設定画面の保存値を優先。なければビルド時の VITE_* */
export function loadSupabaseSettings(): SupabaseSettings {
  const storedUrl = localStorage.getItem(URL_STORAGE);
  const storedKey = localStorage.getItem(KEY_STORAGE);
  return {
    url: (storedUrl !== null ? storedUrl : envUrl()).trim(),
    anonKey: (storedKey !== null ? storedKey : envKey()).trim(),
  };
}

export function saveSupabaseSettings(settings: SupabaseSettings) {
  localStorage.setItem(URL_STORAGE, settings.url.trim());
  localStorage.setItem(KEY_STORAGE, settings.anonKey.trim());
  resetSupabaseClient();
}

export function clearSupabaseSettings() {
  localStorage.removeItem(URL_STORAGE);
  localStorage.removeItem(KEY_STORAGE);
  resetSupabaseClient();
}

export function isSupabaseConfigured(): boolean {
  const s = loadSupabaseSettings();
  return Boolean(s.url && s.anonKey);
}

let client: SupabaseClient | null = null;
let clientStamp = "";

function resetSupabaseClient() {
  client = null;
  clientStamp = "";
}

export function getSupabase(): SupabaseClient | null {
  const s = loadSupabaseSettings();
  if (!s.url || !s.anonKey) return null;
  const stamp = `${s.url}::${s.anonKey}`;
  if (!client || clientStamp !== stamp) {
    client = createClient(s.url, s.anonKey);
    clientStamp = stamp;
  }
  return client;
}

/** @deprecated getSupabase() を使ってください */
export const supabase = null as SupabaseClient | null;
