import { useState } from "react";
import type { FormEvent } from "react";
import { useStore } from "../lib/store";
import {
  buildMaintDueList,
  loadMaintReminderSettings,
} from "../lib/maintReminder";
import { round1SearchUrl } from "../lib/round1";
import type { Ball, MaintenanceKind, SurfaceMaintenance } from "../lib/types";
import { MAINTENANCE_KIND_LABEL, today, uid } from "../lib/types";

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
};

export function MyBalls() {
  const {
    data,
    activeMember,
    memberBalls,
    memberRetiredBalls,
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

  const [maintOpen, setMaintOpen] = useState(false);
  const [maintBallId, setMaintBallId] = useState("");
  const [maintDoneOn, setMaintDoneOn] = useState(today());
  const [maintKind, setMaintKind] = useState<MaintenanceKind>("clean");
  const [maintGrit, setMaintGrit] = useState("");
  const [maintNote, setMaintNote] = useState("");

  if (!data || !activeMember) return null;

  const reminder = loadMaintReminderSettings();
  const dueMap = new Map(
    buildMaintDueList({
      balls: memberBalls,
      maintenances: memberMaintenances,
      intervalDays: reminder.intervalDays,
    }).map((d) => [d.ballId, d]),
  );

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
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
    });
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
              <label>ボール名 *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label>ブランド</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              />
            </div>
          </div>
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
              <label>表面</label>
              <input
                value={form.surfaceNote}
                onChange={(e) => setForm({ ...form, surfaceNote: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label>レイアウト</label>
            <input
              value={form.layoutNote}
              onChange={(e) => setForm({ ...form, layoutNote: e.target.value })}
            />
          </div>
          <div className="field">
            <label>メモ</label>
            <textarea
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
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
            return (
              <div className="card" key={b.id}>
                <div className="ball-brand">{b.brand || "ブランド未設定"}</div>
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
                <div className="ball-meta">
                  {b.weightLb ? `${b.weightLb}lb` : "重量—"}
                  {" · "}購入 {b.purchasedOn || "—"}
                  <br />
                  ショップ {b.shopName || "—"}
                  <br />
                  ドリラー {b.drillerName || "—"}
                  {b.drilledOn ? `（${b.drilledOn}）` : ""}
                  <br />
                  {last
                    ? `最終メンテ: ${last.doneOn} ${MAINTENANCE_KIND_LABEL[last.kind]}${last.grit ? ` / ${last.grit}` : ""}`
                    : "最終メンテ: —"}
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
          <div className="empty">まだありません</div>
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
