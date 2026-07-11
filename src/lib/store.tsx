import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearDeviceMemberId,
  findAdminMemberId,
  hasAdminPin,
  loadDeviceMemberId,
  saveAdminPin,
  saveDeviceMemberId,
  verifyAdminPin,
} from "./identity";
import { loadAppData, saveAppData, joinByInviteCode } from "./storage";
import type {
  AppData,
  Ball,
  Member,
  MemberGender,
  MemberHand,
  MemberThrowStyle,
  ScoreSession,
  SurfaceMaintenance,
} from "./types";
import { MAINTENANCE_KIND_LABEL, normalizeMember, uid } from "./types";

type Store = {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  /** 画面に表示中のメンバー（管理者は切替可、一般は自分のみ） */
  activeMember: Member | null;
  /** この端末の利用者 */
  deviceMember: Member | null;
  /** 管理者（isSelf）としてこの端末を使っているか */
  isAdmin: boolean;
  /** 初回など、利用者未選択 */
  needsIdentity: boolean;
  memberBalls: Ball[];
  memberRetiredBalls: Ball[];
  memberAllBalls: Ball[];
  memberSessions: ScoreSession[];
  memberMaintenances: SurfaceMaintenance[];
  setActiveMemberId: (id: string) => void;
  /** 一般メンバーとしてこの端末を使う（オーナーにはできない） */
  claimAsMember: (memberId: string) => void;
  /** PINでオーナーとしてこの端末を使う */
  unlockAdmin: (pin: string) => { ok: boolean; error?: string };
  /** ロック番号を設定・変更（オーナーのみ） */
  setAdminPin: (pin: string) => { ok: boolean; error?: string };
  /** 利用者選択をやり直す */
  resetIdentity: () => void;
  hasAdminPin: boolean;
  upsertBall: (ball: Ball) => Promise<void>;
  deleteBall: (id: string) => Promise<void>;
  setBallRetired: (id: string, retired: boolean) => Promise<void>;
  upsertSession: (session: ScoreSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  addMaintenance: (item: SurfaceMaintenance) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  addMember: (name: string) => Promise<void>;
  /** オーナーのみ。本人（isSelf）は削除不可。関連ボール・スコアも削除 */
  deleteMember: (id: string) => Promise<void>;
  updateMemberName: (id: string, name: string) => Promise<void>;
  updateMemberProfile: (
    id: string,
    patch: {
      displayName?: string;
      gender?: MemberGender;
      hand?: MemberHand;
      throwStyle?: MemberThrowStyle;
      profileNote?: string;
    },
  ) => Promise<void>;
  updateGroupName: (name: string) => Promise<void>;
  replaceAppData: (next: AppData) => Promise<void>;
  joinGroup: (inviteCode: string, displayName: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

function ownsMemberId(memberId: string, resourceMemberId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  return resourceMemberId === memberId;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceMemberId, setDeviceMemberIdState] = useState<string | null>(() =>
    loadDeviceMemberId(),
  );
  const [adminPinReady, setAdminPinReady] = useState(() => hasAdminPin());

  const persist = useCallback(async (next: AppData) => {
    setData(next);
    await saveAppData(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadAppData();
      const adminId = findAdminMemberId(loaded.members);
      let deviceId = loadDeviceMemberId();

      // 不明なIDはクリア（初回は未選択のまま → 本人確認ゲート）
      if (deviceId && !loaded.members.some((m) => m.id === deviceId)) {
        deviceId = null;
      }
      setDeviceMemberIdState(deviceId);

      const isAdminDevice = Boolean(deviceId && adminId && deviceId === adminId);
      if (!isAdminDevice && deviceId) {
        setData({ ...loaded, activeMemberId: deviceId });
      } else {
        setData(loaded);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const adminId = useMemo(
    () => (data ? findAdminMemberId(data.members) : null),
    [data],
  );

  const isAdmin = Boolean(deviceMemberId && adminId && deviceMemberId === adminId);
  const needsIdentity = Boolean(data && !loading && !deviceMemberId);

  const viewMemberId = useMemo(() => {
    if (!data) return "";
    if (!isAdmin && deviceMemberId && data.members.some((m) => m.id === deviceMemberId)) {
      return deviceMemberId;
    }
    return data.activeMemberId;
  }, [data, isAdmin, deviceMemberId]);

  const activeMember = useMemo(
    () => data?.members.find((m) => m.id === viewMemberId) ?? null,
    [data, viewMemberId],
  );

  const deviceMember = useMemo(
    () => data?.members.find((m) => m.id === deviceMemberId) ?? null,
    [data, deviceMemberId],
  );

  const memberBalls = useMemo(
    () =>
      data ? data.balls.filter((b) => b.memberId === viewMemberId && !b.retired) : [],
    [data, viewMemberId],
  );

  const memberRetiredBalls = useMemo(
    () =>
      data ? data.balls.filter((b) => b.memberId === viewMemberId && b.retired) : [],
    [data, viewMemberId],
  );

  const memberAllBalls = useMemo(
    () => (data ? data.balls.filter((b) => b.memberId === viewMemberId) : []),
    [data, viewMemberId],
  );

  const memberSessions = useMemo(
    () =>
      data
        ? data.sessions
            .filter((s) => s.memberId === viewMemberId)
            .sort((a, b) => b.playedOn.localeCompare(a.playedOn))
        : [],
    [data, viewMemberId],
  );

  const memberMaintenances = useMemo(
    () =>
      data
        ? (data.maintenances ?? [])
            .filter((m) => m.memberId === viewMemberId)
            .sort((a, b) => b.doneOn.localeCompare(a.doneOn))
        : [],
    [data, viewMemberId],
  );

  const value: Store = {
    data,
    loading,
    error,
    activeMember,
    deviceMember,
    isAdmin,
    needsIdentity,
    memberBalls,
    memberRetiredBalls,
    memberAllBalls,
    memberSessions,
    memberMaintenances,
    setActiveMemberId: (id) => {
      if (!data || !isAdmin) return;
      if (!data.members.some((m) => m.id === id)) return;
      void persist({ ...data, activeMemberId: id });
    },
    claimAsMember: (id) => {
      if (!data?.members.some((m) => m.id === id)) return;
      const admin = findAdminMemberId(data.members);
      // 管理者アカウントへの切替は禁止（PIN経由のみ）
      if (admin && id === admin) return;
      saveDeviceMemberId(id);
      setDeviceMemberIdState(id);
      setData({ ...data, activeMemberId: id });
    },
    unlockAdmin: (pin) => {
      if (!data) return { ok: false, error: "データ未読込" };
      const admin = findAdminMemberId(data.members);
      if (!admin) return { ok: false, error: "開けません" };

      if (!hasAdminPin()) {
        try {
          saveAdminPin(pin);
          setAdminPinReady(true);
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
      } else if (!verifyAdminPin(pin)) {
        return { ok: false, error: "違います" };
      }

      saveDeviceMemberId(admin);
      setDeviceMemberIdState(admin);
      return { ok: true };
    },
    setAdminPin: (pin) => {
      if (!isAdmin) return { ok: false, error: "できません" };
      try {
        saveAdminPin(pin);
        setAdminPinReady(true);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    resetIdentity: () => {
      clearDeviceMemberId();
      setDeviceMemberIdState(null);
    },
    hasAdminPin: adminPinReady,
    upsertBall: async (ball) => {
      if (!data || !deviceMemberId) return;
      if (!ownsMemberId(deviceMemberId, ball.memberId, isAdmin)) return;
      const safeBall = isAdmin ? ball : { ...ball, memberId: deviceMemberId };
      const exists = data.balls.some((b) => b.id === safeBall.id);
      const balls = exists
        ? data.balls.map((b) => (b.id === safeBall.id ? safeBall : b))
        : [...data.balls, safeBall];
      await persist({ ...data, balls });
    },
    deleteBall: async (id) => {
      if (!data || !deviceMemberId) return;
      const ball = data.balls.find((b) => b.id === id);
      if (!ball || !ownsMemberId(deviceMemberId, ball.memberId, isAdmin)) return;
      await persist({
        ...data,
        balls: data.balls.filter((b) => b.id !== id),
        maintenances: (data.maintenances ?? []).filter((m) => m.ballId !== id),
      });
    },
    setBallRetired: async (id, retired) => {
      if (!data || !deviceMemberId) return;
      const ball = data.balls.find((b) => b.id === id);
      if (!ball || !ownsMemberId(deviceMemberId, ball.memberId, isAdmin)) return;
      await persist({
        ...data,
        balls: data.balls.map((b) => (b.id === id ? { ...b, retired } : b)),
      });
    },
    upsertSession: async (session) => {
      if (!data || !deviceMemberId) return;
      if (!ownsMemberId(deviceMemberId, session.memberId, isAdmin)) return;
      const safe = isAdmin ? session : { ...session, memberId: deviceMemberId };
      const exists = data.sessions.some((s) => s.id === safe.id);
      const sessions = exists
        ? data.sessions.map((s) => (s.id === safe.id ? safe : s))
        : [safe, ...data.sessions];
      await persist({ ...data, sessions });
    },
    deleteSession: async (id) => {
      if (!data || !deviceMemberId) return;
      const session = data.sessions.find((s) => s.id === id);
      if (!session || !ownsMemberId(deviceMemberId, session.memberId, isAdmin)) return;
      await persist({
        ...data,
        sessions: data.sessions.filter((s) => s.id !== id),
      });
    },
    addMaintenance: async (item) => {
      if (!data || !deviceMemberId) return;
      if (!ownsMemberId(deviceMemberId, item.memberId, isAdmin)) return;
      const safe = isAdmin ? item : { ...item, memberId: deviceMemberId };
      const ball = data.balls.find((b) => b.id === safe.ballId);
      const balls = ball
        ? data.balls.map((b) =>
            b.id === safe.ballId
              ? {
                  ...b,
                  surfaceNote:
                    [MAINTENANCE_KIND_LABEL[safe.kind], safe.grit, safe.note]
                      .filter(Boolean)
                      .join(" / ") || b.surfaceNote,
                }
              : b,
          )
        : data.balls;
      await persist({
        ...data,
        balls,
        maintenances: [safe, ...(data.maintenances ?? [])],
      });
    },
    deleteMaintenance: async (id) => {
      if (!data || !deviceMemberId) return;
      const item = (data.maintenances ?? []).find((m) => m.id === id);
      if (!item || !ownsMemberId(deviceMemberId, item.memberId, isAdmin)) return;
      await persist({
        ...data,
        maintenances: (data.maintenances ?? []).filter((m) => m.id !== id),
      });
    },
    addMember: async (name) => {
      if (!data || !isAdmin || !name.trim()) return;
      const member: Member = normalizeMember({
        id: uid("mem"),
        groupId: data.group.id,
        displayName: name.trim(),
        isSelf: false,
      });
      await persist({ ...data, members: [...data.members, member] });
    },
    deleteMember: async (id) => {
      if (!data || !isAdmin) return;
      const target = data.members.find((m) => m.id === id);
      if (!target || target.isSelf) return;
      const admin = findAdminMemberId(data.members);
      const nextActive =
        data.activeMemberId === id ? admin ?? data.members.find((m) => m.id !== id)?.id ?? "" : data.activeMemberId;
      await persist({
        ...data,
        activeMemberId: nextActive,
        members: data.members.filter((m) => m.id !== id),
        balls: data.balls.filter((b) => b.memberId !== id),
        sessions: data.sessions.filter((s) => s.memberId !== id),
        maintenances: (data.maintenances ?? []).filter((m) => m.memberId !== id),
      });
    },
    updateMemberName: async (id, name) => {
      if (!data || !name.trim() || !deviceMemberId) return;
      if (!isAdmin && id !== deviceMemberId) return;
      await persist({
        ...data,
        members: data.members.map((m) =>
          m.id === id ? { ...m, displayName: name.trim() } : m,
        ),
      });
    },
    updateMemberProfile: async (id, patch) => {
      if (!data || !deviceMemberId) return;
      if (!isAdmin && id !== deviceMemberId) return;
      await persist({
        ...data,
        members: data.members.map((m) => {
          if (m.id !== id) return m;
          return normalizeMember({
            ...m,
            displayName: patch.displayName?.trim() || m.displayName,
            gender: patch.gender ?? m.gender,
            hand: patch.hand ?? m.hand,
            throwStyle: patch.throwStyle ?? m.throwStyle,
            profileNote:
              patch.profileNote !== undefined ? patch.profileNote : m.profileNote,
          });
        }),
      });
    },
    updateGroupName: async (name) => {
      if (!data || !isAdmin || !name.trim()) return;
      await persist({ ...data, group: { ...data.group, name: name.trim() } });
    },
    replaceAppData: async (next) => {
      if (!isAdmin) return;
      await persist({
        ...next,
        maintenances: next.maintenances ?? [],
      });
    },
    joinGroup: async (inviteCode, displayName) => {
      const next = await joinByInviteCode(inviteCode, displayName);
      if (next.activeMemberId) {
        saveDeviceMemberId(next.activeMemberId);
        setDeviceMemberIdState(next.activeMemberId);
      }
      setData({ ...next, activeMemberId: next.activeMemberId });
    },
    refresh,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used within DataProvider");
  return ctx;
}
