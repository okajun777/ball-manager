import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import catalogBalls from "../data/catalogBalls.json";
import { MemberPicker } from "../components/MemberPicker";
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
  manufacturerOfficialSearchUrl,
  manufacturerSearchUrl,
} from "../lib/brandSites";
import {
  catalogDetailFields,
  findCatalogBall,
  lookupCatalogBall,
  searchCatalogBalls,
} from "../lib/strategy";
import type { CatalogBall } from "../lib/catalogTypes";
import type { Ball, MaintenanceKind, SurfaceMaintenance } from "../lib/types";
import { MAINTENANCE_KIND_LABEL, avg, formatBallWeight, today, uid } from "../lib/types";

const catalog = catalogBalls as CatalogBall[];

const emptyForm = {
  name: "",
  brand: "",
  weightLb: "15",
  weightOz: "0",
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
    setActiveMemberId,
    isAdmin,
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
  const [brandCustom, setBrandCustom] = useState(false);
  const [weightCustom, setWeightCustom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogBall[] | null>(null);
  const [searchMessage, setSearchMessage] = useState("");

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

  const catalogMatch = useMemo(
    () => lookupCatalogBall(form.brand, form.name, catalog),
    [form.brand, form.name],
  );

  const brandSelectValue = useMemo(() => {
    if (brandCustom) return "__other__";
    if (!form.brand.trim()) return "";
    const exact = catalogBrands.find(
      (b) => b.toLowerCase() === form.brand.trim().toLowerCase(),
    );
    return exact ?? "__other__";
  }, [brandCustom, form.brand, catalogBrands]);

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
    setBrandCustom(false);
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
    setSearchQuery(c.nameJa ? `${c.name} / ${c.nameJa}` : c.name);
    setCatalogHitId(c.id);
    setSearchResults(null);
    setSearchMessage("");
  }

  function onBrandChange(brand: string) {
    setForm((prev) => ({ ...prev, brand }));
    setCatalogHitId(null);
    setSearchResults(null);
    setSearchMessage("");
  }

  function onNameChange(name: string) {
    setForm((prev) => ({ ...prev, name }));
    setCatalogHitId(null);
  }

  function runBallSearch() {
    const q = searchQuery.trim() || form.name.trim();
    if (!q) {
      setSearchResults([]);
      setSearchMessage("ボール名（英名または日本名）を入力してから検索してください。");
      return;
    }
    // メーカー未選択でも名前だけで全カタログを検索
    const hits = searchCatalogBalls(form.brand.trim(), q, catalog, form.brand.trim() ? 60 : 80);
    setSearchResults(hits);
    setSearchMessage(
      hits.length
        ? `${hits.length}件ヒットしました。一覧から選ぶとメーカー・詳細が入ります。`
        : "一致する球が見つかりませんでした。メーカーサイトで確認するか、手入力してください。",
    );
    setCatalogHitId(null);
  }

  function onBrandSelect(value: string) {
    if (value === "__other__") {
      setBrandCustom(true);
      setForm((prev) => ({ ...prev, brand: "" }));
      setCatalogHitId(null);
      setSearchResults(null);
      setSearchMessage("");
      return;
    }
    setBrandCustom(false);
    onBrandChange(value);
  }

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setCatalogHitId(null);
    setBrandCustom(false);
    setWeightCustom(false);
    setSearchQuery("");
    setSearchResults(null);
    setSearchMessage("");
    setOpen(true);
  }

  function startEdit(ball: Ball) {
    setEditing(ball);
    const known = catalogBrands.some(
      (b) => b.toLowerCase() === ball.brand.trim().toLowerCase(),
    );
    setBrandCustom(Boolean(ball.brand.trim()) && !known);
    const w = ball.weightLb?.toString() ?? "";
    setWeightCustom(Boolean(w) && !["10", "11", "12", "13", "14", "15", "16"].includes(w));
    setForm({
      name: ball.name,
      brand: ball.brand,
      weightLb: ball.weightLb?.toString() ?? "",
      weightOz: ball.weightOz != null ? String(ball.weightOz) : "0",
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
    setSearchQuery(ball.name);
    setSearchResults(null);
    setSearchMessage("");
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
      weightOz: (() => {
        const n = Number(form.weightOz);
        if (!Number.isFinite(n) || n <= 0) return null;
        return Math.min(15, Math.round(n));
      })(),
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin ? (
            <Link className="btn secondary" to="/family">
              全員の状況
            </Link>
          ) : null}
          <button className="btn" type="button" onClick={startCreate}>
            ＋ ボール追加
          </button>
        </div>
      </div>

      {isAdmin ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <MemberPicker
            members={data.members}
            value={activeMember.id}
            onChange={setActiveMemberId}
            label="管理するメンバー（管理者のみ・クラウドへ保存）"
          />
        </div>
      ) : null}

      {open && (
        <form className="card" onSubmit={onSubmit} style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>{editing ? "ボール編集" : "ボール追加"}</h3>
          {isAdmin ? (
            <MemberPicker
              members={data.members}
              value={activeMember.id}
              onChange={(id) => {
                setActiveMemberId(id);
              }}
              label="このボールの持ち主"
            />
          ) : null}
          <div className="field">
            <label>ボール名で検索 *</label>
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                style={{ flex: 1, minWidth: 0 }}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  onNameChange(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runBallSearch();
                  }
                }}
                placeholder="例: Physix / フィジックス（メーカーなしでも可）"
                required
                autoFocus={!editing}
              />
              <button className="btn" type="button" onClick={runBallSearch}>
                検索
              </button>
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--sub)", fontSize: "0.78rem" }}>
              英名・日本名どちらでも検索できます。メーカーは選ばなくても大丈夫です。
            </p>
          </div>

          <div className="field">
            <label>メーカー（任意・絞り込み）</label>
            <select
              value={brandSelectValue}
              onChange={(e) => onBrandSelect(e.target.value)}
            >
              <option value="">指定なし（全メーカー）</option>
              {catalogBrands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
              <option value="__other__">その他（手入力）</option>
            </select>
            {brandSelectValue === "__other__" ? (
              <input
                style={{ marginTop: 8 }}
                value={form.brand}
                onChange={(e) => onBrandChange(e.target.value)}
                placeholder="メーカー名を入力"
                autoFocus={brandCustom}
              />
            ) : null}
          </div>

          <div className="row">
            <div className="field">
              <label>重量 (lb)</label>
              <select
                value={
                  weightCustom
                    ? "__other__"
                    : ["10", "11", "12", "13", "14", "15", "16"].includes(form.weightLb)
                      ? form.weightLb
                      : form.weightLb.trim()
                        ? "__other__"
                        : "15"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__other__") {
                    setWeightCustom(true);
                    return;
                  }
                  setWeightCustom(false);
                  setForm((prev) => ({ ...prev, weightLb: v }));
                }}
              >
                {[10, 11, 12, 13, 14, 15, 16].map((w) => (
                  <option key={w} value={String(w)}>
                    {w} lb
                  </option>
                ))}
                <option value="__other__">その他（手入力）</option>
              </select>
              {weightCustom ||
              (form.weightLb.trim() !== "" &&
                !["10", "11", "12", "13", "14", "15", "16"].includes(form.weightLb)) ? (
                <input
                  style={{ marginTop: 8 }}
                  value={form.weightLb}
                  onChange={(e) => {
                    setWeightCustom(true);
                    setForm({ ...form, weightLb: e.target.value });
                  }}
                  placeholder="例: 14"
                  inputMode="decimal"
                />
              ) : null}
            </div>
            <div className="field">
              <label>オンス (oz)</label>
              <select
                value={
                  ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"].includes(
                    form.weightOz,
                  )
                    ? form.weightOz
                    : form.weightOz.trim()
                      ? form.weightOz
                      : "0"
                }
                onChange={(e) => setForm((prev) => ({ ...prev, weightOz: e.target.value }))}
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i} value={String(i)}>
                    {i} oz
                  </option>
                ))}
              </select>
              <p style={{ margin: "6px 0 0", color: "var(--sub)", fontSize: "0.78rem" }}>
                例: 15lb 2oz → ポンド15・オンス2
              </p>
            </div>
          </div>

          {searchResults ? (
            <div style={{ marginBottom: 12 }}>
              <p style={{ color: "var(--sub)", fontSize: "0.85rem", margin: "0 0 8px" }}>
                {searchMessage}
                {form.brand.trim() ? `（メーカー絞り込み: ${form.brand}）` : "（全メーカー）"}
              </p>
              {searchResults.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    maxHeight: 320,
                    overflow: "auto",
                    padding: 8,
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "#fff",
                  }}
                >
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => applyCatalog(c)}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        textAlign: "left",
                        width: "100%",
                        padding: 8,
                        border:
                          catalogHitId === c.id
                            ? "2px solid var(--accent)"
                            : "1px solid var(--line)",
                        borderRadius: 8,
                        background: catalogHitId === c.id ? "var(--accent-soft)" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      {c.imageUrl ? (
                        <img
                          src={publicUrl(c.imageUrl)}
                          alt=""
                          style={{
                            width: 48,
                            height: 48,
                            objectFit: "contain",
                            borderRadius: 6,
                            flex: "0 0 auto",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 6,
                            background: "#eef2f7",
                            flex: "0 0 auto",
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>
                          {c.brand} {c.name}
                        </div>
                        {c.nameJa ? (
                          <div style={{ color: "var(--ink)", fontSize: "0.88rem" }}>{c.nameJa}</div>
                        ) : null}
                        <div style={{ color: "var(--sub)", fontSize: "0.82rem" }}>
                          {[c.coverType, c.coreType, c.releaseMonth, c.finish]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </div>
                      <span style={{ color: "var(--accent)", fontSize: "0.85rem", flex: "0 0 auto" }}>
                        選択
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                className="form-actions"
                style={{ justifyContent: "flex-start", flexWrap: "wrap", marginTop: 8 }}
              >
                {makerSearchUrl ? (
                  <a className="btn secondary" href={makerSearchUrl} target="_blank" rel="noreferrer">
                    {brandSite?.japanUrl ? "代理店サイトで検索" : "メーカー公式で検索"}
                  </a>
                ) : null}
                {brandSite?.japanUrl && makerOfficialSearchUrl ? (
                  <a
                    className="btn secondary"
                    href={makerOfficialSearchUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    公式サイトで検索
                  </a>
                ) : null}
              </div>
            </div>
          ) : (
            <p style={{ color: "var(--sub)", fontSize: "0.85rem", marginTop: 0 }}>
              ボール名を入れて「検索」→一覧から選んでください。メーカーは任意です。
            </p>
          )}

          {catalogHitId && catalogMatch ? (
            <p style={{ color: "var(--good)", fontSize: "0.88rem", marginTop: 0 }}>
              選択中: {catalogMatch.brand} {catalogMatch.name}
              {catalogMatch.nameJa ? `（${catalogMatch.nameJa}）` : ""}（詳細を反映済み）
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
          <div className="row">
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
                inputMode="numeric"
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
                      {formatBallWeight(b)}
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
