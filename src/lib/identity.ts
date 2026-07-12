/** この端末でいま管理・表示しているメンバー（クラウドには載せない） */
const VIEW_MEMBER_KEY = "ball-manager-view-member-v1";

type ViewMap = Record<string, string>;

function readMap(): ViewMap {
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
  const id = readMap()[groupId];
  return id && id.trim() ? id.trim() : null;
}

export function saveViewMemberId(groupId: string, memberId: string) {
  const map = readMap();
  map[groupId] = memberId.trim();
  localStorage.setItem(VIEW_MEMBER_KEY, JSON.stringify(map));
}

/** 旧端末利用者キーの掃除用 */
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
