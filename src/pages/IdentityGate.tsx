import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";

type Mode = "login" | "register" | "bootstrap" | "firstPassword";

/** ログインID＋パスワード。どの端末からでも同じアカウントで入れる */
export function IdentityGate() {
  const {
    login,
    setPasswordAndLogin,
    registerAccount,
    bootstrapAdmin,
    needsSetup,
  } = useStore();
  const [mode, setMode] = useState<Mode>(() => (needsSetup ? "bootstrap" : "login"));
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  async function run(action: () => Promise<{ ok: boolean; error?: string } | void>) {
    setBusy(true);
    setFormError("");
    try {
      const res = await action();
      if (res && !res.ok) setFormError(res.error || "失敗しました");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "失敗しました");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "bootstrap" || needsSetup) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>管理者アカウント作成</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          最初の管理者（淳司）を作ります。このIDとパスワードでどの端末からも入れます。
        </p>
        <div className="field">
          <label>表示名</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="淳司"
          />
        </div>
        <div className="field">
          <label>ログインID</label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="junji"
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="field">
          <label>パスワード（4文字以上）</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label>パスワード（確認）</label>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {formError ? (
          <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{formError}</p>
        ) : null}
        <div className="form-actions" style={{ justifyContent: "flex-start" }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (password !== password2) {
                setFormError("パスワードが一致しません");
                return;
              }
              void run(() =>
                bootstrapAdmin(loginId, password, displayName.trim() || "淳司").then(() => ({
                  ok: true as const,
                })),
              );
            }}
          >
            作成して入る
          </button>
        </div>
      </div>
    );
  }

  if (mode === "firstPassword") {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>初回パスワード設定</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          既存アカウントでまだパスワードがない場合に一度だけ設定します（表示名から自動採番されたログインID）。
        </p>
        <div className="field">
          <label>ログインID</label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="junji / harumi など"
            autoComplete="username"
            autoFocus
          />
        </div>
        <div className="field">
          <label>新しいパスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label>パスワード（確認）</label>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {formError ? (
          <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{formError}</p>
        ) : null}
        <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (password !== password2) {
                setFormError("パスワードが一致しません");
                return;
              }
              void run(() => setPasswordAndLogin(loginId, password));
            }}
          >
            設定して入る
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setMode("login");
              setFormError("");
            }}
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  if (mode === "register") {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>新規登録</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          自分用のログインIDとパスワードを作ります。どの端末からでも同じIDで入れます。
        </p>
        <div className="field">
          <label>表示名</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例: 太郎"
            autoFocus
          />
        </div>
        <div className="field">
          <label>ログインID（英数字）</label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="taro"
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label>パスワード（4文字以上）</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="field">
          <label>パスワード（確認）</label>
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {formError ? (
          <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{formError}</p>
        ) : null}
        <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (password !== password2) {
                setFormError("パスワードが一致しません");
                return;
              }
              void run(() => registerAccount(loginId, password, displayName));
            }}
          >
            登録して入る
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setMode("login");
              setFormError("");
            }}
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h2 style={{ marginTop: 0 }}>ログイン</h2>
      <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
        ログインIDとパスワードで入ります。端末が変わっても同じアカウントを使えます。
        管理者画面は <Link to="/admin">/admin</Link> です。
      </p>
      <div className="field">
        <label>ログインID</label>
        <input
          value={loginId}
          onChange={(e) => {
            setLoginId(e.target.value);
            setFormError("");
          }}
          placeholder="junji"
          autoComplete="username"
          autoFocus
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void run(() => login(loginId, password));
          }}
        />
      </div>
      <div className="field">
        <label>パスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFormError("");
          }}
          autoComplete="current-password"
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            void run(() => login(loginId, password));
          }}
        />
      </div>
      {formError ? (
        <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{formError}</p>
      ) : null}
      <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void run(() => login(loginId, password))}
        >
          ログイン
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setMode("register");
            setFormError("");
          }}
        >
          新規登録
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={busy}
          onClick={() => {
            setMode("firstPassword");
            setFormError("");
          }}
        >
          初回パスワード設定
        </button>
      </div>
    </div>
  );
}
