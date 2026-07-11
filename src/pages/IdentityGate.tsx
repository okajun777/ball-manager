import { useMemo, useState } from "react";
import { clearInviteFromLocation, readInviteFromLocation } from "../lib/appUrl";
import { findAdminMemberId } from "../lib/identity";
import { useStore } from "../lib/store";

type Mode = "home" | "start" | "join" | "ownerPin";

export function IdentityGate() {
  const { data, claimAsMember, unlockAdmin, hasAdminPin, joinGroup, startPersonalGroup } =
    useStore();
  const inviteFromUrl = useMemo(() => readInviteFromLocation() ?? "", []);
  const [mode, setMode] = useState<Mode>(() => (inviteFromUrl ? "join" : "home"));
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pendingOwnerId, setPendingOwnerId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [joinCode, setJoinCode] = useState(inviteFromUrl);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const members = useMemo(() => data?.members ?? [], [data]);
  const ownerId = useMemo(() => findAdminMemberId(members), [members]);
  const pendingName =
    members.find((m) => m.id === pendingOwnerId)?.displayName ?? "";

  if (!data) return null;

  if (mode === "ownerPin" && pendingOwnerId) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>{pendingName}</h2>
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
              setPendingOwnerId(null);
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
        <div className="field">
          <label>ロック番号（4桁・あとで使う）</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 4));
              setFormError("");
            }}
            placeholder="••••"
            autoComplete="off"
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
                  await startPersonalGroup(displayName, pin);
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
      <h2 style={{ marginTop: 0 }}>はじめる</h2>
      <div style={{ display: "grid", gap: 8 }}>
        <button type="button" className="btn" onClick={() => setMode("start")}>
          新しく始める
        </button>
        <button type="button" className="btn secondary" onClick={() => setMode("join")}>
          招待コードで参加
        </button>
      </div>

      {members.length > 0 ? (
        <>
          <h3 style={{ marginTop: 20, marginBottom: 8 }}>このグループのメンバー</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                className="btn secondary"
                onClick={() => {
                  if (ownerId && m.id === ownerId) {
                    setPendingOwnerId(m.id);
                    setMode("ownerPin");
                    return;
                  }
                  claimAsMember(m.id);
                }}
              >
                {m.displayName}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
