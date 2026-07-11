import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { APP_PUBLIC_URL, readInviteFromLocation } from "../lib/appUrl";
import { ROUND1_VIEWER_URL } from "../lib/round1";
import { useStore } from "../lib/store";

const links = [
  { to: "/", label: "ダッシュボード", end: true },
  { to: "/balls", label: "マイボール" },
  { to: "/catalog", label: "カタログ" },
  { to: "/scores", label: "スコア入力" },
  { to: "/analysis", label: "分析" },
  { to: "/strategy", label: "攻略AI" },
  { to: "/settings", label: "設定・共有" },
];

export function Layout() {
  const { data, activeMember, setActiveMemberId, loading, error } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const code = readInviteFromLocation();
    if (!code) return;
    if (!/\/settings\/?$/.test(location.pathname)) {
      navigate(`/settings?invite=${encodeURIComponent(code)}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Ball Manager
          <small>{data?.group.name ?? "読み込み中…"}</small>
        </div>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="member-switch">
          <label htmlFor="member">表示メンバー</label>
          <select
            id="member"
            value={activeMember?.id ?? ""}
            onChange={(e) => setActiveMemberId(e.target.value)}
            disabled={!data}
          >
            {data?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName}
              </option>
            ))}
          </select>
        </div>
        <a className="ext-link" href={APP_PUBLIC_URL} target="_blank" rel="noreferrer">
          公開URLを開く ↗
        </a>
        <a className="ext-link" href={ROUND1_VIEWER_URL} target="_blank" rel="noreferrer">
          ROUND1 プロショップ ↗
        </a>
      </aside>
      <main className="main">
        {loading && <div className="card empty">読み込み中…</div>}
        {error && <div className="card empty">エラー: {error}</div>}
        {!loading && !error && <Outlet />}
      </main>
    </div>
  );
}
