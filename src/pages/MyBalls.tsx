import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import catalogBalls from "../data/catalogBalls.json";
import { useStore } from "../lib/store";
import {
  buildMaintDueList,
  loadMaintReminderSettings,
} from "../lib/maintReminder";
import { publicUrl } from "../lib/paths";
import { round1SearchUrl } from "../lib/round1";
import {
  findBrandSite,
  listKnownBrands,
  manufacturerHomeUrl,
  manufacturerOfficialSearchUrl,
  manufacturerSearchUrl,
} from "../lib/brandSites";
import {
  catalogDetailFields,
  findCatalogBall,
  lookupCatalogBall,
} from "../lib/strategy";
import type { CatalogBall } from "../lib/catalogTypes";
import type { Ball, MaintenanceKind, SurfaceMaintenance } from "../lib/types";
import { MAINTENANCE_KIND_LABEL, avg, today, uid } from "../lib/types";

const catalog = catalogBalls as CatalogBall[];

const emptyForm = {
  name: "",
  brand: "",
  weightLb: "15",
  purchasedOn: today(),
  shopName: "",
  drillerName: "",
  drilledOn: "",
  price: "",
  layoutNote: "",
  surfaceNote: "",
  memo: "",
  coverName: "",
  coverType: "",
  coreName: "",
  coreType: "",
  rg: "",
  diff: "",
  mb: "",
  releaseMonth: "",
};

