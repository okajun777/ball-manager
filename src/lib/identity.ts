/** 旧端末利用者キーの掃除用。表示メンバーは AppData.activeMemberId（クラウド同期）を使う。 */
const DEVICE_MEMBER_KEY = "ball-manager-device-member-v1";

export function clearDeviceMemberId() {
  try {
    localStorage.removeItem(DEVICE_MEMBER_KEY);
  } catch {
    /* ignore */
  }
}

/** グループ内の isSelf メンバー（代表） */
export function findAdminMemberId(
  members: { id: string; isSelf: boolean }[],
): string | null {
  return members.find((m) => m.isSelf)?.id ?? null;
}
