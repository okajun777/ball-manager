import type { Member } from "../lib/types";

/** フォーム上で登録先メンバーを選ぶ */
export function MemberPicker({
  members,
  value,
  onChange,
  label = "登録先メンバー",
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  if (members.length <= 1) return null;
  return (
    <div className="field">
      <label htmlFor="member-picker">{label}</label>
      <select
        id="member-picker"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}
