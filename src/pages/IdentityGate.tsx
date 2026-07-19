import { useState } from "react";
import { forceAppUpdate } from "../lib/appUrl";
import { useStore } from "../lib/store";

type Mode = "login" | "firstPassword" | "bootstrap";

/** ログインID＋パスワード。どの端末からでも同じアカウントで入れる */
export function IdentityGate() {
  const { login, setPasswordAndLogin, bootstrapAdmin, needsSetup } = useStore();
  const [mode, setMode] = useState<Mode>("login");
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

  if (mode === "bootstrap") {
    return (
      <div className="card" style={{ maxWidth: 420, width: "100%", margin: "16px auto" }}>
        <h2 style={{ marginTop: 0 }}>この端末で新規作成</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          既にアカウントがある方は使わないでください。通常は「ログイン」から入ってください。
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
          <label>ログインID（英数字）</label>
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
              void run(() =>
                bootstrapAdmin(loginId, password, displayName.trim() || "淳司").then(() => ({
                  ok: true as const,
                })),
              );
            }}
          >
            作成して入る
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
            ログインに戻る
          </button>
        </div>
      </div>
    );
  }

  if (mode === "firstPassword") {
    return (
      <div className="card" style={{ maxWidth: 420, width: "100%", margin: "16px auto" }}>
        <h2 style={{ marginTop: 0 }}>初回パスワード設定</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          パスワードがまだ無いアカウント向けです。設定後は通常ログインできます。
        </p>
        <div className="field">
          <label>ログインID（英数字）</label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="junji"
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

  return (
    <div className="card" style={{ maxWidth: 420, width: "100%", margin: "16px auto" }}>
      <h2 style={{ marginTop: 0 }}>ログイン</h2>
      <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
        ログインID（英数字）とパスワードで入ります。別のスマホでも同じIDで入れます。
      </p>
      {needsSetup ? (
        <p style={{ color: "var(--sub)", fontSize: "0.82rem", marginTop: 0 }}>
          この端末にデータが無くても、既存のIDでログインできます。
        </p>
      ) : null}
      <div className="field">
        <label>ログインID（英数字）</label>
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
      </div>
      <p style={{ margin: "14px 0 0", fontSize: "0.78rem", color: "var(--sub)" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode("firstPassword");
            setFormError("");
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent)",
            cursor: "pointer",
            textDecoration: "underline",
            font: "inherit",
          }}
        >
          初回パスワード設定
        </button>
        {" · "}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!confirm("古い表示のときはキャッシュを消して最新版を読み込みます。")) return;
            void forceAppUpdate();
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--accent)",
            cursor: "pointer",
            textDecoration: "underline",
            font: "inherit",
          }}
        >
          最新版に更新
        </button>
        {" · "}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setMode("bootstrap");
            setFormError("");
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "var(--sub)",
            cursor: "pointer",
            textDecoration: "underline",
            font: "inherit",
          }}
        >
          端末の新規作成
        </button>
      </p>
    </div>
  );
}
