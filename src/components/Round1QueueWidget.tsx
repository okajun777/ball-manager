import { useEffect, useMemo, useState } from "react";
import { loadUserPrefs } from "../lib/prefs";
import {
  ROUND1_QUEUE_URL,
  fetchRound1Queue,
  formatWait,
  loadRound1FavoriteStoreIds,
  matchRound1Store,
  waitLevelOf,
  type Round1QueueData,
  type Round1QueueStore,
} from "../lib/round1";

const MAX_ROWS = 6;

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

  const defaultShop = loadUserPrefs().defaultShop;
  const favIds = useMemo(() => new Set(loadRound1FavoriteStoreIds()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const q = await fetchRound1Queue();
        if (!cancelled) {
          setData(q);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "読み込みに失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const myStore = useMemo(() => {
    if (!data) return null;
    return matchRound1Store(data.stores, defaultShop);
  }, [data, defaultShop]);

  const rows = useMemo(() => {
    if (!data) return [] as Array<{ store: Round1QueueStore; tag?: string }>;

    const picked: Array<{ store: Round1QueueStore; tag?: string }> = [];
    const seen = new Set<string>();

    const push = (store: Round1QueueStore | null | undefined, tag?: string) => {
      if (!store || seen.has(store.id)) return;
      seen.add(store.id);
      picked.push({ store, tag });
    };

    // よく使う店舗は上の強調枠で出すので、一覧には重ねない
    if (myStore) seen.add(myStore.id);

    for (const id of favIds) {
      push(
        data.stores.find((s) => s.id === id),
        "★",
      );
      if (picked.length >= MAX_ROWS) break;
    }

    const waiting = [...data.stores]
      .filter((s) => waitLevelOf(s) === "light" || waitLevelOf(s) === "busy")
      .sort((a, b) => (b.wait_time ?? 0) - (a.wait_time ?? 0));

    for (const s of waiting) {
      if (picked.length >= MAX_ROWS) break;
      push(s);
    }

    // 待ちが少ない時間帯は空き店舗も少し出す
    if (picked.length < 3) {
      for (const s of data.stores) {
        if (picked.length >= Math.min(4, MAX_ROWS)) break;
        if (waitLevelOf(s) === "free") push(s);
      }
    }

    return picked;
  }, [data, favIds, myStore]);

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
                ? `更新 ${data.updated_at_display} ／ 待ちあり ${data.waiting_count} 店舗`
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
          {myStore && (
            <div
              style={{
                marginTop: 12,
                padding: "10px 12px",
                borderRadius: 10,
                background: "var(--accent-soft)",
                border: "1px solid var(--line)",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "var(--sub)", marginBottom: 2 }}>
                よく使う店舗（設定）
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "baseline",
                }}
              >
                <strong>{myStore.name}</strong>
                <span style={{ fontWeight: 800, color: levelColor(myStore) }}>
                  {formatWait(myStore).label}
                </span>
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--sub)" }}>
                {formatWait(myStore).detail}
                {myStore.update_time ? ` · 公式 ${myStore.update_time}` : ""}
              </div>
            </div>
          )}

          {!myStore && defaultShop.trim() && (
            <p style={{ color: "var(--sub)", fontSize: "0.85rem", marginBottom: 0 }}>
              「{defaultShop}」に一致するROUND1店舗が見つかりませんでした。設定の店舗名を「南砂店」のようにすると強調表示されます。
            </p>
          )}

          <ul style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
            {rows.map(({ store, tag }) => {
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
                  <a href={store.queue_url} target="_blank" rel="noreferrer">
                    <div style={{ fontWeight: 700 }}>
                      {store.name}
                      {tag ? (
                        <span
                          style={{
                            marginLeft: 6,
                            fontSize: "0.72rem",
                            fontWeight: 700,
                            color: "var(--sub)",
                          }}
                        >
                          {tag}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "var(--sub)" }}>
                      {store.prefecture}
                      {store.update_time ? ` · ${store.update_time}` : ""}
                    </div>
                  </a>
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

          {!rows.length && (
            <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginBottom: 0 }}>
              表示できる店舗がありません。
            </p>
          )}
        </>
      )}
    </div>
  );
}
