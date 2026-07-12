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
  /** ポンドに足すオンス（0〜15。例: 15lb 2oz） */
  weightOz?: number | null;
  purchasedOn: string;
  shopName: string;
  drillerName: string;
  drilledOn: string;
  price: number | null;
  layoutNote: string;
  surfaceNote: string;
  memo: string;
  /** カバー名（例: R2S パール） */
  coverName?: string;
  /** カバータイプ（例: パール・リアクティブ） */
  coverType?: string;
  /** コア名 */
  coreName?: string;
  /** コアタイプ（対称／非対称など） */
  coreType?: string;
  /** RG */
  rg?: number | null;
  /** Diff */
  diff?: number | null;
  /** MB / PSA */
  mb?: number | null;
  /** 発売年月（YYYY-MM） */
  releaseMonth?: string;
  /** 大会用の管理記号（シール記号など） */
  manageMark?: string;
  /** 大会管理の有効期限（YYYY-MM-DD） */
  manageExpireOn?: string;
  /** true のときバッグから外した扱い（スコア選択・攻略から除外） */
  retired?: boolean;
};

export function normalizeBall(b: Ball): Ball {
  return {
    ...b,
    brand: b.brand ?? "",
    shopName: b.shopName ?? "",
    drillerName: b.drillerName ?? "",
    layoutNote: b.layoutNote ?? "",
    surfaceNote: b.surfaceNote ?? "",
    memo: b.memo ?? "",
    coverName: b.coverName ?? "",
    coverType: b.coverType ?? "",
    coreName: b.coreName ?? "",
    coreType: b.coreType ?? "",
    rg: b.rg ?? null,
    diff: b.diff ?? null,
    mb: b.mb ?? null,
    weightOz: b.weightOz ?? null,
    releaseMonth: b.releaseMonth ?? "",
    manageMark: b.manageMark ?? "",
    manageExpireOn: b.manageExpireOn ?? "",
    retired: Boolean(b.retired),
  };
}

/** 大会管理の有効期限表示 */
export function manageExpireStatus(expireOn: string | undefined, todayKey: string): {
  label: string;
  tone: "ok" | "soon" | "expired" | "none";
} {
  const d = (expireOn || "").trim();
  if (!d) return { label: "有効期限なし", tone: "none" };
  if (d < todayKey) return { label: `期限切れ ${d}`, tone: "expired" };
  const soon = new Date(todayKey + "T12:00:00");
  soon.setDate(soon.getDate() + 30);
  const soonKey = soon.toISOString().slice(0, 10);
  if (d <= soonKey) return { label: `期限間近 ${d}`, tone: "soon" };
  return { label: `有効期限 ${d}`, tone: "ok" };
}

/** 表示用: 15lb / 15lb 2oz */
export function formatBallWeight(ball: {
  weightLb?: number | null;
  weightOz?: number | null;
}): string {
  if (ball.weightLb == null && (ball.weightOz == null || ball.weightOz === 0)) {
    return "重量—";
  }
  const lb = ball.weightLb != null ? `${ball.weightLb}lb` : "";
  const oz =
    ball.weightOz != null && ball.weightOz > 0 ? `${ball.weightOz}oz` : "";
  return [lb, oz].filter(Boolean).join(" ") || "重量—";
}

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

/** Supabase の uuid 列に載せるため、常に UUID を返す（prefix は互換のため残す） */
export function uid(_prefix = "id"): string {
  return crypto.randomUUID();
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}
