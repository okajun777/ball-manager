import type { AppData, Ball, Group, Member, ScoreGame, ScoreSession } from "./types";
import { today, uid } from "./types";
import { isSupabaseConfigured, supabase } from "./supabase";

const LOCAL_KEY = "ball-manager-data-v1";

function createDemoData(): AppData {
  const groupId = uid("grp");
  const selfId = uid("mem");
  const familyId = uid("mem");
  const ball1 = uid("ball");
  const ball2 = uid("ball");
  const sessionId = uid("ses");
  const tournamentId = uid("ses");

  const group: Group = {
    id: groupId,
    name: "うちのボウリング部",
    inviteCode: "family01",
  };

  const members: Member[] = [
    { id: selfId, groupId, displayName: "自分", isSelf: true },
    { id: familyId, groupId, displayName: "家族", isSelf: false },
  ];

  const balls: Ball[] = [
    {
      id: ball1,
      groupId,
      memberId: selfId,
      name: "APEX JACKAL",
      brand: "Motiv",
      weightLb: 15,
      purchasedOn: "2026-03-15",
      shopName: "ラウンドワン",
      drillerName: "山田",
      drilledOn: "2026-03-20",
      price: 40810,
      layoutNote: "",
      surfaceNote: "工場仕上げ",
      memo: "",
    },
    {
      id: ball2,
      groupId,
      memberId: selfId,
      name: "EVOKE HYSTERIA",
      brand: "Motiv",
      weightLb: 15,
      purchasedOn: "2026-05-01",
      shopName: "ラウンドワン",
      drillerName: "山田",
      drilledOn: "2026-05-03",
      price: 37895,
      layoutNote: "",
      surfaceNote: "",
      memo: "",
    },
  ];

  const sessions: ScoreSession[] = [
    {
      id: sessionId,
      groupId,
      memberId: selfId,
      playedOn: today(),
      sessionType: "practice",
      tournamentName: "",
      shopName: "ラウンドワン",
      oilNote: "ハウス",
      memo: "デモ: 1ゲーム1ボール",
      games: [
        { id: uid("game"), sessionId, gameNo: 1, score: 187, ballId: ball1 },
        { id: uid("game"), sessionId, gameNo: 2, score: 201, ballId: ball2 },
        { id: uid("game"), sessionId, gameNo: 3, score: 176, ballId: ball1 },
      ],
    },
    {
      id: tournamentId,
      groupId,
      memberId: selfId,
      playedOn: today(),
      sessionType: "tournament",
      tournamentName: "サンプル杯",
      shopName: "ラウンドワン",
      oilNote: "ハウス",
      memo: "デモ大会",
      games: [
        { id: uid("game"), sessionId: tournamentId, gameNo: 1, score: 168, ballId: ball1 },
        { id: uid("game"), sessionId: tournamentId, gameNo: 2, score: 182, ballId: ball2 },
        { id: uid("game"), sessionId: tournamentId, gameNo: 3, score: 159, ballId: ball1 },
      ],
    },
  ];

  return { group, members, balls, sessions, activeMemberId: selfId };
}

function loadLocal(): AppData {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) {
    const demo = createDemoData();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(demo));
    return demo;
  }
  return JSON.parse(raw) as AppData;
}

