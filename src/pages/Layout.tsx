import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { APP_PUBLIC_URL, appAdminUrl } from "../lib/appUrl";
import { consumeOsakaDeepLink } from "../lib/osakaBowling";
import { ROUND1_QUEUE_URL } from "../lib/round1";
import { useStore } from "../lib/store";
import { IdentityGate } from "./IdentityGate";

const mainLinks = [
  { to: "/", label: "ダッシュボード", end: true },
  { to: "/balls", label: "マイボール" },
  { to: "/catalog", label: "カタログ" },
  { to: "/compare", label: "比較チャート" },
  { to: "/scores", label: "スコア入力" },
  { to: "/analysis", label: "分析" },
  { to: "/strategy", label: "攻略AI" },
];

export function Layout() {
  const { deviceMember, needsSetup, needsIdentity, loading, error, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const blocked = needsSetup || needsIdentity;

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
          <small>ログインIDで端末共通</small>
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
            設定
          </NavLink>
        </div>

        {!blocked ? (
          <div className="sidebar-member-row">
            <div className="member-switch">
              <label>ログイン中</label>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                {deviceMember?.displayName ?? "—"}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "0.72rem", opacity: 0.7 }}>
                {deviceMember?.loginId ? `ID: ${deviceMember.loginId}` : "アカウント"}
              </p>
            </div>
          </div>
        ) : null}

        <a className="ext-link" href={APP_PUBLIC_URL} target="_blank" rel="noreferrer">
          公開URLを開く ↗
        </a>
        <a className="ext-link" href={ROUND1_QUEUE_URL} target="_blank" rel="noreferrer">
          ラウンドワン ↗
        </a>
        <a className="ext-link" href={appAdminUrl()} style={{ opacity: 0.55 }}>
          管理者画面
        </a>
        {!blocked ? (
          <button
            type="button"
            onClick={() => logout()}
            style={{
              marginTop: "auto",
              alignSelf: "flex-end",
              background: "none",
              border: "none",
              padding: "4px 2px",
              fontSize: "0.68rem",
              color: "inherit",
              opacity: 0.4,
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ログアウト
          </button>
        ) : null}
      </aside>
      <main className="main">
        {loading && <div className="card empty">読み込み中…</div>}
        {error && <div className="card empty">エラー: {error}</div>}
        {!loading && !error && blocked && <IdentityGate />}
        {!loading && !error && !blocked && <Outlet />}
      </main>
    </div>
  );
}
