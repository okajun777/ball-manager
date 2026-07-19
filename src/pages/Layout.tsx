import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { APP_PUBLIC_URL, stripLegacyInviteFromLocation } from "../lib/appUrl";
import { consumeOsakaDeepLink } from "../lib/osakaBowling";
import { ROUND1_QUEUE_URL } from "../lib/round1";
import { useStore } from "../lib/store";
import { IdentityGate } from "./IdentityGate";

const mainLinks = [
  { to: "/", label: "ホーム", end: true },
  { to: "/balls", label: "ボール" },
  { to: "/catalog", label: "カタログ" },
  { to: "/compare", label: "比較" },
  { to: "/scores", label: "スコア" },
  { to: "/analysis", label: "分析" },
  { to: "/strategy", label: "攻略" },
];

export function Layout() {
  const { deviceMember, needsIdentity, loading, error, logout } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const blocked = needsIdentity;

  useEffect(() => {
    stripLegacyInviteFromLocation();
  }, []);

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
        <div className="sidebar-top">
          <div className="brand">
            Ball Manager
            <small>ログインIDで端末共通</small>
          </div>
          {!blocked ? (
            <div className="sidebar-user">
              <span className="sidebar-user-name">{deviceMember?.displayName ?? "—"}</span>
              <button type="button" className="sidebar-logout" onClick={() => logout()}>
                ログアウト
              </button>
            </div>
          ) : null}
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

        <a className="ext-link" href={APP_PUBLIC_URL} target="_blank" rel="noreferrer">
          公開URLを開く ↗
        </a>
        <a className="ext-link" href={ROUND1_QUEUE_URL} target="_blank" rel="noreferrer">
          ラウンドワン ↗
        </a>
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
