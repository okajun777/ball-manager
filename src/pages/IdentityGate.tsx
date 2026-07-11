import { useMemo, useState } from "react";
import { findAdminMemberId } from "../lib/identity";
import { useStore } from "../lib/store";

/** 初回起動時: 一般メンバー選択 or 管理者PIN。淳司を選ぶだけでは管理者になれない。 */
export function IdentityGate() {
  const { data, claimAsMember, unlockAdmin, hasAdminPin } = useStore();
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [showAdmin, setShowAdmin] = useState(false);

  const members = useMemo(() => data?.members ?? [], [data]);
  const adminId = useMemo(() => findAdminMemberId(members), [members]);
  const regularMembers = useMemo(
    () => members.filter((m) => m.id !== adminId),
    [members, adminId],
  );

  if (!data) return null;

  return (
    <div className="card" style={{ maxWidth: 420, margin: "24px auto" }}>
      <h2 style={{ marginTop: 0 }}>この端末は誰が使いますか？</h2>
      <p style={{ color: "var(--sub)", fontSize: "0.9rem" }}>
        自分の名前を選ぶと、その人のデータだけ表示されます。管理者モードはPINが必要です（名前を選ぶだけでは入れません）。
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
        {regularMembers.map((m) => (
          <button
            key={m.id}
            type="button"
            className="btn"
            onClick={() => claimAsMember(m.id)}
          >
            {m.displayName} として使う
          </button>
        ))}
        {!regularMembers.length ? (
          <p style={{ color: "var(--sub)", fontSize: "0.88rem" }}>
            一般メンバーがまだいません。管理者で入ってメンバーを追加してください。
          </p>
        ) : null}
      </div>

      {!showAdmin ? (
        <button
          type="button"
          className="btn secondary"
          onClick={() => setShowAdmin(true)}
        >
          管理者で入る（PIN）
        </button>
      ) : (
        <div>
          <div className="field">
            <label>
              {hasAdminPin
                ? "管理者PIN（4桁）"
                : "管理者PINを新規設定（4桁）"}
            </label>
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
          <div className="form-actions" style={{ justifyContent: "flex-start" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const res = unlockAdmin(pin);
                if (!res.ok) setPinError(res.error || "入れませんでした");
              }}
            >
              管理者で開く
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setShowAdmin(false);
                setPin("");
                setPinError("");
              }}
            >
              戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
