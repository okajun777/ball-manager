import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadAppData, saveAppData, joinByInviteCode } from "./storage";
import type { AppData, Ball, Member, ScoreSession, SurfaceMaintenance } from "./types";
import { MAINTENANCE_KIND_LABEL, uid } from "./types";

type Store = {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  activeMember: Member | null;
  memberBalls: Ball[];
  memberSessions: ScoreSession[];
  memberMaintenances: SurfaceMaintenance[];
  setActiveMemberId: (id: string) => void;
  upsertBall: (ball: Ball) => Promise<void>;
  deleteBall: (id: string) => Promise<void>;
  upsertSession: (session: ScoreSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  addMaintenance: (item: SurfaceMaintenance) => Promise<void>;
  deleteMaintenance: (id: string) => Promise<void>;
  addMember: (name: string) => Promise<void>;
  updateMemberName: (id: string, name: string) => Promise<void>;
  updateGroupName: (name: string) => Promise<void>;
  replaceAppData: (next: AppData) => Promise<void>;
  joinGroup: (inviteCode: string, displayName: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<Store | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (next: AppData) => {
    setData(next);
    await saveAppData(next);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await loadAppData();
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

  const activeMember = useMemo(
    () => data?.members.find((m) => m.id === data.activeMemberId) ?? null,
    [data],
  );

  const memberBalls = useMemo(
    () => (data ? data.balls.filter((b) => b.memberId === data.activeMemberId) : []),
    [data],
  );

  const memberSessions = useMemo(
    () =>
      data
        ? data.sessions
            .filter((s) => s.memberId === data.activeMemberId)
            .sort((a, b) => b.playedOn.localeCompare(a.playedOn))
        : [],
    [data],
  );

  const memberMaintenances = useMemo(
    () =>
      data
        ? (data.maintenances ?? [])
            .filter((m) => m.memberId === data.activeMemberId)
            .sort((a, b) => b.doneOn.localeCompare(a.doneOn))
        : [],
    [data],
  );

  const value: Store = {
    data,
    loading,
    error,
    activeMember,
    memberBalls,
    memberSessions,
    memberMaintenances,
    setActiveMemberId: (id) => {
      if (!data) return;
      void persist({ ...data, activeMemberId: id });
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
                    [
                      MAINTENANCE_KIND_LABEL[item.kind],
                      item.grit,
                      item.note,
                    ]
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
      const member: Member = {
        id: uid("mem"),
        groupId: data.group.id,
        displayName: name.trim(),
        isSelf: false,
      };
      await persist({ ...data, members: [...data.members, member] });
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
    updateGroupName: async (name) => {
      if (!data || !name.trim()) return;
      await persist({ ...data, group: { ...data.group, name: name.trim() } });
    },
    replaceAppData: async (next) => {
      await persist({
        ...next,
        maintenances: next.maintenances ?? [],
      });
    },
    joinGroup: async (inviteCode, displayName) => {
      const next = await joinByInviteCode(inviteCode, displayName);
      setData(next);
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
