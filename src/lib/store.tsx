import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { loadAppData, saveAppData } from "./storage";
import type { AppData, Ball, Member, ScoreSession } from "./types";
import { uid } from "./types";

type Store = {
  data: AppData | null;
  loading: boolean;
  error: string | null;
  activeMember: Member | null;
  memberBalls: Ball[];
  memberSessions: ScoreSession[];
  setActiveMemberId: (id: string) => void;
  upsertBall: (ball: Ball) => Promise<void>;
  deleteBall: (id: string) => Promise<void>;
  addSession: (session: ScoreSession) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  addMember: (name: string) => Promise<void>;
  updateGroupName: (name: string) => Promise<void>;
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

  const value: Store = {
    data,
    loading,
    error,
    activeMember,
    memberBalls,
    memberSessions,
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
      await persist({ ...data, balls: data.balls.filter((b) => b.id !== id) });
    },
    addSession: async (session) => {
      if (!data) return;
      await persist({ ...data, sessions: [session, ...data.sessions] });
    },
    deleteSession: async (id) => {
      if (!data) return;
      await persist({
        ...data,
        sessions: data.sessions.filter((s) => s.id !== id),
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
    updateGroupName: async (name) => {
      if (!data || !name.trim()) return;
      await persist({ ...data, group: { ...data.group, name: name.trim() } });
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
