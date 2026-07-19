import { useState } from "react";
import { Link, NavLink, Navigate, Outlet } from "react-router-dom";
import { APP_PUBLIC_URL, appEntryUrl } from "../lib/appUrl";
import { useStore } from "../lib/store";

const adminLinks = [
  { to: "/admin", label: "全員の状況", end: true },
  { to: "/admin/balls", label: "ボール管理" },
  { to: "/admin/scores", label: "スコア入力" },
  { to: "/admin/catalog", label: "カタログ追加" },
  { to: "/admin/analysis", label: "分析" },
  { to: "/admin/settings", label: "設定" },
];

function AdminPinGate() {
  const { unlockAdmin, hasAdminPin } = useStore();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2 style={{ marginTop: 0 }}>確認</h2>
      <div className="field">
        <label>ロック番号（4桁）</label>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
            setPinError("");
          }}
          placeholder="••••"
          autoComplete="off"
          autoFocus
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            const res = unlockAdmin(pin);
            if (!res.ok) setPinError(res.error || "違います");
          }}
        />
      </div>
      {pinError ? (
        <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{pinError}</p>
      ) : null}
      <div className="form-actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const res = unlockAdmin(pin);
            if (!res.ok) setPinError(res.error || "違います");
          }}
        >
          {hasAdminPin ? "開く" : "番号を設定して開く"}
        </button>
        <Link className="btn secondary" to="/">
          戻る
        </Link>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const {
    data,
    activeMember,
    deviceMember,
    setActiveMemberId,
    adminUnlocked,
    lockAdmin,
    loading,
    error,
    needsSetup,
  } = useStore();

  if (loading) return <div className="card empty">読み込み中…</div>;
  if (error) return <div className="card empty">エラー: {error}</div>;
  // 淳司（isSelf）以外には存在しないように見せる
  if (needsSetup || !deviceMember?.isSelf) {
    return <Navigate to="/" replace />;
  }
  if (!adminUnlocked) return <AdminPinGate />;

  const entryUrl = appEntryUrl();

  return (
    <div className="app-shell">
      <aside className="sidebar" style={{ background: "#1a1028" }}>
        <div className="brand">
          管理
          <small>淳司</small>
        </div>
        <div className="nav-row">
          <nav className="nav">
            {adminLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-member-row">
          <div className="member-switch">
            <label htmlFor="admin-member">編集するメンバー</label>
            <select
              id="admin-member"
              value={activeMember?.id ?? ""}
              onChange={(e) => setActiveMemberId(e.target.value)}
              disabled={!data}
            >
              {data?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {m.isSelf ? "（自分）" : ""}
                </option>
              ))}
            </select>
            <p style={{ margin: "6px 0 0", fontSize: "0.72rem", opacity: 0.7 }}>
              保存はクラウドへ書き込みます
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn secondary"
          style={{ margin: "0 8px" }}
          onClick={() => lockAdmin()}
        >
          終了（ロック）
        </button>
        <a className="ext-link" href={entryUrl}>
          通常画面へ ↗
        </a>
        <a className="ext-link" href={APP_PUBLIC_URL} target="_blank" rel="noreferrer">
          公開URL ↗
        </a>
      </aside>
      <main className="main">
        <div
          className="card"
          style={{
            marginBottom: 14,
            background: "#f5f0ff",
            borderColor: "#d8b4fe",
            padding: "10px 14px",
          }}
        >
          <strong>編集中</strong>
          <span style={{ color: "var(--sub)", fontSize: "0.88rem", marginLeft: 8 }}>
            {activeMember?.displayName ?? "—"}
          </span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
