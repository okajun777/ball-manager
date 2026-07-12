import type {
  AppData,
  Ball,
  Group,
  Member,
  ScoreGame,
  ScoreSession,
  SurfaceMaintenance,
} from "./types";
import { normalizeMember, normalizeBall, today, uid } from "./types";
import { getSupabase, isSupabaseConfigured } from "./supabase";

const LOCAL_KEY = "ball-manager-data-v1";
const TOMBSTONE_KEY = "ball-manager-tombstones-v1";

type Tombstones = {
  members: string[];
  balls: string[];
  sessions: string[];
  maintenances: string[];
};

function emptyTombstones(): Tombstones {
  return { members: [], balls: [], sessions: [], maintenances: [] };
}

function loadTombstones(): Tombstones {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    if (!raw) return emptyTombstones();
    const parsed = JSON.parse(raw) as Partial<Tombstones>;
    return {
      members: Array.isArray(parsed.members) ? parsed.members : [],
      balls: Array.isArray(parsed.balls) ? parsed.balls : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      maintenances: Array.isArray(parsed.maintenances) ? parsed.maintenances : [],
    };
  } catch {
    return emptyTombstones();
  }
}

function saveTombstones(t: Tombstones) {
  localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(t));
}

function addTombstone(
  kind: keyof Tombstones,
  ids: string | string[],
) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  const t = loadTombstones();
  const set = new Set([...t[kind], ...list.filter(Boolean)]);
  t[kind] = [...set];
  saveTombstones(t);
}

function clearTombstones(kind: keyof Tombstones, ids: string[]) {
  if (!ids.length) return;
  const drop = new Set(ids);
  const t = loadTombstones();
  t[kind] = t[kind].filter((id) => !drop.has(id));
  saveTombstones(t);
}

/** 削除済みIDをクラウド復元から除外 */
export function applyTombstones(data: AppData): AppData {
  const t = loadTombstones();
  const members = new Set(t.members);
  const balls = new Set(t.balls);
  const sessions = new Set(t.sessions);
  const maintenances = new Set(t.maintenances);
  if (!members.size && !balls.size && !sessions.size && !maintenances.size) return data;
  return {
    ...data,
    members: data.members.filter((m) => !members.has(m.id)),
    balls: data.balls.filter((b) => !balls.has(b.id)),
    sessions: data.sessions.filter((s) => !sessions.has(s.id)),
    maintenances: (data.maintenances ?? []).filter((m) => !maintenances.has(m.id)),
  };
}

/** ローカル保存前に、消えたIDを墓標へ記録（クラウドからの復活防止） */
export function recordDeletions(prev: AppData | null, next: AppData) {
  if (!prev) return;
  if (prev.group.id !== next.group.id) return;
  const nextMembers = new Set(next.members.map((m) => m.id));
  const nextBalls = new Set(next.balls.map((b) => b.id));
  const nextSessions = new Set(next.sessions.map((s) => s.id));
  const nextMaint = new Set((next.maintenances ?? []).map((m) => m.id));
  addTombstone(
    "members",
    prev.members.map((m) => m.id).filter((id) => !nextMembers.has(id)),
  );
  addTombstone(
    "balls",
    prev.balls.map((b) => b.id).filter((id) => !nextBalls.has(id)),
  );
  addTombstone(
    "sessions",
    prev.sessions.map((s) => s.id).filter((id) => !nextSessions.has(id)),
  );
  addTombstone(
    "maintenances",
    (prev.maintenances ?? []).map((m) => m.id).filter((id) => !nextMaint.has(id)),
  );
}

/** 再登録したら墓標を外す */
export function clearTombstonesForPresent(data: AppData) {
  clearTombstones(
    "members",
    data.members.map((m) => m.id),
  );
  clearTombstones(
    "balls",
    data.balls.map((b) => b.id),
  );
  clearTombstones(
    "sessions",
    data.sessions.map((s) => s.id),
  );
  clearTombstones(
    "maintenances",
    (data.maintenances ?? []).map((m) => m.id),
  );
}

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
    balls: (data.balls ?? []).map((b) => normalizeBall(b)),
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
    return applyTombstones(local);
  }

  const cloudRaw = await loadAppDataFromGroupId(cloudGroup.id, activeMemberId);
  const boundLocal = applyTombstones(
    rebindToGroup(local, {
      id: cloudGroup.id,
      name: cloudGroup.name || local.group.name,
      inviteCode: cloudGroup.inviteCode || local.group.inviteCode,
    }),
  );
  const cloud = applyTombstones(cloudRaw);

  // ローカルで消した球がクラウドに残っている → ローカルの削除を正としてクラウドを掃除
  if (shouldPreferLocalDeletions(boundLocal, cloudRaw)) {
    const localBallIds = new Set(boundLocal.balls.map((b) => b.id));
    addTombstone(
      "balls",
      cloudRaw.balls.map((b) => b.id).filter((id) => !localBallIds.has(id)),
    );
    const droppedMaint = (cloudRaw.maintenances ?? [])
      .filter((m) => !localBallIds.has(m.ballId))
      .map((m) => m.id);
    addTombstone("maintenances", droppedMaint);
    const merged: AppData = {
      ...cloudRaw,
      group: boundLocal.group,
      balls: boundLocal.balls,
      maintenances: (cloudRaw.maintenances ?? []).filter((m) => localBallIds.has(m.ballId)),
      activeMemberId: boundLocal.activeMemberId || cloudRaw.activeMemberId,
    };
    await saveAppData(applyTombstones(merged));
    return applyTombstones(merged);
  }

  // クラウドが空でローカルに中身がある → ローカル優先でクラウドへ同期
  if (cloudIsEmpty(cloud) && localHasContent(boundLocal)) {
    await saveAppData(boundLocal);
    return boundLocal;
  }

  // 両方に中身がある場合、ローカルの方が明らかに豊富ならローカルを正とする
  // （空の Pages 初期デモがクラウドに載って、本データの名前・ボールを消すのを防ぐ）
  if (!cloudIsEmpty(cloud) && localHasContent(boundLocal) && contentScore(boundLocal) > contentScore(cloud)) {
    await saveAppData(boundLocal);
    return boundLocal;
  }

  // クラウドに中身がある → 墓標適用後のクラウドを正とし、差分があれば掃除
  if (!cloudIsEmpty(cloud) || !cloudIsEmpty(cloudRaw)) {
    if (
      cloud.balls.length !== cloudRaw.balls.length ||
      cloud.sessions.length !== cloudRaw.sessions.length ||
      (cloud.maintenances?.length ?? 0) !== (cloudRaw.maintenances?.length ?? 0) ||
      cloud.members.length !== cloudRaw.members.length
    ) {
      await saveAppData(cloud);
      return cloud;
    }
    saveLocal(cloud);
    return cloud;
  }

  // 両方ほぼ空 → ローカルをクラウドへも載せる
  await saveAppData(boundLocal);
  return boundLocal;
}

