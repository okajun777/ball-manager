import { useMemo, useState } from "react";
import { clearInviteFromLocation, readInviteFromLocation } from "../lib/appUrl";
import { useStore } from "../lib/store";

type Mode = "home" | "start" | "join" | "ownerPin";

/** 初回セットアップ、またはこの端末の利用者選択（一般は名前のみ／管理者はPIN） */
export function IdentityGate() {
  const {
    claimByDisplayName,
    unlockAdmin,
    hasAdminPin,
    joinGroup,
    startPersonalGroup,
    needsSetup,
  } = useStore();
  const inviteFromUrl = useMemo(() => readInviteFromLocation() ?? "", []);
  const [mode, setMode] = useState<Mode>(() => (inviteFromUrl ? "join" : "home"));
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState(inviteFromUrl);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  if (mode === "ownerPin") {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>管理者として開く</h2>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
          全員のボール・スコアをクラウド上で管理できます。ロック番号（4桁）を入力してください。
        </p>
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
              if (!res.ok) {
                setPinError(res.error || "違います");
                return;
              }
            }}
          >
            {hasAdminPin ? "開く" : "設定して開く"}
          </button>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setMode("home");
              setPin("");
              setPinError("");
            }}
          >
            戻る
          </button>
        </div>
      </div>
    );
  }

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
          : "一般の方は自分の名前だけ入力してください。管理者だけがロック番号を使います。"}
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
            <button type="button" className="btn secondary" onClick={() => setMode("ownerPin")}>
              管理者として開く
            </button>
          </div>
        </>
      )}
    </div>
  );
}
