const KEY = "ball-manager-prefs-v1";

export type UserPrefs = {
  defaultShop: string;
  defaultOil: string;
};

const defaults: UserPrefs = {
  defaultShop: "",
  defaultOil: "ハウス",
};

export function loadUserPrefs(): UserPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      defaultShop: typeof parsed.defaultShop === "string" ? parsed.defaultShop : "",
      defaultOil:
        typeof parsed.defaultOil === "string" && parsed.defaultOil.trim()
          ? parsed.defaultOil
          : "ハウス",
    };
  } catch {
    return { ...defaults };
  }
}

export function saveUserPrefs(prefs: UserPrefs) {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      defaultShop: prefs.defaultShop.trim(),
      defaultOil: prefs.defaultOil.trim() || "ハウス",
    }),
  );
}
