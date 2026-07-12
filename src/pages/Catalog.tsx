import { useMemo, useState } from "react";
import catalogBalls from "../data/catalogBalls.json";
import { MemberPicker } from "../components/MemberPicker";
import { useStore } from "../lib/store";
import type { CatalogBall } from "../lib/catalogTypes";
import { publicUrl } from "../lib/paths";
import { ROUND1_VIEWER_URL, round1SearchUrl } from "../lib/round1";
import { manufacturerOfficialSearchUrl, manufacturerSearchUrl } from "../lib/brandSites";
import { catalogDetailFields } from "../lib/strategy";
import { today, uid } from "../lib/types";

const balls = catalogBalls as CatalogBall[];

export function Catalog() {
  const { data, activeMember, setActiveMemberId, memberBalls, upsertBall } = useStore();
  const [brand, setBrand] = useState("");
  const [cover, setCover] = useState("");
  const [core, setCore] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<CatalogBall | null>(null);

  const brands = useMemo(
    () => [...new Set(balls.map((b) => b.brand))].sort((a, b) => a.localeCompare(b, "ja")),
    [],
  );
  const covers = useMemo(
    () => [...new Set(balls.map((b) => b.coverType).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")),
    [],
  );
  const cores = useMemo(
    () => [...new Set(balls.map((b) => b.coreType).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja")),
    [],
  );

  const ownedNames = useMemo(
    () => new Set(memberBalls.map((b) => b.name.toLowerCase())),
    [memberBalls],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return balls.filter((b) => {
      if (brand && b.brand !== brand) return false;
      if (cover && b.coverType !== cover) return false;
      if (core && b.coreType !== core) return false;
      if (query) {
        const hay = `${b.name} ${b.brand} ${b.coverName} ${b.coreName}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [brand, cover, core, q]);

  async function addOwned(ball: CatalogBall) {
    if (!data || !activeMember) return;
    if (ownedNames.has(ball.name.toLowerCase())) {
      alert("すでにマイボールにあります");
      return;
    }
    const details = catalogDetailFields(ball);
    await upsertBall({
      id: uid("ball"),
      groupId: data.group.id,
      memberId: activeMember.id,
      name: ball.name,
      brand: ball.brand,
      weightLb: 15,
      purchasedOn: today(),
      shopName: "",
      drillerName: "",
      drilledOn: "",
      price: null,
      layoutNote: "",
      surfaceNote: details.surfaceNote,
      memo: details.memo,
      coverName: details.coverName,
      coverType: details.coverType,
      coreName: details.coreName,
      coreType: details.coreType,
      rg: details.rg,
      diff: details.diff,
      mb: details.mb,
      releaseMonth: details.releaseMonth,
    });
    alert(`${ball.name} をマイボールに追加しました`);
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>カタログ</h1>
          <p>メーカー別のボール種類・タイプ一覧（{filtered.length} / {balls.length}）</p>
        </div>
        <a className="btn secondary" href={ROUND1_VIEWER_URL} target="_blank" rel="noreferrer">
          ROUND1商品を見る
        </a>
      </div>

      {data && activeMember ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <MemberPicker
            members={data.members}
            value={activeMember.id}
            onChange={setActiveMemberId}
            label="マイボールに追加するメンバー（クラウドへ保存）"
          />
        </div>
      ) : null}

      <div className="card" style={{ marginBottom: 14, background: "#fff5f5", borderColor: "#fecaca" }}>
        <strong style={{ color: "#9a0c22" }}>ROUND1 プロショップ</strong>
        <p style={{ margin: "6px 0 10px", color: "var(--sub)", fontSize: "0.9rem" }}>
          r1b.jp の最新価格・在庫をカテゴリ別に検索できます。カタログの球名でそのまま探せます。
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn" href={round1SearchUrl(q || undefined)} target="_blank" rel="noreferrer">
            {q.trim() ? `「${q.trim()}」をROUND1で検索` : "ボール一覧を開く"}
          </a>
          <a
            className="btn secondary"
            href={round1SearchUrl(undefined, "shoes")}
            target="_blank"
            rel="noreferrer"
          >
            シューズ
          </a>
          <a
            className="btn secondary"
            href={round1SearchUrl(undefined, "bag")}
            target="_blank"
            rel="noreferrer"
          >
            バッグ
          </a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row three">
          <div className="field">
            <label>キーワード</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="名前・ブランド"
            />
          </div>
          <div className="field">
            <label>メーカー</label>
            <select value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">すべて</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>カバータイプ</label>
            <select value={cover} onChange={(e) => setCover(e.target.value)}>
              <option value="">すべて</option>
              {covers.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row">
          <div className="field">
            <label>コア</label>
            <select value={core} onChange={(e) => setCore(e.target.value)}>
              <option value="">すべて</option>
              {cores.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ justifyContent: "end" }}>
            <label>&nbsp;</label>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setBrand("");
                setCover("");
                setCore("");
                setQ("");
              }}
            >
              リセット
            </button>
          </div>
        </div>
      </div>

      <div className="grid cards">
        {filtered.map((b) => {
          const owned = ownedNames.has(b.name.toLowerCase());
          return (
            <article className="card" key={b.id}>
              <button
                type="button"
                onClick={() => setSelected(b)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    aspectRatio: "1/1",
                    background: "#f1f5f9",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: 10,
                  }}
                >
                  {b.imageUrl ? (
                    <img
                      src={publicUrl(b.imageUrl)}
                      alt={b.name}
                      loading="lazy"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : null}
                </div>
                <div className="ball-brand">{b.brand}</div>
                <div className="ball-title">{b.name}</div>
                <div className="ball-meta">
                  {b.coreType || "コア—"} · {b.coverType || "カバー—"}
                  <br />
                  RG {b.rg ?? "—"} / Diff {b.diff ?? "—"}
                  {b.mb != null ? ` / MB ${b.mb}` : ""}
                </div>
              </button>
              <div className="form-actions">
                <button className="btn secondary" type="button" onClick={() => setSelected(b)}>
                  詳細
                </button>
                <a
                  className="btn secondary"
                  href={round1SearchUrl(b.name)}
                  target="_blank"
                  rel="noreferrer"
                >
                  ROUND1
                </a>
                <button
                  className="btn"
                  type="button"
                  disabled={owned}
                  onClick={() => void addOwned(b)}
                >
                  {owned ? "所持済" : "所持に追加"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {selected && (
        <div
          role="dialog"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16,35,63,0.45)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 50,
          }}
          onClick={() => setSelected(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ball-brand">{selected.brand}</div>
            <h2 style={{ margin: "4px 0 10px" }}>{selected.name}</h2>
            {selected.imageUrl && (
              <img
                src={publicUrl(selected.imageUrl)}
                alt={selected.name}
                style={{
                  width: "50%",
                  display: "block",
                  margin: "0 auto 12px",
                  objectFit: "contain",
                }}
              />
            )}
            <table className="table">
              <tbody>
                <tr>
                  <th>カバー</th>
                  <td>
                    {selected.coverName}
                    <div style={{ color: "var(--sub)" }}>{selected.coverType}</div>
                  </td>
                </tr>
                <tr>
                  <th>コア</th>
                  <td>
                    {selected.coreName}
                    <div style={{ color: "var(--sub)" }}>{selected.coreType}</div>
                  </td>
                </tr>
                <tr>
                  <th>RG / Diff / MB</th>
                  <td>
                    {selected.rg ?? "—"} / {selected.diff ?? "—"} / {selected.mb ?? "—"}
                  </td>
                </tr>
                <tr>
                  <th>仕上げ</th>
                  <td>{selected.finish || "—"}</td>
                </tr>
                <tr>
                  <th>メモ</th>
                  <td>{selected.memo || "—"}</td>
                </tr>
                <tr>
                  <th>発売</th>
                  <td>{selected.releaseMonth || "—"}</td>
                </tr>
              </tbody>
            </table>
            <div className="form-actions">
              <button className="btn secondary" type="button" onClick={() => setSelected(null)}>
                閉じる
              </button>
              <a
                className="btn secondary"
                href={manufacturerSearchUrl(selected.brand, selected.name)}
                target="_blank"
                rel="noreferrer"
              >
                メーカーサイトで検索
              </a>
              <a
                className="btn secondary"
                href={manufacturerOfficialSearchUrl(selected.brand, selected.name)}
                target="_blank"
                rel="noreferrer"
              >
                公式サイトで検索
              </a>
              <a
                className="btn secondary"
                href={round1SearchUrl(selected.name)}
                target="_blank"
                rel="noreferrer"
              >
                ROUND1で価格を見る
              </a>
              <button
                className="btn"
                type="button"
                disabled={ownedNames.has(selected.name.toLowerCase())}
                onClick={() => void addOwned(selected)}
              >
                所持に追加
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
