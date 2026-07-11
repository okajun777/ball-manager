import type {
  AppData,
  Ball,
  Group,
  Member,
  ScoreGame,
  ScoreSession,
  SurfaceMaintenance,
} from "./types";
import { normalizeMember, today, uid } from "./types";
import { getSupabase, isSupabaseConfigured } from "./supabase";

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
    {
      id: selfId,
      groupId,
      displayName: "淳司",
      isSelf: true,
      gender: "male",
      hand: "right",
      throwStyle: "unspecified",
      profileNote: "",
    },
    {
      id: familyId,
      groupId,
      displayName: "はるみ",
      isSelf: false,
      gender: "female",
      hand: "unspecified",
      throwStyle: "unspecified",
      profileNote: "",
    },
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
      laneNote: "",
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
      laneNote: "",
      oilNote: "ハウス",
      memo: "デモ大会",
      games: [
        { id: uid("game"), sessionId: tournamentId, gameNo: 1, score: 168, ballId: ball1 },
        { id: uid("game"), sessionId: tournamentId, gameNo: 2, score: 182, ballId: ball2 },
        { id: uid("game"), sessionId: tournamentId, gameNo: 3, score: 159, ballId: ball1 },
      ],
    },
  ];

  return { group, members, balls, sessions, maintenances: [], activeMemberId: selfId };
}

/** 淳司・はるみの空データ（デモスコアなし） */
export function createFreshData(): AppData {
  const groupId = uid("grp");
  const selfId = uid("mem");
  const familyId = uid("mem");
  return {
    group: {
      id: groupId,
      name: "うちのボウリング部",
      inviteCode: "family01",
    },
    members: [
      {
        id: selfId,
        groupId,
        displayName: "淳司",
        isSelf: true,
        gender: "male",
        hand: "right",
        throwStyle: "unspecified",
        profileNote: "",
      },
      {
        id: familyId,
        groupId,
        displayName: "はるみ",
        isSelf: false,
        gender: "female",
        hand: "unspecified",
        throwStyle: "unspecified",
        profileNote: "",
      },
    ],
    balls: [],
    sessions: [],
    maintenances: [],
    activeMemberId: selfId,
  };
}

export function resetToFreshData(): AppData {
  const fresh = createFreshData();
  saveLocal(fresh);
  return fresh;
}

/** 初期デモのプレースホルダ名を実メンバー名へ寄せる */
function remapDemoMemberNames(members: Member[]): Member[] {
  return members.map((m) => {
    if (m.displayName === "自分") return { ...m, displayName: "淳司" };
    if (m.displayName === "家族") return { ...m, displayName: "はるみ" };
    return m;
  });
}

function normalizeAppData(data: AppData): AppData {
  return {
    ...data,
    members: remapDemoMemberNames(data.members).map(normalizeMember),
    balls: (data.balls ?? []).map((b) => ({
      ...b,
      retired: Boolean(b.retired),
    })),
    sessions: (data.sessions ?? []).map((s) => ({
      ...s,
      laneNote: s.laneNote ?? "",
    })),
    maintenances: Array.isArray(data.maintenances) ? data.maintenances : [],
  };
}

function loadLocal(): AppData {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) {
    const demo = createDemoData();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(demo));
    return demo;
  }
  const parsed = JSON.parse(raw) as AppData;
  const normalized = normalizeAppData(parsed);
  const renamed = parsed.members.some(
    (m, i) => m.displayName !== normalized.members[i]?.displayName,
  );
  if (renamed) saveLocal(normalized);
  return normalized;
}

function saveLocal(data: AppData) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
}

export async function loadAppData(): Promise<AppData> {
  const supabase = getSupabase();
  if (!isSupabaseConfigured() || !supabase) return loadLocal();

  const local = (() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? (JSON.parse(raw) as AppData) : null;
    } catch {
      return null;
    }
  })();

  let groupId = local?.group.id ?? "";
  let activeMemberId = local?.activeMemberId ?? "";

  if (groupId) {
    const { data: exists } = await supabase
      .from("groups")
      .select("id")
      .eq("id", groupId)
      .limit(1);
    if (!exists?.length) groupId = "";
  }

  if (!groupId) {
    const { data: groups, error } = await supabase.from("groups").select("*").limit(1);
    if (error) throw error;
    if (!groups?.length) return loadLocal();
    groupId = groups[0].id as string;
  }

  return loadAppDataFromGroupId(groupId, activeMemberId);
}

export async function saveAppData(data: AppData): Promise<void> {
  // MVP: 常にローカルへ保存。Supabase接続時は設定画面から同期を拡張予定
  saveLocal(data);
  const supabase = getSupabase();
  if (!isSupabaseConfigured() || !supabase) return;

  // 簡易同期: グループが無ければ作成、あればローカル優先で upsert
  const g = data.group;
  await supabase.from("groups").upsert({
    id: g.id,
    name: g.name,
    invite_code: g.inviteCode,
  });

  await supabase.from("members").upsert(
    data.members.map((m) => {
      const n = normalizeMember(m);
      return {
        id: n.id,
        group_id: n.groupId,
        display_name: n.displayName,
        is_self: n.isSelf,
        gender: n.gender ?? "unspecified",
        hand: n.hand ?? "unspecified",
        throw_style: n.throwStyle ?? "unspecified",
        profile_note: n.profileNote ?? "",
      };
    }),
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
      retired: Boolean(b.retired),
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
      lane_note: s.laneNote ?? "",
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
          frames: g.frames ?? null,
        })),
      );
    }
  }

  if (data.maintenances?.length) {
    await supabase.from("surface_maintenances").upsert(
      data.maintenances.map((m) => ({
        id: m.id,
        group_id: m.groupId,
        member_id: m.memberId,
        ball_id: m.ballId,
        done_on: m.doneOn || null,
        kind: m.kind,
        grit: m.grit,
        note: m.note,
      })),
    );
  }
}

