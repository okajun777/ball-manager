import { useState } from "react";
import type { FormEvent } from "react";
import { loadLlmSettings, saveLlmSettings, type LlmSettings } from "../lib/llm";
import { isSupabaseConfigured } from "../lib/supabase";
import { useStore } from "../lib/store";

export function Settings() {
  const { data, addMember, updateGroupName } = useStore();
  const [groupName, setGroupName] = useState(data?.group.name ?? "");
  const [memberName, setMemberName] = useState("");
  const [llm, setLlm] = useState<LlmSettings>(() => loadLlmSettings());

  if (!data) return null;

  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    await updateGroupName(groupName);
    alert("グループ名を保存しました");
  }

  async function onAddMember(e: FormEvent) {
    e.preventDefault();
    await addMember(memberName);
    setMemberName("");
  }

  function saveLlm(e: FormEvent) {
    e.preventDefault();
    saveLlmSettings(llm);
    alert("AI解説の設定を保存しました（この端末のみ）");
  }

  const inviteText = `Bowling Ball Manager に参加しませんか？\nグループ: ${data.group.name}\n招待コード: ${data.group.inviteCode}\n※Supabase設定後にクラウド共有が有効になります`;

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>設定・共有</h1>
          <p>家族・知り合いと同じグループでボールとスコアを共有</p>
        </div>
      </div>

      <div className="grid two">
        <form className="card" onSubmit={saveGroup}>
          <h3 style={{ marginTop: 0 }}>グループ</h3>
          <div className="field">
            <label>グループ名</label>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div className="field">
            <label>招待コード</label>
            <input value={data.group.inviteCode} readOnly />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              保存
            </button>
          </div>
        </form>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>クラウド保存（Supabase）</h3>
          <p style={{ color: "var(--sub)" }}>
            状態:{" "}
            <strong style={{ color: isSupabaseConfigured ? "var(--good)" : "var(--warn)" }}>
              {isSupabaseConfigured ? "接続設定あり" : "未設定（今は端末内に保存）"}
            </strong>
          </p>
          <ol style={{ color: "var(--sub)", paddingLeft: 18, fontSize: "0.92rem" }}>
            <li>Supabase でプロジェクト作成</li>
            <li>
              <code>supabase/schema.sql</code> を SQL Editor で実行
            </li>
            <li>
              <code>.env</code> に URL と anon key を設定（
              <code>.env.example</code> 参照）
            </li>
            <li>アプリを再起動するとクラウド同期が有効</li>
          </ol>
        </div>
      </div>

      <form className="card" style={{ marginTop: 14 }} onSubmit={saveLlm}>
        <h3 style={{ marginTop: 0 }}>AI解説（OpenAI互換API）</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          攻略AIの選球結果を文章で解説します。キーはこの端末のブラウザにだけ保存されます。
          未設定でもルールベースの提案はそのまま使えます。
        </p>
        <div className="grid two">
          <div className="field">
            <label>APIキー</label>
            <input
              type="password"
              value={llm.apiKey}
              onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
              placeholder="sk-..."
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>モデル</label>
            <input
              value={llm.model}
              onChange={(e) => setLlm({ ...llm, model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </div>
        </div>
        <div className="field">
          <label>Base URL（OpenAI / OpenRouter など）</label>
          <input
            value={llm.baseUrl}
            onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
          />
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">
            AI設定を保存
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => {
              const cleared = { ...llm, apiKey: "" };
              setLlm(cleared);
              saveLlmSettings(cleared);
              alert("APIキーを削除しました");
            }}
          >
            キーを削除
          </button>
        </div>
      </form>

      <div className="grid two" style={{ marginTop: 14 }}>
        <form className="card" onSubmit={onAddMember}>
          <h3 style={{ marginTop: 0 }}>メンバー追加</h3>
          <div className="field">
            <label>表示名</label>
            <input
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="父 / 友人A"
            />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              追加
            </button>
          </div>
          <ul style={{ marginTop: 12, paddingLeft: 18 }}>
            {data.members.map((m) => (
              <li key={m.id}>
                {m.displayName}
                {m.isSelf ? "（自分）" : ""}
              </li>
            ))}
          </ul>
        </form>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>招待文</h3>
          <textarea readOnly value={inviteText} style={{ minHeight: 140 }} />
          <div className="form-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(inviteText);
                alert("コピーしました");
              }}
            >
              コピー
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
