/** この端末の利用者（ローカルのみ。共有データには載せない） */
const DEVICE_MEMBER_KEY = "ball-manager-device-member-v1";
const ADMIN_PIN_KEY = "ball-manager-admin-pin-v1";

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
  localStorage.removeItem(DEVICE_MEMBER_KEY);
}

/** 管理者 = グループ内の isSelf メンバー（淳司） */
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
  if (!/^\d{4}$/.test(p)) throw new Error("PINは4桁の数字にしてください");
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
