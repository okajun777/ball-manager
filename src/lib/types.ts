export type SessionType = "practice" | "tournament";

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
};

export type ScoreGame = {
  id: string;
  sessionId: string;
  gameNo: number;
  score: number;
  ballId: string | null;
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
  activeMemberId: string;
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