function saveLocal(data: AppData) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export async function loadAppData(): Promise<AppData> {
  if (!isSupabaseConfigured || !supabase) return loadLocal();

  const { data: groups, error } = await supabase
    .from("groups")
    .select("*")
    .limit(1);
  if (error) throw error;

  if (!groups?.length) {
    // 初回: ローカルデモをベースにクラウドへ作成してもよいが、
    // まずはローカルで使い、設定画面から移行する想定
    return loadLocal();
  }

  const groupRow = groups[0];
  const groupId = groupRow.id as string;

  const [{ data: members }, { data: balls }, { data: sessions }] = await Promise.all([
    supabase.from("members").select("*").eq("group_id", groupId),
    supabase.from("balls").select("*").eq("group_id", groupId),
    supabase.from("score_sessions").select("*").eq("group_id", groupId).order("played_on", { ascending: false }),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);
  const { data: games } = sessionIds.length
    ? await supabase.from("score_games").select("*").in("session_id", sessionIds)
    : { data: [] as Record<string, unknown>[] };

  const mappedMembers: Member[] = (members ?? []).map((m) => ({
    id: m.id,
    groupId: m.group_id,
    displayName: m.display_name,
    isSelf: Boolean(m.is_self),
  }));

  const mappedBalls: Ball[] = (balls ?? []).map((b) => ({
    id: b.id,
    groupId: b.group_id,
    memberId: b.member_id,
    name: b.name,
    brand: b.brand ?? "",
    weightLb: b.weight_lb == null ? null : Number(b.weight_lb),
    purchasedOn: b.purchased_on ?? "",
    shopName: b.shop_name ?? "",
    drillerName: b.driller_name ?? "",
    drilledOn: b.drilled_on ?? "",
    price: b.price == null ? null : Number(b.price),
    layoutNote: b.layout_note ?? "",
    surfaceNote: b.surface_note ?? "",
    memo: b.memo ?? "",
  }));

  const gamesBySession = new Map<string, ScoreGame[]>();
  for (const g of games ?? []) {
    const list = gamesBySession.get(g.session_id) ?? [];
    list.push({
      id: g.id,
      sessionId: g.session_id,
      gameNo: g.game_no,
      score: g.score,
      ballId: g.ball_id,
    });
    gamesBySession.set(g.session_id, list);
  }

  const mappedSessions: ScoreSession[] = (sessions ?? []).map((s) => ({
    id: s.id,
    groupId: s.group_id,
    memberId: s.member_id,
    playedOn: s.played_on,
    sessionType: s.session_type,
    tournamentName: s.tournament_name ?? "",
    shopName: s.shop_name ?? "",
    oilNote: s.oil_note ?? "",
    memo: s.memo ?? "",
    games: (gamesBySession.get(s.id) ?? []).sort((a, b) => a.gameNo - b.gameNo),
  }));

  const self = mappedMembers.find((m) => m.isSelf) ?? mappedMembers[0];

  return {
    group: {
      id: groupRow.id,
      name: groupRow.name,
      inviteCode: groupRow.invite_code,
    },
    members: mappedMembers,
    balls: mappedBalls,
    sessions: mappedSessions,
    activeMemberId: self?.id ?? "",
  };
}

export async function saveAppData(data: AppData): Promise<void> {
  // MVP: 常にローカルへ保存。Supabase接続時は設定画面から同期を拡張予定
  saveLocal(data);
  if (!isSupabaseConfigured || !supabase) return;

  // 簡易同期: グループが無ければ作成、あればローカル優先で upsert
  const g = data.group;
  await supabase.from("groups").upsert({
    id: g.id,
    name: g.name,
    invite_code: g.inviteCode,
  });

  await supabase.from("members").upsert(
    data.members.map((m) => ({
      id: m.id,
      group_id: m.groupId,
      display_name: m.displayName,
      is_self: m.isSelf,
    })),
  );

  await supabase.from("balls").upsert(
    data.balls.map((b) => ({
      id: b.id,
      group_id: b.groupId,
      member_id: b.memberId,
      name: b.name,
      brand: b.brand,
      weight_lb: b.weightLb,
      purchased_on: b.purchasedOn || null,
      shop_name: b.shopName,
      driller_name: b.drillerName,
      drilled_on: b.drilledOn || null,
      price: b.price,
      layout_note: b.layoutNote,
      surface_note: b.surfaceNote,
      memo: b.memo,
    })),
  );

  for (const s of data.sessions) {
    await supabase.from("score_sessions").upsert({
      id: s.id,
      group_id: s.groupId,
      member_id: s.memberId,
      played_on: s.playedOn,
      session_type: s.sessionType,
      tournament_name: s.tournamentName,
      shop_name: s.shopName,
      oil_note: s.oilNote,
      memo: s.memo,
    });
    await supabase.from("score_games").delete().eq("session_id", s.id);
    if (s.games.length) {
      await supabase.from("score_games").insert(
        s.games.map((g) => ({
          id: g.id,
          session_id: g.sessionId,
          game_no: g.gameNo,
          score: g.score,
          ball_id: g.ballId,
        })),
      );
    }
  }
}

export function resetLocalDemo(): AppData {
  const demo = createDemoData();
  saveLocal(demo);
  return demo;
}
