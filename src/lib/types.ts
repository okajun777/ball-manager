export type SessionType = "practice" | "tournament";

export type MaintenanceKind =
  | "clean"
  | "polish"
  | "sand"
  | "compound"
  | "factory"
  | "other";

export type MemberGender = "male" | "female" | "other" | "unspecified";
export type MemberHand = "right" | "left" | "unspecified";
export type MemberThrowStyle = "one_hand" | "two_hand" | "unspecified";

export type Member = {
  id: string;
  groupId: string;
  displayName: string;
  isSelf: boolean;
  /** 性別 */
  gender?: MemberGender;
  /** 利き手（投球手）右 / 左 */
  hand?: MemberHand;
  /** 投球スタイル（1ハンド / 2ハンド） */
  throwStyle?: MemberThrowStyle;
  /** 自由メモ（回転多め、スピード遅めなど） */
  profileNote?: string;
};

export const MEMBER_GENDER_LABEL: Record<MemberGender, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
  unspecified: "未設定",
};

export const MEMBER_HAND_LABEL: Record<MemberHand, string> = {
  right: "右投げ",
  left: "左投げ",
  unspecified: "未設定",
};

export const MEMBER_THROW_STYLE_LABEL: Record<MemberThrowStyle, string> = {
  one_hand: "1ハンド",
  two_hand: "2ハンド",
  unspecified: "未設定",
};

export function normalizeMember(m: Member): Member {
  // 旧データ: hand=both は利き手ではなく投球スタイル扱いだった
  const legacyBoth = (m.hand as string | undefined) === "both";
  const hand: MemberHand =
    m.hand === "left" || m.hand === "right" ? m.hand : "unspecified";
  let throwStyle: MemberThrowStyle = m.throwStyle ?? "unspecified";
  if (legacyBoth && throwStyle === "unspecified") throwStyle = "two_hand";

  return {
    ...m,
    gender: m.gender ?? "unspecified",
    hand,
    throwStyle,
    profileNote: m.profileNote ?? "",
  };
}

export function formatMemberProfile(m: Member): string {
  const n = normalizeMember(m);
  const parts = [
    MEMBER_GENDER_LABEL[n.gender!],
    MEMBER_HAND_LABEL[n.hand!],
    MEMBER_THROW_STYLE_LABEL[n.throwStyle!],
  ];
  if (n.profileNote?.trim()) parts.push(n.profileNote.trim());
  return parts.join(" / ");
}

export type Ball = {
  id: string;
  groupId: string;
  memberId: string;
  name: string;
  brand: string;
  weightLb: number | null;
  purchasedOn: string;
  shopName: string;
  drillerName: string;
  drilledOn: string;
  price: number | null;
  layoutNote: string;
  surfaceNote: string;
  memo: string;
  /** true のときバッグから外した扱い（スコア選択・攻略から除外） */
  retired?: boolean;
};

/** 表面メンテ履歴 */
export type SurfaceMaintenance = {
  id: string;
  groupId: string;
  memberId: string;
  ballId: string;
  doneOn: string;
  kind: MaintenanceKind;
  grit: string;
  note: string;
};

/** フレーム投球。例: [[10],[9,1],[8,0],...,[10,10,10]]。未入力ゲームは省略可。 */
export type ScoreGame = {
  id: string;
  sessionId: string;
  gameNo: number;
  score: number;
  ballId: string | null;
  frames?: number[][];
};

export type ScoreSession = {
  id: string;
  groupId: string;
  memberId: string;
  playedOn: string;
  sessionType: SessionType;
  tournamentName: string;
  shopName: string;
  /** レーン番号（例: 12 / 12-13） */
  laneNote: string;
  oilNote: string;
  memo: string;
  games: ScoreGame[];
  /** 大阪府大会情報アプリのイベントID */
  osakaEventId?: string;
  /** 大会オイルパターンPDF URL */
  patternPdfUrl?: string;
};

export type Group = {
  id: string;
  name: string;
  inviteCode: string;
};

export type AppData = {
  group: Group;
  members: Member[];
  balls: Ball[];
  sessions: ScoreSession[];
  maintenances: SurfaceMaintenance[];
  activeMemberId: string;
};

export const MAINTENANCE_KIND_LABEL: Record<MaintenanceKind, string> = {
  clean: "クリーニング",
  polish: "ポリッシュ",
  sand: "サンド",
  compound: "コンパウンド",
  factory: "工場仕上げ相当",
  other: "その他",
};

export function uid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
