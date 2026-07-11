import { useMemo, useState } from "react";
import { findAdminMemberId } from "../lib/identity";
import { useStore } from "../lib/store";

export function IdentityGate() {
  const { data, claimAsMember, unlockAdmin, hasAdminPin } = useStore();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);

  const members = useMemo(() => data?.members ?? [], [data]);
  const adminId = useMemo(() => findAdminMemberId(members), [members]);
  const regularMembers = useMemo(
    () => members.filter((m) => m.id !== adminId),
    [members, adminId],
  );

  if (!data) return null;

  return (
    <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h2
        style={{ marginTop: 0, userSelect: "none" }}
        onClick={() => {
          const n = titleClicks + 1;
          setTitleClicks(n);
          if (n >= 5) {
            setShowPin(true);
            setTitleClicks(0);
          }
        }}
      >
        誰が使いますか？
      </h2>

      <div style={{ display: "grid", gap: 8 }}>
        {regularMembers.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn"
            onClick={() => claimAsMember(m.id)}
          >
            {m.displayName}
          </button>
        ))}
      </div>

      {showPin ? (
        <div style={{ marginTop: 16 }}>
          <div className="field">
            <label>PIN</label>
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
            />
          </div>
          {pinError ? (
            <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{pinError}</p>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={() => {
              const res = unlockAdmin(pin);
              if (!res.ok) setPinError(res.error || "違います");
            }}
          >
            {hasAdminPin ? "開く" : "設定して開く"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
