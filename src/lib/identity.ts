/** この端末の利用者（一般ログイン用。データ本体はクラウド） */
const DEVICE_MEMBER_KEY = "ball-manager-device-member-v1";
const ADMIN_PIN_KEY = "ball-manager-admin-pin-v1";
/** 管理画面（/admin）用セッション。タブを閉じると切れる */
const ADMIN_SESSION_KEY = "ball-manager-admin-session-v1";

/** 管理画面でいま編集中のメンバー表示 */
const VIEW_MEMBER_KEY = "ball-manager-view-member-v1";

type ViewMap = Record<string, string>;

function readViewMap(): ViewMap {
  try {
    const raw = localStorage.getItem(VIEW_MEMBER_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ViewMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadViewMemberId(groupId: string): string | null {
  const id = readViewMap()[groupId];
  return id && id.trim() ? id.trim() : null;
}

export function saveViewMemberId(groupId: string, memberId: string) {
  const map = readViewMap();
  map[groupId] = memberId.trim();
  localStorage.setItem(VIEW_MEMBER_KEY, JSON.stringify(map));
}

export function loadDeviceMemberId(): string | null {
  try {
    const v = localStorage.getItem(DEVICE_MEMBER_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function saveDeviceMemberId(memberId: string) {
  localStorage.setItem(DEVICE_MEMBER_KEY, memberId.trim());
}

export function clearDeviceMemberId() {
  try {
    localStorage.removeItem(DEVICE_MEMBER_KEY);
  } catch {
    /* ignore */
  }
}

/** グループ内の isSelf メンバー＝管理者（淳司） */
export function findAdminMemberId(
  members: { id: string; isSelf: boolean }[],
): string | null {
  return members.find((m) => m.isSelf)?.id ?? null;
}

export function hasAdminPin(): boolean {
  try {
    return Boolean(localStorage.getItem(ADMIN_PIN_KEY)?.trim());
  } catch {
    return false;
  }
}

export function saveAdminPin(pin: string) {
  const p = pin.trim();
  if (!/^\d{4}$/.test(p)) throw new Error("4桁の数字にしてください");
  localStorage.setItem(ADMIN_PIN_KEY, p);
}

export function verifyAdminPin(pin: string): boolean {
  try {
    const saved = localStorage.getItem(ADMIN_PIN_KEY)?.trim();
    if (!saved) return false;
    return saved === pin.trim();
  } catch {
    return false;
  }
}

export function loadAdminSession(): boolean {
  try {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAdminSession() {
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
}

export function clearAdminSession() {
  try {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
