import { useMemo, useState } from "react";
import { findAdminMemberId } from "../lib/identity";
import { useStore } from "../lib/store";

export function IdentityGate() {
  const { data, claimAsMember, unlockAdmin, hasAdminPin } = useStore();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pendingOwnerId, setPendingOwnerId] = useState<string | null>(null);

  const members = useMemo(() => data?.members ?? [], [data]);
  const ownerId = useMemo(() => findAdminMemberId(members), [members]);

  if (!data) return null;

  if (pendingOwnerId) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
        <h2 style={{ marginTop: 0 }}>PIN</h2>
        <div className="field">
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

  return (
    <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h2 style={{ marginTop: 0 }}>誰が使いますか？</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {members.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn"
            onClick={() => {
              if (ownerId && m.id === ownerId) {
                setPendingOwnerId(m.id);
                return;
              }
              claimAsMember(m.id);
            }}
          >
            {m.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
