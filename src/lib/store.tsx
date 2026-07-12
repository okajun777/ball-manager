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
  loadViewMemberId,
  saveAdminPin,
  saveDeviceMemberId,
  saveViewMemberId,
  verifyAdminPin,
} from "./identity";
import { loadAppData, saveAppData, joinByInviteCode, createPersonalGroup } from "./storage";
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
  /** 画面に表示・編集中のメンバー */
  activeMember: Member | null;
  /** この端末にログイン中の利用者 */
  deviceMember: Member | null;
  /** 管理者（淳司 / isSelf）として開いているか */
  isAdmin: boolean;
  /** メンバー未作成 */
  needsSetup: boolean;
  /** 利用者未選択（PIN / メンバー選択が必要） */
  needsIdentity: boolean;
  memberBalls: Ball[];
  memberRetiredBalls: Ball[];
  memberAllBalls: Ball[];
  memberSessions: ScoreSession[];
  memberMaintenances: SurfaceMaintenance[];
  setActiveMemberId: (id: string) => void;
  claimAsMember: (memberId: string) => void;
  unlockAdmin: (pin: string) => { ok: boolean; error?: string };
  setAdminPin: (pin: string) => { ok: boolean; error?: string };
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
  startPersonalGroup: (displayName: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

function owns(resourceMemberId: string, deviceMemberId: string, isAdmin: boolean) {
  if (isAdmin) return true;
  return resourceMemberId === deviceMemberId;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceMemberId, setDeviceMemberIdState] = useState<string | null>(() =>
    loadDeviceMemberId(),
  );
  const [viewMemberId, setViewMemberId] = useState("");
  const [adminPinReady, setAdminPinReady] = useState(() => hasAdminPin());

  const persist = useCallback(async (next: AppData) => {
    const saved = await saveAppData(next);
    setData(saved);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadAppData();
      const adminId = findAdminMemberId(loaded.members);
      let deviceId = loadDeviceMemberId();
      if (deviceId && !loaded.members.some((m) => m.id === deviceId)) {
        deviceId = null;
        clearDeviceMemberId();
      }
      setDeviceMemberIdState(deviceId);

      const isAdminDevice = Boolean(deviceId && adminId && deviceId === adminId);
      let viewId = "";
      if (isAdminDevice) {
        const localView = loadViewMemberId(loaded.group.id);
        viewId =
          localView && loaded.members.some((m) => m.id === localView)
            ? localView
            : adminId ?? loaded.members[0]?.id ?? "";
      } else if (deviceId) {
        viewId = deviceId;
      }
      setViewMemberId(viewId);
      setData(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onFocus = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  const adminId = useMemo(
    () => (data ? findAdminMemberId(data.members) : null),
    [data],
  );
  const isAdmin = Boolean(deviceMemberId && adminId && deviceMemberId === adminId);
  const needsSetup = Boolean(data && !loading && data.members.length === 0);
  const needsIdentity = Boolean(data && !loading && data.members.length > 0 && !deviceMemberId);

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
    needsSetup,
    needsIdentity,
    memberBalls,
    memberRetiredBalls,
    memberAllBalls,
    memberSessions,
    memberMaintenances,
    hasAdminPin: adminPinReady,
    setActiveMemberId: (id) => {
      if (!data || !isAdmin) return;
      if (!data.members.some((m) => m.id === id)) return;
      saveViewMemberId(data.group.id, id);
      setViewMemberId(id);
    },
    claimAsMember: (id) => {
      if (!data?.members.some((m) => m.id === id)) return;
      const admin = findAdminMemberId(data.members);
      if (admin && id === admin) return;
      saveDeviceMemberId(id);
      setDeviceMemberIdState(id);
      setViewMemberId(id);
    },
    unlockAdmin: (pin) => {
      if (!data) return { ok: false, error: "データ未読込" };
      const admin = findAdminMemberId(data.members);
      if (!admin) return { ok: false, error: "管理者を開けません" };

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
      const localView = loadViewMemberId(data.group.id);
      const viewId =
        localView && data.members.some((m) => m.id === localView) ? localView : admin;
      saveViewMemberId(data.group.id, viewId);
      setViewMemberId(viewId);
      return { ok: true };
    },
    setAdminPin: (pin) => {
      if (!isAdmin) return { ok: false, error: "管理者のみ変更できます" };
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
      setViewMemberId("");
    },
    upsertBall: async (ball) => {
      if (!data || !deviceMemberId) return;
      if (!owns(ball.memberId, deviceMemberId, isAdmin)) return;
      const safe = isAdmin ? ball : { ...ball, memberId: deviceMemberId };
      const exists = data.balls.some((b) => b.id === safe.id);
      const balls = exists
        ? data.balls.map((b) => (b.id === safe.id ? safe : b))
        : [...data.balls, safe];
      await persist({ ...data, balls });
    },
    deleteBall: async (id) => {
      if (!data || !deviceMemberId) return;
      const ball = data.balls.find((b) => b.id === id);
      if (!ball || !owns(ball.memberId, deviceMemberId, isAdmin)) return;
      await persist({
        ...data,
        balls: data.balls.filter((b) => b.id !== id),
        maintenances: (data.maintenances ?? []).filter((m) => m.ballId !== id),
      });
    },
    setBallRetired: async (id, retired) => {
      if (!data || !deviceMemberId) return;
      const ball = data.balls.find((b) => b.id === id);
      if (!ball || !owns(ball.memberId, deviceMemberId, isAdmin)) return;
      await persist({
        ...data,
        balls: data.balls.map((b) => (b.id === id ? { ...b, retired } : b)),
      });
    },
    upsertSession: async (session) => {
      if (!data || !deviceMemberId) return;
      if (!owns(session.memberId, deviceMemberId, isAdmin)) return;
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
      if (!session || !owns(session.memberId, deviceMemberId, isAdmin)) return;
      await persist({
        ...data,
        sessions: data.sessions.filter((s) => s.id !== id),
      });
    },
    addMaintenance: async (item) => {
      if (!data || !deviceMemberId) return;
      if (!owns(item.memberId, deviceMemberId, isAdmin)) return;
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
      if (!item || !owns(item.memberId, deviceMemberId, isAdmin)) return;
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
      const nextView =
        viewMemberId === id
          ? admin ?? data.members.find((m) => m.id !== id)?.id ?? ""
          : viewMemberId;
      if (nextView) saveViewMemberId(data.group.id, nextView);
      setViewMemberId(nextView);
      await persist({
        ...data,
        activeMemberId: data.activeMemberId === id ? nextView : data.activeMemberId,
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
      const saved = await saveAppData({
        ...next,
        maintenances: next.maintenances ?? [],
      });
      setData(saved);
    },
    joinGroup: async (inviteCode, displayName) => {
      const next = await joinByInviteCode(inviteCode, displayName);
      if (next.activeMemberId) {
        saveDeviceMemberId(next.activeMemberId);
        setDeviceMemberIdState(next.activeMemberId);
        setViewMemberId(next.activeMemberId);
      }
      setData(next);
    },
    startPersonalGroup: async (displayName) => {
      const name = displayName.trim();
      if (!name) throw new Error("表示名を入力してください");
      const next = createPersonalGroup(name);
      const saved = await saveAppData(next);
      saveDeviceMemberId(saved.activeMemberId);
      setDeviceMemberIdState(saved.activeMemberId);
      setViewMemberId(saved.activeMemberId);
      setData(saved);
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
