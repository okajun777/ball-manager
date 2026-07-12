import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ROUND1_QUEUE_URL,
  fetchRound1Queue,
  fetchRound1StoreWait,
  formatWait,
  loadRound1FavoriteStoreIds,
  waitLevelOf,
  type Round1QueueData,
  type Round1QueueStore,
  type Round1StoreWaitPatch,
} from "../lib/round1";

function levelColor(store: Round1QueueStore): string {
  const lvl = waitLevelOf(store);
  if (lvl === "free") return "var(--good)";
  if (lvl === "light") return "var(--warn)";
  if (lvl === "busy") return "#c8102e";
  return "var(--sub)";
}

export function Round1QueueWidget() {
  const [data, setData] = useState<Round1QueueData | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Round1StoreWaitPatch>>({});
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [favIds, setFavIds] = useState(() => loadRound1FavoriteStoreIds());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setFavIds(loadRound1FavoriteStoreIds());
      const q = await fetchRound1Queue();
      setData(q);
      setOverrides({});
      setError(null);
      setRowError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const favorites = useMemo(() => {
    if (!data) return [] as Round1QueueStore[];
    const byId = new Map(data.stores.map((s) => [s.id, s]));
    return favIds
      .map((id) => {
        const base = byId.get(id);
        if (!base) return null;
        const patch = overrides[id];
        return patch ? { ...base, ...patch } : base;
      })
      .filter((s): s is Round1QueueStore => Boolean(s));
  }, [data, favIds, overrides]);

  const refreshStore = async (storeId: string) => {
    setRefreshingId(storeId);
    setRowError(null);
    try {
      const patch = await fetchRound1StoreWait(storeId);
      setOverrides((prev) => ({ ...prev, [storeId]: patch }));
    } catch (e) {
      setRowError(e instanceof Error ? e.message : "更新に失敗しました");
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ marginTop: 0, marginBottom: 4 }}>ラウンドワン 混雑状況</h3>
          <p style={{ color: "var(--sub)", fontSize: "0.88rem", margin: 0 }}>
            {loading
              ? "読み込み中…"
              : data
                ? `お気に入り ${favorites.length} 店舗${
                    data.updated_at_display ? ` ／ 一覧更新 ${data.updated_at_display}` : ""
                  }`
                : "混雑状況を表示できません"}
          </p>
        </div>
        <a className="btn secondary" href={ROUND1_QUEUE_URL} target="_blank" rel="noreferrer">
          一覧を開く
        </a>
      </div>

      {error && (
        <p style={{ color: "#b42318", fontSize: "0.88rem", marginBottom: 0 }}>{error}</p>
      )}
      {rowError && (
        <p style={{ color: "#b42318", fontSize: "0.88rem", marginBottom: 0 }}>{rowError}</p>
      )}

      {!error && !loading && data && (
        <>
          {favorites.length > 0 ? (
            <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
              {favorites.map((store) => {
                const wait = formatWait(store);
                const busy = refreshingId === store.id;
                return (
                  <li
                    key={store.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      padding: "8px 0",
                      borderTop: "1px solid var(--line)",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <a
                          href={store.queue_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontWeight: 700 }}
                        >
                          ★ {store.name}
                        </a>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{
                            padding: "4px 10px",
                            fontSize: "0.75rem",
                            borderRadius: 999,
                          }}
                          disabled={busy}
                          onClick={() => void refreshStore(store.id)}
                        >
                          {busy ? "更新中…" : "更新"}
                        </button>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--sub)", marginTop: 2 }}>
                        {store.prefecture}
                        {store.update_time ? ` · ${store.update_time}` : ""}
                        {overrides[store.id] ? " · たった今取得" : ""}
                      </div>
                    </div>
                    <a
                      href={store.queue_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ textAlign: "right" }}
                    >
                      <div style={{ fontWeight: 800, color: levelColor(store) }}>{wait.label}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--sub)" }}>{wait.detail}</div>
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p style={{ color: "var(--sub)", fontSize: "0.88rem", margin: "12px 0 0" }}>
              お気に入り店舗がまだありません。一覧で ★ を付けると、ここに混雑状況が表示されます。
            </p>
          )}
        </>
      )}
    </div>
  );
}
