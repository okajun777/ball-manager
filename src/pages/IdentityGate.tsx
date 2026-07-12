import { useMemo, useState } from "react";
import { clearInviteFromLocation, readInviteFromLocation } from "../lib/appUrl";
import { useStore } from "../lib/store";

type Mode = "home" | "start" | "join";

/** 通常画面：名前だけ / 招待参加。管理者は /admin へ */
export function IdentityGate() {
  const { claimByDisplayName, joinGroup, startPersonalGroup, needsSetup } = useStore();
  const inviteFromUrl = useMemo(() => readInviteFromLocation() ?? "", []);
  const [mode, setMode] = useState<Mode>(() => (inviteFromUrl ? "join" : "home"));
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState(inviteFromUrl);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  if (mode === "start") {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>新しく始める</h2>
        <div className="field">
          <label>あなたの表示名</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例: 太郎"
            autoFocus
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
              void (async () => {
                setBusy(true);
                setFormError("");
                try {
                  await startPersonalGroup(displayName);
                } catch (e) {
                  setFormError(e instanceof Error ? e.message : "開始に失敗しました");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            始める
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setMode("home");
              setFormError("");
            }}
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

  if (mode === "join") {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>招待コードで参加</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          名前を入れるだけで参加できます（PINは不要です）。
        </p>
        <div className="field">
          <label>招待コード</label>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="招待コード"
            autoFocus={!inviteFromUrl}
          />
        </div>
        <div className="field">
          <label>あなたの表示名</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例: 太郎"
            autoFocus={Boolean(inviteFromUrl)}
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
              void (async () => {
                setBusy(true);
                setFormError("");
                try {
                  await joinGroup(joinCode, displayName);
                  clearInviteFromLocation();
                } catch (e) {
                  setFormError(e instanceof Error ? e.message : "参加に失敗しました");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            参加する
          </button>
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setMode("home");
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
      <h2 style={{ marginTop: 0 }}>{needsSetup ? "はじめる" : "この端末の利用者"}</h2>
      <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
        データはクラウドに保存されます。
        {needsSetup
          ? "新規作成か招待コードで参加してください。"
          : "自分の名前だけ入力してください。全員の管理は管理者画面（/admin）から行います。"}
      </p>

      {needsSetup ? (
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" className="btn" onClick={() => setMode("start")}>
            新しく始める
          </button>
          <button type="button" className="btn secondary" onClick={() => setMode("join")}>
            招待コードで参加
          </button>
        </div>
      ) : (
        <>
          <div className="field">
            <label>あなたの名前</label>
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setFormError("");
              }}
              placeholder="登録した表示名"
              autoFocus
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const res = claimByDisplayName(displayName);
                if (!res.ok) setFormError(res.error || "入れませんでした");
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
              onClick={() => {
                const res = claimByDisplayName(displayName);
                if (!res.ok) setFormError(res.error || "入れませんでした");
              }}
            >
              入る
            </button>
            <button type="button" className="btn secondary" onClick={() => setMode("join")}>
              招待コードで参加
            </button>
          </div>
        </>
      )}
    </div>
  );
}
