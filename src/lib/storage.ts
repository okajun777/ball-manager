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

function randomInviteCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 初回起動用（メンバーなし。ゲートで新規 or 招待） */
export function createBlankData(): AppData {
  return {
    group: {
      id: uid(),
      name: "マイグループ",
      inviteCode: randomInviteCode(),
    },
    members: [],
    balls: [],
    sessions: [],
    maintenances: [],
    activeMemberId: "",
  };
}

/** 初めて使う人が自分のグループを作る */
export function createPersonalGroup(displayName: string): AppData {
  const groupId = uid();
  const selfId = uid();
  const name = displayName.trim();
  return {
    group: {
      id: groupId,
      name: `${name}のグループ`,
      inviteCode: randomInviteCode(),
    },
    members: [
      normalizeMember({
        id: selfId,
        groupId,
        displayName: name,
        isSelf: true,
      }),
    ],
    balls: [],
    sessions: [],
    maintenances: [],
    activeMemberId: selfId,
  };
}

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
    inviteCode: randomInviteCode(),
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
      inviteCode: randomInviteCode(),
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
    const blank = createBlankData();
    localStorage.setItem(LOCAL_KEY, JSON.stringify(blank));
    return blank;
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

function readLocalRaw(): AppData | null {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? normalizeAppData(JSON.parse(raw) as AppData) : null;
  } catch {
    return null;
  }
}

function rebindToGroup(data: AppData, group: Group): AppData {
  return {
    ...data,
    group,
    members: data.members.map((m) => ({ ...m, groupId: group.id })),
    balls: data.balls.map((b) => ({ ...b, groupId: group.id })),
    sessions: data.sessions.map((s) => ({ ...s, groupId: group.id })),
    maintenances: (data.maintenances ?? []).map((m) => ({ ...m, groupId: group.id })),
  };
}

function cloudIsEmpty(cloud: AppData): boolean {
  return (
    cloud.members.length === 0 &&
    cloud.balls.length === 0 &&
    cloud.sessions.length === 0 &&
    (cloud.maintenances?.length ?? 0) === 0
  );
}

function localHasContent(local: AppData): boolean {
  return (
    local.members.length > 0 ||
    local.balls.length > 0 ||
    local.sessions.length > 0 ||
    (local.maintenances?.length ?? 0) > 0
  );
}

function contentScore(data: AppData): number {
  return (
    data.members.length * 10 +
    data.balls.length * 5 +
    data.sessions.length * 3 +
    (data.maintenances?.length ?? 0)
  );
}

/**
 * Supabase 接続時:
 * - クラウドに中身があればそれを採用（ローカルへも反映）
 * - クラウドが空でローカルにデータがあればローカルをクラウドへ上げる
 *   （デプロイ後に空のクラウドがローカル名を消すのを防ぐ）
 */
