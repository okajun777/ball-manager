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
  loadViewMemberId,
  saveViewMemberId,
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
  /** この端末で管理・表示中のメンバー（端末ローカル。他端末には影響しない） */
  activeMember: Member | null;
  needsSetup: boolean;
  memberBalls: Ball[];
  memberRetiredBalls: Ball[];
  memberAllBalls: Ball[];
  memberSessions: ScoreSession[];
  memberMaintenances: SurfaceMaintenance[];
  setActiveMemberId: (id: string) => void;
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

function pickViewMemberId(data: AppData): string {
  const local = loadViewMemberId(data.group.id);
  if (local && data.members.some((m) => m.id === local)) return local;
  if (data.activeMemberId && data.members.some((m) => m.id === data.activeMemberId)) {
    return data.activeMemberId;
  }
  return findAdminMemberId(data.members) ?? data.members[0]?.id ?? "";
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMemberId, setViewMemberId] = useState("");

  const persist = useCallback(async (next: AppData) => {
    const saved = await saveAppData(next);
    setData(saved);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      clearDeviceMemberId();
      const loaded = await loadAppData();
      const viewId = pickViewMemberId(loaded);
      if (viewId) saveViewMemberId(loaded.group.id, viewId);
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

  const needsSetup = Boolean(data && !loading && data.members.length === 0);

  const activeMember = useMemo(
    () => data?.members.find((m) => m.id === viewMemberId) ?? null,
    [data, viewMemberId],
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
    needsSetup,
    memberBalls,
    memberRetiredBalls,
    memberAllBalls,
    memberSessions,
    memberMaintenances,
    setActiveMemberId: (id) => {
      if (!data) return;
      if (!data.members.some((m) => m.id === id)) return;
      saveViewMemberId(data.group.id, id);
      setViewMemberId(id);
    },
    upsertBall: async (ball) => {
      if (!data) return;
      const exists = data.balls.some((b) => b.id === ball.id);
      const balls = exists
        ? data.balls.map((b) => (b.id === ball.id ? ball : b))
        : [...data.balls, ball];
      await persist({ ...data, balls });
    },
    deleteBall: async (id) => {
      if (!data) return;
      await persist({
        ...data,
        balls: data.balls.filter((b) => b.id !== id),
        maintenances: (data.maintenances ?? []).filter((m) => m.ballId !== id),
      });
    },
    setBallRetired: async (id, retired) => {
      if (!data) return;
      await persist({
        ...data,
        balls: data.balls.map((b) => (b.id === id ? { ...b, retired } : b)),
      });
    },
    upsertSession: async (session) => {
      if (!data) return;
      const exists = data.sessions.some((s) => s.id === session.id);
      const sessions = exists
        ? data.sessions.map((s) => (s.id === session.id ? session : s))
        : [session, ...data.sessions];
      await persist({ ...data, sessions });
    },
    deleteSession: async (id) => {
      if (!data) return;
      await persist({
        ...data,
        sessions: data.sessions.filter((s) => s.id !== id),
      });
    },
    addMaintenance: async (item) => {
      if (!data) return;
      const ball = data.balls.find((b) => b.id === item.ballId);
      const balls = ball
        ? data.balls.map((b) =>
            b.id === item.ballId
              ? {
                  ...b,
                  surfaceNote:
                    [MAINTENANCE_KIND_LABEL[item.kind], item.grit, item.note]
                      .filter(Boolean)
                      .join(" / ") || b.surfaceNote,
                }
              : b,
          )
        : data.balls;
      await persist({
        ...data,
        balls,
        maintenances: [item, ...(data.maintenances ?? [])],
      });
    },
    deleteMaintenance: async (id) => {
      if (!data) return;
      await persist({
        ...data,
        maintenances: (data.maintenances ?? []).filter((m) => m.id !== id),
      });
    },
    addMember: async (name) => {
      if (!data || !name.trim()) return;
      const member: Member = normalizeMember({
        id: uid("mem"),
        groupId: data.group.id,
        displayName: name.trim(),
        isSelf: false,
      });
      await persist({ ...data, members: [...data.members, member] });
    },
    deleteMember: async (id) => {
      if (!data) return;
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
      if (!data || !name.trim()) return;
      await persist({
        ...data,
        members: data.members.map((m) =>
          m.id === id ? { ...m, displayName: name.trim() } : m,
        ),
      });
    },
    updateMemberProfile: async (id, patch) => {
      if (!data) return;
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
      if (!data || !name.trim()) return;
      await persist({ ...data, group: { ...data.group, name: name.trim() } });
    },
    replaceAppData: async (next) => {
      const saved = await saveAppData({
        ...next,
        maintenances: next.maintenances ?? [],
      });
      const viewId = pickViewMemberId(saved);
      if (viewId) saveViewMemberId(saved.group.id, viewId);
      setViewMemberId(viewId);
      setData(saved);
    },
    joinGroup: async (inviteCode, displayName) => {
      const next = await joinByInviteCode(inviteCode, displayName);
      const viewId = pickViewMemberId(next);
      if (viewId) saveViewMemberId(next.group.id, viewId);
      setViewMemberId(viewId);
      setData(next);
    },
    startPersonalGroup: async (displayName) => {
      const name = displayName.trim();
      if (!name) throw new Error("表示名を入力してください");
      const next = createPersonalGroup(name);
      const saved = await saveAppData(next);
      saveViewMemberId(saved.group.id, saved.activeMemberId);
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
