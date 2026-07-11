import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { APP_PUBLIC_URL, readInviteFromLocation } from "../lib/appUrl";
import { consumeOsakaDeepLink } from "../lib/osakaBowling";
import { ROUND1_VIEWER_URL } from "../lib/round1";
import { useStore } from "../lib/store";

const mainLinks = [
  { to: "/", label: "ダッシュボード", end: true },
  { to: "/balls", label: "マイボール" },
  { to: "/catalog", label: "カタログ" },
  { to: "/scores", label: "スコア入力" },
  { to: "/analysis", label: "分析" },
  { to: "/strategy", label: "攻略AI" },
];

export function Layout() {
  const {
    data,
    activeMember,
    deviceMember,
    isAdmin,
    setActiveMemberId,
    setDeviceMemberId,
    loading,
    error,
  } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const code = readInviteFromLocation();
    if (!code) return;
    if (!/\/settings\/?$/.test(location.pathname)) {
      navigate(`/settings?invite=${encodeURIComponent(code)}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    const linked = consumeOsakaDeepLink(location.search);
    if (!linked) return;
    const params = new URLSearchParams(location.search);
    ["osaka", "name", "osakaName", "date", "osakaDate", "venue", "osakaVenue", "patternPdf", "detailPdf", "goto", "id"].forEach(
      (k) => params.delete(k),
    );
    const qs = params.toString();
    const path =
      linked.goto === "scores"
        ? `/scores?tournament=1`
        : linked.goto === "strategy"
          ? "/strategy"
          : `${location.pathname}${qs ? `?${qs}` : ""}`;
    navigate(path, { replace: true });
    if (linked.patternPdf || linked.name) {
      alert(
        `大会情報を取り込みました: ${linked.name || "大会"}${
          linked.patternPdf ? "（オイルパターンあり）" : ""
        }`,
      );
    }
  }, [location.search, location.pathname, navigate]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Ball Manager
          <small>{data?.group.name ?? "読み込み中…"}</small>
        </div>
        <div className="nav-row">
          <nav className="nav">
            {mainLinks.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/settings" className="nav-settings">
            設定・共有
          </NavLink>
        </div>

        <div className="sidebar-member-row">
          <div className="member-switch">
            <label htmlFor="device-member">この端末の利用者</label>
            <select
              id="device-member"
              value={deviceMember?.id ?? ""}
              onChange={(e) => setDeviceMemberId(e.target.value)}
              disabled={!data}
            >
              {data?.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                  {m.isSelf ? "（管理者）" : ""}
                </option>
              ))}
            </select>
            <p style={{ margin: "6px 0 0", color: "var(--sub)", fontSize: "0.78rem", lineHeight: 1.4 }}>
              {isAdmin
                ? "管理者モード: 全員のデータを表示・管理できます"
                : "自分のデータだけ表示されます"}
            </p>
          </div>

          {isAdmin ? (
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
          ) : (
            <div className="member-switch">
              <label>表示中</label>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                {activeMember?.displayName ?? "—"}
              </div>
            </div>
          )}
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