export async function loadAppData(): Promise<AppData> {
  const supabase = getSupabase();
  if (!isSupabaseConfigured() || !supabase) return loadLocal();

  const local = readLocalRaw() ?? loadLocal();
  const activeMemberId = local.activeMemberId ?? "";

  let cloudGroup: Group | null = null;

  const { data: byId } = await supabase
    .from("groups")
    .select("*")
    .eq("id", local.group.id)
    .limit(1);
  if (byId?.length) {
    cloudGroup = {
      id: byId[0].id as string,
      name: byId[0].name as string,
      inviteCode: byId[0].invite_code as string,
    };
  }

  if (!cloudGroup && local.group.inviteCode) {
    const { data: byInvite } = await supabase
      .from("groups")
      .select("*")
      .eq("invite_code", local.group.inviteCode)
      .limit(1);
    if (byInvite?.length) {
      cloudGroup = {
        id: byInvite[0].id as string,
        name: byInvite[0].name as string,
        inviteCode: byInvite[0].invite_code as string,
      };
    }
  }

  // 初めての端末は他人のグループに引き込まない（招待参加は別経路）
  if (!cloudGroup) {
    return local;
  }

  const cloud = await loadAppDataFromGroupId(cloudGroup.id, activeMemberId);
  const boundLocal = rebindToGroup(local, {
    id: cloudGroup.id,
    name: cloudGroup.name || local.group.name,
    inviteCode: cloudGroup.inviteCode || local.group.inviteCode,
  });

  // クラウドが空でローカルに中身がある → ローカル優先でクラウドへ同期
  if (cloudIsEmpty(cloud) && localHasContent(local)) {
    await saveAppData(boundLocal);
    return boundLocal;
  }

  // 両方に中身がある場合、ローカルの方が明らかに豊富ならローカルを正とする
  // （空の Pages 初期デモがクラウドに載って、本データの名前・ボールを消すのを防ぐ）
  if (!cloudIsEmpty(cloud) && localHasContent(local) && contentScore(local) > contentScore(cloud)) {
    await saveAppData(boundLocal);
    return boundLocal;
  }

  // クラウドに中身がある → クラウドを正としローカルへ反映
  if (!cloudIsEmpty(cloud)) {
    saveLocal(cloud);
    return cloud;
  }

  // 両方ほぼ空 → ローカル（初期メンバー）をクラウドへも載せる
  await saveAppData(boundLocal);
  return boundLocal;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

function mapId(id: string, table: Map<string, string>): string {
  if (isUuid(id)) return id;
  const existing = table.get(id);
  if (existing) return existing;
  const next = crypto.randomUUID();
  table.set(id, next);
  return next;
}

/** 旧 uid（mem_xxxx 等）を UUID に直して Supabase に載せる */
function repairInvalidUuids(data: AppData): AppData {
  const ids = new Map<string, string>();
  const groupId = mapId(data.group.id, ids);
  const members = data.members.map((m) =>
    normalizeMember({
      ...m,
      id: mapId(m.id, ids),
      groupId,
    }),
  );
  const balls = data.balls.map((b) => ({
    ...b,
    id: mapId(b.id, ids),
    groupId,
    memberId: mapId(b.memberId, ids),
  }));
  const sessions = data.sessions.map((s) => {
    const sessionId = mapId(s.id, ids);
    return {
      ...s,
      id: sessionId,
      groupId,
      memberId: mapId(s.memberId, ids),
      games: s.games.map((g) => ({
        ...g,
        id: mapId(g.id, ids),
        sessionId,
        ballId: g.ballId ? mapId(g.ballId, ids) : g.ballId,
      })),
    };
  });
  const maintenances = (data.maintenances ?? []).map((m) => ({
    ...m,
    id: mapId(m.id, ids),
    groupId,
    memberId: mapId(m.memberId, ids),
    ballId: mapId(m.ballId, ids),
  }));
  const activeMemberId = data.activeMemberId
    ? mapId(data.activeMemberId, ids)
    : data.activeMemberId;
  return {
    group: { ...data.group, id: groupId },
    members,
    balls,
    sessions,
    maintenances,
    activeMemberId,
  };
}

export async function saveAppData(data: AppData): Promise<AppData> {
  // MVP: 常にローカルへ保存。Supabase接続時は設定画面から同期を拡張予定
  const fixed = repairInvalidUuids(data);
  saveLocal(fixed);
  const supabase = getSupabase();
  if (!isSupabaseConfigured() || !supabase) return fixed;

  // 簡易同期: グループが無ければ作成、あればローカル優先で upsert
  const g = fixed.group;
  {
    const { error } = await supabase.from("groups").upsert({
      id: g.id,
      name: g.name,
      invite_code: g.inviteCode,
    });
    if (error) throw new Error(`グループ同期に失敗: ${error.message}`);
  }

  {
    const { error } = await supabase.from("members").upsert(
      fixed.members.map((m) => {
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
    if (error) throw new Error(`メンバー同期に失敗: ${error.message}`);
  }

  // ローカルで消したメンバーをクラウドからも削除（関連は DB cascade）
  {
    const { data: remoteMembers, error } = await supabase
      .from("members")
      .select("id")
      .eq("group_id", g.id);
    if (error) throw new Error(`メンバー取得に失敗: ${error.message}`);
    const keep = new Set(fixed.members.map((m) => m.id));
    const gone = (remoteMembers ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (gone.length) {
      const { error: delErr } = await supabase.from("members").delete().in("id", gone);
      if (delErr) throw new Error(`メンバー削除に失敗: ${delErr.message}`);
    }
  }

  await supabase.from("balls").upsert(
    fixed.balls.map((b) => ({
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

  for (const s of fixed.sessions) {
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
      osaka_event_id: s.osakaEventId ?? "",
      pattern_pdf_url: s.patternPdfUrl ?? "",
    });
    await supabase.from("score_games").delete().eq("session_id", s.id);
    if (s.games.length) {
      await supabase.from("score_games").insert(
        s.games.map((game) => ({
          id: game.id,
          session_id: game.sessionId,
          game_no: game.gameNo,
          score: game.score,
          ball_id: game.ballId,
          frames: game.frames ?? null,
        })),
      );
    }
  }

  if (fixed.maintenances?.length) {
    await supabase.from("surface_maintenances").upsert(
      fixed.maintenances.map((m) => ({
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

  return fixed;
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
      // 管理者は既存の is_self のみ。参加メンバーは一般
      is_self: false,
      gender: "unspecified",
      hand: "unspecified",
      throw_style: "unspecified",
      profile_note: "",
    });
    if (memErr) throw memErr;

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
      isSelf: Boolean(m.is_self),
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
    osakaEventId: (s.osaka_event_id as string | undefined) ?? "",
    patternPdfUrl: (s.pattern_pdf_url as string | undefined) ?? "",
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
