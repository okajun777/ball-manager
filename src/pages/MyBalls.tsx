import { useState } from "react";
import type { FormEvent } from "react";
import { useStore } from "../lib/store";
import type { Ball } from "../lib/types";
import { today, uid } from "../lib/types";

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
  const { data, activeMember, memberBalls, upsertBall, deleteBall } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ball | null>(null);
  const [form, setForm] = useState(emptyForm);

  if (!data || !activeMember) return null;

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
    };
    await upsertBall(ball);
    setOpen(false);
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>マイボール</h1>
          <p>{activeMember.displayName} の所持ボール（{memberBalls.length}）</p>
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

      {!memberBalls.length ? (
        <div className="card empty">まだボールがありません。追加してください。</div>
      ) : (
        <div className="grid cards">
          {memberBalls.map((b) => (
            <div className="card" key={b.id}>
              <div className="ball-brand">{b.brand || "ブランド未設定"}</div>
              <div className="ball-title">{b.name}</div>
              <div className="ball-meta">
                {b.weightLb ? `${b.weightLb}lb` : "重量—"}
                {" · "}購入 {b.purchasedOn || "—"}
                <br />
                ショップ {b.shopName || "—"}
                <br />
                ドリラー {b.drillerName || "—"}
                {b.drilledOn ? `（${b.drilledOn}）` : ""}
              </div>
              <div className="form-actions">
                <button className="btn secondary" type="button" onClick={() => startEdit(b)}>
                  編集
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
          ))}
        </div>
      )}
    </div>
  );
}