function shouldPreferLocalDeletions(local: AppData, cloud: AppData): boolean {
  // 空のローカルでクラウドの球を全消ししない（初回同期・別端末）
  if (!local.balls.length) return false;
  if (local.balls.length >= cloud.balls.length) return false;
  const cloudBalls = new Set(cloud.balls.map((b) => b.id));
  // ローカルの球がすべてクラウドにもある（＝ローカルは部分集合＝削除の可能性）
  if (local.balls.some((b) => !cloudBalls.has(b.id))) return false;
  const localBalls = new Set(local.balls.map((b) => b.id));
  return cloud.balls.some((b) => !localBalls.has(b.id));
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
  const prev = readLocalRaw();
  recordDeletions(prev, data);
  clearTombstonesForPresent(data);
  const fixed = repairInvalidUuids(applyTombstones(data));
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
      clearTombstones("members", gone);
    }
  }

  if (fixed.balls.length) {
    const ballRows = fixed.balls.map((b) => ({
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
      cover_name: b.coverName ?? "",
      cover_type: b.coverType ?? "",
      core_name: b.coreName ?? "",
      core_type: b.coreType ?? "",
      rg: b.rg ?? null,
      diff: b.diff ?? null,
      mb: b.mb ?? null,
      release_month: b.releaseMonth ?? "",
      retired: Boolean(b.retired),
    }));
    const { error } = await supabase.from("balls").upsert(ballRows);
    if (error) {
      // 詳細カラム未追加の既存DB向けフォールバック
      const { error: fallbackErr } = await supabase.from("balls").upsert(
        ballRows.map(
          ({
            cover_name: _c1,
            cover_type: _c2,
            core_name: _c3,
            core_type: _c4,
            rg: _rg,
            diff: _diff,
            mb: _mb,
            release_month: _rm,
            ...rest
          }) => rest,
        ),
      );
      if (fallbackErr) throw new Error(`ボール同期に失敗: ${fallbackErr.message}`);
    }
  }

  // ローカルで消したボールをクラウドからも削除
  {
    const { data: remoteBalls, error } = await supabase
      .from("balls")
      .select("id")
      .eq("group_id", g.id);
    if (error) throw new Error(`ボール取得に失敗: ${error.message}`);
    const keep = new Set(fixed.balls.map((b) => b.id));
    const gone = (remoteBalls ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (gone.length) {
      const { error: delErr } = await supabase.from("balls").delete().in("id", gone);
      if (delErr) throw new Error(`ボール削除に失敗: ${delErr.message}`);
      clearTombstones("balls", gone);
    }
  }

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

  // ローカルで消したスコアセッションをクラウドからも削除
  {
    const { data: remoteSessions, error } = await supabase
      .from("score_sessions")
      .select("id")
      .eq("group_id", g.id);
    if (error) throw new Error(`スコア取得に失敗: ${error.message}`);
    const keep = new Set(fixed.sessions.map((s) => s.id));
    const gone = (remoteSessions ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (gone.length) {
      const { error: delErr } = await supabase.from("score_sessions").delete().in("id", gone);
      if (delErr) throw new Error(`スコア削除に失敗: ${delErr.message}`);
      clearTombstones("sessions", gone);
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

  // ローカルで消したメンテをクラウドからも削除
  {
    const { data: remoteMaint, error } = await supabase
      .from("surface_maintenances")
      .select("id")
      .eq("group_id", g.id);
    if (error) throw new Error(`メンテ取得に失敗: ${error.message}`);
    const keep = new Set((fixed.maintenances ?? []).map((m) => m.id));
    const gone = (remoteMaint ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (gone.length) {
      const { error: delErr } = await supabase
        .from("surface_maintenances")
        .delete()
        .in("id", gone);
      if (delErr) throw new Error(`メンテ削除に失敗: ${delErr.message}`);
      clearTombstones("maintenances", gone);
    }
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
    coverName: b.cover_name ?? "",
    coverType: b.cover_type ?? "",
    coreName: b.core_name ?? "",
    coreType: b.core_type ?? "",
    rg: b.rg == null ? null : Number(b.rg),
    diff: b.diff == null ? null : Number(b.diff),
    mb: b.mb == null ? null : Number(b.mb),
    releaseMonth: b.release_month ?? "",
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