export function resetLocalDemo(): AppData {
  const demo = createDemoData();
  saveLocal(demo);
  return demo;
}

/** 招待コードでグループに参加。Supabase優先、ローカルは同一コードのグループのみ。 */
export async function joinByInviteCode(
  inviteCode: string,
  displayName: string,
): Promise<AppData> {
  const code = inviteCode.trim();
  const name = displayName.trim();
  if (!code) throw new Error("招待コードを入力してください");
  if (!name) throw new Error("表示名を入力してください");

  if (isSupabaseConfigured()) {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase未設定");
    const { data: groups, error } = await supabase
      .from("groups")
      .select("*")
      .eq("invite_code", code)
      .limit(1);
    if (error) throw error;
    if (!groups?.length) throw new Error("招待コードが見つかりません");

    const groupRow = groups[0];
    const groupId = groupRow.id as string;
    const memberId = uid("mem");

    const { error: memErr } = await supabase.from("members").insert({
      id: memberId,
      group_id: groupId,
      display_name: name,
      is_self: true,
      gender: "unspecified",
      hand: "unspecified",
      throw_style: "unspecified",
      profile_note: "",
    });
    if (memErr) throw memErr;

    // 既存メンバーの is_self は触らない（端末ごとに自分扱い）
    const loaded = await loadAppDataFromGroupId(groupId, memberId);
    saveLocal(loaded);
    return loaded;
  }

  const local = loadLocal();
  if (local.group.inviteCode !== code) {
    throw new Error(
      "この端末のグループとコードが一致しません。別端末からの参加は Supabase 設定か JSON 読み込みを使ってください。",
    );
  }
  const member: Member = {
    id: uid("mem"),
    groupId: local.group.id,
    displayName: name,
    isSelf: false,
    gender: "unspecified",
    hand: "unspecified",
    throwStyle: "unspecified",
    profileNote: "",
  };
  const next: AppData = {
    ...local,
    members: [...local.members, member],
    activeMemberId: member.id,
  };
  saveLocal(next);
  return next;
}

async function loadAppDataFromGroupId(groupId: string, activeMemberId: string): Promise<AppData> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase未設定");

  const [{ data: groupRow }, { data: members }, { data: balls }, { data: sessions }] =
    await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).single(),
      supabase.from("members").select("*").eq("group_id", groupId),
      supabase.from("balls").select("*").eq("group_id", groupId),
      supabase
        .from("score_sessions")
        .select("*")
        .eq("group_id", groupId)
        .order("played_on", { ascending: false }),
    ]);

  if (!groupRow) throw new Error("グループを読み込めませんでした");

  const { data: maints } = await supabase
    .from("surface_maintenances")
    .select("*")
    .eq("group_id", groupId);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const { data: games } = sessionIds.length
    ? await supabase.from("score_games").select("*").in("session_id", sessionIds)
    : { data: [] as Record<string, unknown>[] };

  const mappedMembers: Member[] = (members ?? []).map((m) =>
    normalizeMember({
      id: m.id,
      groupId: m.group_id,
      displayName: m.display_name,
      isSelf: activeMemberId ? m.id === activeMemberId : Boolean(m.is_self),
      gender: m.gender ?? "unspecified",
      hand: m.hand ?? "unspecified",
      throwStyle: m.throw_style ?? "unspecified",
      profileNote: m.profile_note ?? "",
    }),
  );

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
    retired: Boolean(b.retired),
  }));

  const gamesBySession = new Map<string, ScoreGame[]>();
  for (const g of games ?? []) {
    const row = g as {
      id: string;
      session_id: string;
      game_no: number;
      score: number;
      ball_id: string | null;
      frames?: number[][] | null;
    };
    const list = gamesBySession.get(row.session_id) ?? [];
    list.push({
      id: row.id,
      sessionId: row.session_id,
      gameNo: row.game_no,
      score: row.score,
      ballId: row.ball_id,
      ...(Array.isArray(row.frames) ? { frames: row.frames } : {}),
    });
    gamesBySession.set(row.session_id, list);
  }

  const mappedSessions: ScoreSession[] = (sessions ?? []).map((s) => ({
    id: s.id,
    groupId: s.group_id,
    memberId: s.member_id,
    playedOn: s.played_on,
    sessionType: s.session_type,
    tournamentName: s.tournament_name ?? "",
    shopName: s.shop_name ?? "",
    laneNote: s.lane_note ?? "",
    oilNote: s.oil_note ?? "",
    memo: s.memo ?? "",
    games: (gamesBySession.get(s.id) ?? []).sort((a, b) => a.gameNo - b.gameNo),
  }));

  const mappedMaints: SurfaceMaintenance[] = (maints ?? []).map((m) => ({
    id: m.id,
    groupId: m.group_id,
    memberId: m.member_id,
    ballId: m.ball_id,
    doneOn: m.done_on ?? "",
    kind: m.kind,
    grit: m.grit ?? "",
    note: m.note ?? "",
  }));

  return {
    group: {
      id: groupRow.id,
      name: groupRow.name,
      inviteCode: groupRow.invite_code,
    },
    members: mappedMembers,
    balls: mappedBalls,
    sessions: mappedSessions,
    maintenances: mappedMaints,
    activeMemberId:
      activeMemberId && mappedMembers.some((m) => m.id === activeMemberId)
        ? activeMemberId
        : (mappedMembers.find((m) => m.isSelf)?.id ?? mappedMembers[0]?.id ?? ""),
  };
}
