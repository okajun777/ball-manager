export type SessionType = "practice" | "tournament";

export type MaintenanceKind =
  | "clean"
  | "polish"
  | "sand"
  | "compound"
  | "factory"
  | "other";

export type Member = {
  id: string;
  groupId: string;
  displayName: string;
  isSelf: boolean;
};

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
  oilNote: string;
  memo: string;
  games: ScoreGame[];
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