export function MyBalls() {
  const {
    data,
    activeMember,
    memberBalls,
    memberRetiredBalls,
    memberSessions,
    upsertBall,
    deleteBall,
    setBallRetired,
    memberMaintenances,
    addMaintenance,
    deleteMaintenance,
  } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ball | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [catalogHitId, setCatalogHitId] = useState<string | null>(null);

  const [maintOpen, setMaintOpen] = useState(false);
  const [maintBallId, setMaintBallId] = useState("");
  const [maintDoneOn, setMaintDoneOn] = useState(today());
  const [maintKind, setMaintKind] = useState<MaintenanceKind>("clean");
  const [maintGrit, setMaintGrit] = useState("");
  const [maintNote, setMaintNote] = useState("");

  const catalogBrands = useMemo(() => {
    const fromCatalog = catalog.map((b) => b.brand);
    return [...new Set([...listKnownBrands(), ...fromCatalog])].sort((a, b) =>
      a.localeCompare(b, "ja"),
    );
  }, []);

  const nameSuggestions = useMemo(() => {
    const brand = form.brand.trim().toLowerCase();
    const list = brand
      ? catalog.filter((b) => b.brand.toLowerCase() === brand)
      : catalog;
    return list
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ja"))
      .map((b) => b.name);
  }, [form.brand]);

  const catalogMatch = useMemo(
    () => lookupCatalogBall(form.brand, form.name, catalog),
    [form.brand, form.name],
  );

  const brandSite = useMemo(() => findBrandSite(form.brand), [form.brand]);
  const makerSearchUrl = useMemo(() => {
    if (!form.brand.trim() || !form.name.trim()) return "";
    return manufacturerSearchUrl(form.brand, form.name);
  }, [form.brand, form.name]);
  const makerOfficialSearchUrl = useMemo(() => {
    if (!form.brand.trim() || !form.name.trim()) return "";
    return manufacturerOfficialSearchUrl(form.brand, form.name);
  }, [form.brand, form.name]);

  const ballStats = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const s of memberSessions) {
      for (const g of s.games) {
        if (!g.ballId) continue;
        const list = map.get(g.ballId) ?? [];
        list.push(g.score);
        map.set(g.ballId, list);
      }
    }
    return map;
  }, [memberSessions]);

  if (!data || !activeMember) return null;

  const reminder = loadMaintReminderSettings();
  const dueMap = new Map(
    buildMaintDueList({
      balls: memberBalls,
      maintenances: memberMaintenances,
      intervalDays: reminder.intervalDays,
    }).map((d) => [d.ballId, d]),
  );

  function applyCatalog(c: CatalogBall) {
    const details = catalogDetailFields(c);
    setForm((prev) => ({
      ...prev,
      name: c.name,
      brand: c.brand,
      surfaceNote: details.surfaceNote || prev.surfaceNote,
      memo: details.memo || prev.memo,
      coverName: details.coverName,
      coverType: details.coverType,
      coreName: details.coreName,
      coreType: details.coreType,
      rg: details.rg != null ? String(details.rg) : "",
      diff: details.diff != null ? String(details.diff) : "",
      mb: details.mb != null ? String(details.mb) : "",
      releaseMonth: details.releaseMonth,
    }));
    setCatalogHitId(c.id);
  }

  function onBrandChange(brand: string) {
    const hit = lookupCatalogBall(brand, form.name, catalog);
    if (hit && form.name.trim()) {
      applyCatalog(hit);
      return;
    }
    setForm((prev) => ({ ...prev, brand }));
    setCatalogHitId(null);
  }

  function onNameChange(name: string) {
    const hit = lookupCatalogBall(form.brand, name, catalog);
    const exact = Boolean(
      hit && hit.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (hit && exact) {
      applyCatalog(hit);
      return;
    }
    setForm((prev) => ({ ...prev, name }));
    setCatalogHitId(hit && name.trim().length >= 3 ? hit.id : null);
  }

  function onNameBlur() {
    if (!form.name.trim()) return;
    const hit = lookupCatalogBall(form.brand, form.name, catalog);
    if (hit) applyCatalog(hit);
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCatalogHitId(null);
    setOpen(true);
  }

  function startEdit(ball: Ball) {
    setEditing(ball);
    setForm({
      name: ball.name,
      brand: ball.brand,
      weightLb: ball.weightLb?.toString() ?? "",
      purchasedOn: ball.purchasedOn,
      shopName: ball.shopName,
      drillerName: ball.drillerName,
      drilledOn: ball.drilledOn,
      price: ball.price?.toString() ?? "",
      layoutNote: ball.layoutNote,
      surfaceNote: ball.surfaceNote,
      memo: ball.memo,
      coverName: ball.coverName ?? "",
      coverType: ball.coverType ?? "",
      coreName: ball.coreName ?? "",
      coreType: ball.coreType ?? "",
      rg: ball.rg != null ? String(ball.rg) : "",
      diff: ball.diff != null ? String(ball.diff) : "",
      mb: ball.mb != null ? String(ball.mb) : "",
      releaseMonth: ball.releaseMonth ?? "",
    });
    setCatalogHitId(lookupCatalogBall(ball.brand, ball.name, catalog)?.id ?? null);
    setOpen(true);
  }

  function openMaint(ballId: string) {
    setMaintBallId(ballId);
    setMaintDoneOn(today());
    setMaintKind("clean");
    setMaintGrit("");
    setMaintNote("");
    setMaintOpen(true);
  }

  function lastMaintFor(ballId: string): SurfaceMaintenance | undefined {
    return memberMaintenances
      .filter((m) => m.ballId === ballId)
      .slice()
      .sort((a, b) => b.doneOn.localeCompare(a.doneOn))[0];
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const num = (v: string) => {
      const n = Number(v);
      return v.trim() && Number.isFinite(n) ? n : null;
    };
    const ball: Ball = {
      id: editing?.id ?? uid("ball"),
      groupId: data!.group.id,
      memberId: activeMember!.id,
      name: form.name.trim(),
      brand: form.brand.trim(),
      weightLb: form.weightLb ? Number(form.weightLb) : null,
      purchasedOn: form.purchasedOn,
      shopName: form.shopName.trim(),
      drillerName: form.drillerName.trim(),
      drilledOn: form.drilledOn,
      price: form.price ? Number(form.price) : null,
      layoutNote: form.layoutNote.trim(),
      surfaceNote: form.surfaceNote.trim(),
      memo: form.memo.trim(),
      coverName: form.coverName.trim(),
      coverType: form.coverType.trim(),
      coreName: form.coreName.trim(),
      coreType: form.coreType.trim(),
      rg: num(form.rg),
      diff: num(form.diff),
      mb: num(form.mb),
      releaseMonth: form.releaseMonth.trim(),
      retired: editing?.retired ?? false,
    };
    await upsertBall(ball);
    setOpen(false);
  }

  async function onMaintSubmit(e: FormEvent) {
    e.preventDefault();
    if (!maintBallId) {
      alert("ボールを選択してください");
      return;
    }
    const item: SurfaceMaintenance = {
      id: uid("mnt"),
      groupId: data!.group.id,
      memberId: activeMember!.id,
      ballId: maintBallId,
      doneOn: maintDoneOn,
      kind: maintKind,
      grit: maintGrit.trim(),
      note: maintNote.trim(),
    };
    await addMaintenance(item);
    setMaintOpen(false);
    setMaintGrit("");
    setMaintNote("");
  }

  const ballName = (id: string) => memberBalls.find((b) => b.id === id)?.name ?? "—";

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>マイボール</h1>
          <p>
            {activeMember.displayName} の所持ボール（{memberBalls.length}
            {memberRetiredBalls.length ? ` / 引退 ${memberRetiredBalls.length}` : ""}）
          </p>
        </div>
        <button className="btn" type="button" onClick={startCreate}>
          ＋ ボール追加
        </button>
      </div>

      {open && (
        <form className="card" onSubmit={onSubmit} style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>{editing ? "ボール編集" : "ボール追加"}</h3>
          <div className="row">
            <div className="field">
              <label>メーカー</label>
              <input
                list="myball-brand-list"
                value={form.brand}
                onChange={(e) => onBrandChange(e.target.value)}
                placeholder="Storm / Motiv など"
              />
              <datalist id="myball-brand-list">
                {catalogBrands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label>ボール名 *</label>
              <input
                list="myball-name-list"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
                onBlur={onNameBlur}
                placeholder="メーカー選択後に候補が出ます"
                required
              />
              <datalist id="myball-name-list">
                {nameSuggestions.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </div>

          {makerSearchUrl ? (
            <div
              style={{
                marginBottom: 12,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>メーカーサイトで詳細を検索</div>
              <p style={{ margin: "0 0 8px", color: "var(--sub)", fontSize: "0.85rem" }}>
                {brandSite
                  ? `${brandSite.brand} の${brandSite.japanUrl ? "日本代理店／" : ""}公式情報からスペックを確認できます。`
                  : "メーカー名で Web 検索します。"}
              </p>
              <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                <a className="btn" href={makerSearchUrl} target="_blank" rel="noreferrer">
                  {brandSite?.japanUrl ? "代理店サイトで検索" : "メーカー公式で検索"}
                </a>
                {brandSite?.japanUrl ? (
                  <a
                    className="btn secondary"
                    href={makerOfficialSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    公式サイトで検索
                  </a>
                ) : null}
                {manufacturerHomeUrl(form.brand) ? (
                  <a
                    className="btn secondary"
                    href={manufacturerHomeUrl(form.brand)!}
                    target="_blank"
                    rel="noreferrer"
                  >
                    公式トップ
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--sub)", fontSize: "0.85rem", marginTop: 0 }}>
              メーカーとボール名を入れると、各メーカーサイトでの検索ボタンが出ます。
            </p>
          )}

          {catalogMatch ? (
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 12,
                padding: 10,
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: catalogHitId === catalogMatch.id ? "var(--accent-soft)" : "#fff",
              }}
            >
              {catalogMatch.imageUrl ? (
                <img
                  src={publicUrl(catalogMatch.imageUrl)}
                  alt={catalogMatch.name}
                  style={{ width: 56, height: 56, objectFit: "contain", borderRadius: 8 }}
                />
              ) : null}
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>
                  {catalogMatch.brand} {catalogMatch.name}
                </div>
                <div style={{ color: "var(--sub)", fontSize: "0.85rem" }}>
                  {[catalogMatch.coverType, catalogMatch.coreType, catalogMatch.finish]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <button
                className="btn secondary"
                type="button"
                onClick={() => applyCatalog(catalogMatch)}
              >
                カタログ詳細を反映
              </button>
            </div>
          ) : form.name.trim().length >= 2 ? (
            <p style={{ color: "var(--sub)", fontSize: "0.85rem", marginTop: 0 }}>
              内蔵カタログに一致がありません。上のメーカーサイト検索で確認して手入力してください。
            </p>
          ) : null}

          <h4 style={{ margin: "8px 0 10px" }}>詳細情報</h4>
          <div className="row">
            <div className="field">
              <label>カバー名</label>
              <input
                value={form.coverName}
                onChange={(e) => setForm({ ...form, coverName: e.target.value })}
                placeholder="例: R2S パール"
              />
            </div>
            <div className="field">
              <label>カバータイプ</label>
              <input
                list="myball-cover-type-list"
                value={form.coverType}
                onChange={(e) => setForm({ ...form, coverType: e.target.value })}
                placeholder="例: パール・リアクティブ"
              />
              <datalist id="myball-cover-type-list">
                {[
                  "ソリッド・リアクティブ",
                  "パール・リアクティブ",
                  "ハイブリッド・リアクティブ",
                  "ソリッド・ウレタン",
                  "ポリエステル",
                ].map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>コア名</label>
              <input
                value={form.coreName}
                onChange={(e) => setForm({ ...form, coreName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>コアタイプ</label>
              <input
                list="myball-core-type-list"
                value={form.coreType}
                onChange={(e) => setForm({ ...form, coreType: e.target.value })}
                placeholder="対称コア / 非対称コア"
              />
              <datalist id="myball-core-type-list">
                <option value="対称コア" />
                <option value="非対称コア" />
              </datalist>
            </div>
          </div>
          <div className="row three">
            <div className="field">
              <label>RG</label>
              <input
                value={form.rg}
                onChange={(e) => setForm({ ...form, rg: e.target.value })}
                placeholder="2.48"
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label>Diff</label>
              <input
                value={form.diff}
                onChange={(e) => setForm({ ...form, diff: e.target.value })}
                placeholder="0.050"
                inputMode="decimal"
              />
            </div>
            <div className="field">
              <label>MB / PSA</label>
              <input
                value={form.mb}
                onChange={(e) => setForm({ ...form, mb: e.target.value })}
                placeholder="0.021"
                inputMode="decimal"
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>表面仕上げ</label>
              <input
                value={form.surfaceNote}
                onChange={(e) => setForm({ ...form, surfaceNote: e.target.value })}
                placeholder="例: 1500 grit / Power Edge"
              />
            </div>
            <div className="field">
              <label>発売年月</label>
              <input
                value={form.releaseMonth}
                onChange={(e) => setForm({ ...form, releaseMonth: e.target.value })}
                placeholder="YYYY-MM"
              />
            </div>
          </div>

          <h4 style={{ margin: "14px 0 10px" }}>購入・ドリル</h4>
          <div className="row three">
            <div className="field">
              <label>重量 (lb)</label>
              <input
                value={form.weightLb}
                onChange={(e) => setForm({ ...form, weightLb: e.target.value })}
              />
            </div>
            <div className="field">
              <label>購入日</label>
              <input
                type="date"
                value={form.purchasedOn}
                onChange={(e) => setForm({ ...form, purchasedOn: e.target.value })}
              />
            </div>
            <div className="field">
              <label>価格</label>
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="40810"
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>購入ショップ</label>
              <input
                value={form.shopName}
                onChange={(e) => setForm({ ...form, shopName: e.target.value })}
              />
            </div>
            <div className="field">
              <label>ドリラー</label>
              <input
                value={form.drillerName}
                onChange={(e) => setForm({ ...form, drillerName: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>ドリル日</label>
              <input
                type="date"
                value={form.drilledOn}
                onChange={(e) => setForm({ ...form, drilledOn: e.target.value })}
              />
            </div>
            <div className="field">
              <label>レイアウト</label>
              <input
                value={form.layoutNote}
                onChange={(e) => setForm({ ...form, layoutNote: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>メモ</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder="使い方のメモなど"
            />
          </div>
          <div className="form-actions">
            <button className="btn secondary" type="button" onClick={() => setOpen(false)}>
              キャンセル
            </button>
            <button className="btn" type="submit">
              保存
            </button>
          </div>
        </form>
      )}

      {maintOpen && (
        <form className="card" onSubmit={onMaintSubmit} style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>表面メンテ記録</h3>
          <div className="row three">
            <div className="field">
              <label>日付 *</label>
              <input
                type="date"
                value={maintDoneOn}
                onChange={(e) => setMaintDoneOn(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label>ボール *</label>
              <select
                value={maintBallId}
                onChange={(e) => setMaintBallId(e.target.value)}
                required
              >
                {memberBalls.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>種類 *</label>
              <select
                value={maintKind}
                onChange={(e) => setMaintKind(e.target.value as MaintenanceKind)}
              >
                {(Object.keys(MAINTENANCE_KIND_LABEL) as MaintenanceKind[]).map((k) => (
                  <option key={k} value={k}>
                    {MAINTENANCE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>番手 / 仕上げ</label>
              <input
                value={maintGrit}
                onChange={(e) => setMaintGrit(e.target.value)}
                placeholder="1000 / 工場仕上げ"
              />
            </div>
            <div className="field">
              <label>メモ</label>
              <input
                value={maintNote}
                onChange={(e) => setMaintNote(e.target.value)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn secondary" type="button" onClick={() => setMaintOpen(false)}>
              キャンセル
            </button>
            <button className="btn" type="submit">
              保存
            </button>
          </div>
        </form>
      )}

      {!memberBalls.length ? (
        <div className="card empty">まだボールがありません。追加してください。</div>
      ) : (
        <div className="grid cards">
          {memberBalls.map((b) => {
            const last = lastMaintFor(b.id);
            const due = dueMap.get(b.id);
            const cat = findCatalogBall(b, catalog);
            const img = cat?.imageUrl ? publicUrl(cat.imageUrl) : "";
            return (
              <div className="card ball-card" key={b.id}>
                <div className="ball-card-top">
                  {img ? (
                    <img
                      className="ball-card-img"
                      src={img}
                      alt={b.name}
                      loading="lazy"
                    />
                  ) : null}
                  <div className="ball-card-body">
                    <div className="ball-brand">{b.brand || cat?.brand || "ブランド未設定"}</div>
                    <div className="ball-title">
                      {b.name}
                      {reminder.enabled && due && due.status !== "ok" ? (
                        <span
                          className="badge"
                          style={{
                            marginLeft: 8,
                            background: "#fff1e6",
                            color: "var(--warn)",
                            verticalAlign: "middle",
                          }}
                        >
                          {due.status === "never" ? "メンテ未記録" : "要メンテ"}
                        </span>
                      ) : null}
                    </div>
                    <div className="ball-meta" style={{ marginBottom: 4 }}>
                      {[
                        b.coverType || cat?.coverType,
                        b.coreType || cat?.coreType,
                        b.rg != null || cat?.rg != null
                          ? `RG ${b.rg ?? cat?.rg}`
                          : "",
                        b.diff != null || cat?.diff != null
                          ? `Diff ${b.diff ?? cat?.diff}`
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" · ") || "詳細未入力"}
                    </div>
                    <div className="ball-meta">
                      {b.weightLb ? `${b.weightLb}lb` : "重量—"}
                      {" · "}購入 {b.purchasedOn || "—"}
                      <br />
                      ショップ {b.shopName || "—"}
                      <br />
                      ドリラー {b.drillerName || "—"}
                      {b.drilledOn ? `（${b.drilledOn}）` : ""}
                      <br />
                      {(() => {
                        const scores = ballStats.get(b.id) ?? [];
                        return scores.length
                          ? `成績: 平均 ${avg(scores)} / 最高 ${Math.max(...scores)}（${scores.length}G）`
                          : "成績: まだなし";
                      })()}
                      <br />
                      {last
                        ? `最終メンテ: ${last.doneOn} ${MAINTENANCE_KIND_LABEL[last.kind]}${last.grit ? ` / ${last.grit}` : ""}`
                        : "最終メンテ: —"}
                    </div>
                  </div>
                </div>
                <div className="form-actions">
                  <a
                    className="btn secondary"
                    href={round1SearchUrl(b.name)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    ROUND1
                  </a>
                  <button className="btn secondary" type="button" onClick={() => openMaint(b.id)}>
                    メンテ記録
                  </button>
                  <button className="btn secondary" type="button" onClick={() => startEdit(b)}>
                    編集
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => void setBallRetired(b.id, true)}
                  >
                    引退
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={() => {
                      if (confirm(`${b.name} を削除しますか？`)) void deleteBall(b.id);
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {memberRetiredBalls.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>引退したボール</h3>
          <p style={{ color: "var(--sub)", fontSize: "0.88rem", marginTop: 0 }}>
            スコア選択・攻略AIの候補からは外れます。過去の記録はそのまま残ります。
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {memberRetiredBalls.map((b) => (
              <li
                key={b.id}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 8,
                }}
              >
                <span>
                  <strong>{b.name}</strong>
                  {b.brand ? `（${b.brand}）` : ""}
                </span>
                <button
                  className="btn secondary"
                  type="button"
                  onClick={() => void setBallRetired(b.id, false)}
                >
                  復帰
                </button>
                <button
                  className="btn danger"
                  type="button"
                  onClick={() => {
                    if (confirm(`${b.name} を完全削除しますか？`)) void deleteBall(b.id);
                  }}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>最近のメンテ</h3>
        {!memberMaintenances.length ? (
          <p style={{ color: "var(--sub)", fontSize: "0.88rem", margin: 0 }}>まだありません</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>日付</th>
                <th>ボール</th>
                <th>種類</th>
                <th>番手</th>
                <th>メモ</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {memberMaintenances.slice(0, 30).map((m) => (
                <tr key={m.id}>
                  <td>{m.doneOn}</td>
                  <td>{ballName(m.ballId)}</td>
                  <td>{MAINTENANCE_KIND_LABEL[m.kind]}</td>
                  <td>{m.grit || "—"}</td>
                  <td>{m.note || "—"}</td>
                  <td>
                    <button
                      className="btn danger"
                      type="button"
                      onClick={() => {
                        if (confirm("このメンテ記録を削除しますか？")) void deleteMaintenance(m.id);
                      }}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
