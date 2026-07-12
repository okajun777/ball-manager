import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ROUND1_QUEUE_URL,
  fetchRound1Queue,
  formatWait,
  loadRound1FavoriteStoreIds,
  waitLevelOf,
  type Round1QueueData,
  type Round1QueueStore,
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [favIds, setFavIds] = useState(() => loadRound1FavoriteStoreIds());

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setFavIds(loadRound1FavoriteStoreIds());
      const q = await fetchRound1Queue();
      setData(q);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const favorites = useMemo(() => {
    if (!data) return [] as Round1QueueStore[];
    const byId = new Map(data.stores.map((s) => [s.id, s]));
    return favIds
      .map((id) => byId.get(id))
      .filter((s): s is Round1QueueStore => Boolean(s));
  }, [data, favIds]);

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
                    data.updated_at_display ? ` ／ 更新 ${data.updated_at_display}` : ""
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

      {!error && !loading && data && (
        <>
          {favorites.length > 0 ? (
            <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
              {favorites.map((store) => {
                const wait = formatWait(store);
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
                          disabled={refreshing}
                          onClick={() => void load(true)}
                        >
                          {refreshing ? "更新中…" : "更新"}
                        </button>
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--sub)", marginTop: 2 }}>
                        {store.prefecture}
                        {store.update_time ? ` · ${store.update_time}` : ""}
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
