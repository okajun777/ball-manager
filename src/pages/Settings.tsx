import { useState } from "react";
import type { FormEvent } from "react";
import { downloadBackupJson, readBackupFile } from "../lib/backup";
import { downloadScoresCsv } from "../lib/csvExport";
import {
  hasSharedLlmKey,
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettings,
} from "../lib/llm";
import {
  loadMaintReminderSettings,
  requestNotifyPermission,
  saveMaintReminderSettings,
  type MaintReminderSettings,
} from "../lib/maintReminder";
import { createFreshData } from "../lib/storage";
import { isSupabaseConfigured } from "../lib/supabase";
import { loadUserPrefs, saveUserPrefs, type UserPrefs } from "../lib/prefs";
import { useStore } from "../lib/store";
import {
  MEMBER_GENDER_LABEL,
  MEMBER_HAND_LABEL,
  MEMBER_THROW_STYLE_LABEL,
  formatMemberProfile,
  normalizeMember,
  type MemberGender,
  type MemberHand,
  type MemberThrowStyle,
} from "../lib/types";

type MemberDraft = {
  displayName: string;
  gender: MemberGender;
  hand: MemberHand;
  throwStyle: MemberThrowStyle;
  profileNote: string;
};

function draftFromMember(m: {
  displayName: string;
  gender?: MemberGender;
  hand?: MemberHand;
  throwStyle?: MemberThrowStyle;
  profileNote?: string;
}): MemberDraft {
  const n = normalizeMember({
    id: "",
    groupId: "",
    displayName: m.displayName,
    isSelf: false,
    gender: m.gender,
    hand: m.hand,
    throwStyle: m.throwStyle,
    profileNote: m.profileNote,
  });
  return {
    displayName: n.displayName,
    gender: n.gender ?? "unspecified",
    hand: n.hand ?? "unspecified",
    throwStyle: n.throwStyle ?? "unspecified",
    profileNote: n.profileNote ?? "",
  };
}

export function Settings() {
  const {
    data,
    activeMember,
    memberBalls,
    memberSessions,
    addMember,
    updateMemberProfile,
    updateGroupName,
    replaceAppData,
    joinGroup,
  } = useStore();
  const [groupName, setGroupName] = useState(data?.group.name ?? "");
  const [memberName, setMemberName] = useState("");
  const [editingMembers, setEditingMembers] = useState<Record<string, MemberDraft>>({});
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [llm, setLlm] = useState<LlmSettings>(() => loadLlmSettings());
  const [reminder, setReminder] = useState<MaintReminderSettings>(() =>
    loadMaintReminderSettings(),
  );
  const [prefs, setPrefs] = useState<UserPrefs>(() => loadUserPrefs());
  const sharedLlm = hasSharedLlmKey();

  if (!data) return null;

  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    await updateGroupName(groupName);
    alert("グループ名を保存しました");
  }

  function savePrefs(e: FormEvent) {
    e.preventDefault();
    saveUserPrefs(prefs);
    alert("入力の既定値を保存しました（この端末のみ）");
  }

  async function onAddMember(e: FormEvent) {
    e.preventDefault();
    await addMember(memberName);
    setMemberName("");
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault();
    try {
      await joinGroup(joinCode, joinName);
      setJoinCode("");
      setJoinName("");
      alert("グループに参加しました");
    } catch (err) {
      alert(err instanceof Error ? err.message : "参加に失敗しました");
    }
  }

  function saveLlm(e: FormEvent) {
    e.preventDefault();
    saveLlmSettings(llm);
    alert("AI解説の設定を保存しました");
  }

  function saveReminder(e: FormEvent) {
    e.preventDefault();
    saveMaintReminderSettings(reminder);
    alert("メンテリマインダーを保存しました");
  }

  async function onImportBackup(file: File | null) {
    if (!file) return;
    if (
      !confirm(
        "バックアップJSONで現在のデータを置き換えます。よろしいですか？（いまの内容は上書きされます）",
      )
    ) {
      return;
    }
    try {
      const imported = await readBackupFile(file);
      await replaceAppData(imported);
      setGroupName(imported.group.name);
      alert("バックアップを読み込みました");
    } catch (err) {
      alert(err instanceof Error ? err.message : "読み込みに失敗しました");
    }
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

      <form className="card" style={{ marginTop: 14 }} onSubmit={savePrefs}>
        <h3 style={{ marginTop: 0 }}>スコア入力の既定値</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          新規入力時の店舗・オイルの初期値です。この端末のみに保存されます。
        </p>
        <div className="grid two">
          <div className="field">
            <label>よく使う店舗</label>
            <input
              value={prefs.defaultShop}
              onChange={(e) => setPrefs({ ...prefs, defaultShop: e.target.value })}
              placeholder="ラウンドワン○○"
            />
          </div>
          <div className="field">
            <label>よく使うオイル</label>
            <input
              value={prefs.defaultOil}
              onChange={(e) => setPrefs({ ...prefs, defaultOil: e.target.value })}
              placeholder="ハウス"
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">
            既定値を保存
          </button>
        </div>
      </form>

      <form className="card" style={{ marginTop: 14 }} onSubmit={saveReminder}>
        <h3 style={{ marginTop: 0 }}>表面メンテのリマインダー</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          ダッシュボードに「要メンテ」のボールを表示します。任意でブラウザ通知も使えます。
        </p>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={reminder.enabled}
            onChange={(e) => setReminder({ ...reminder, enabled: e.target.checked })}
          />
          リマインダーを有効にする
        </label>
        <div className="field">
          <label>間隔（日）</label>
          <input
            type="number"
            min={7}
            max={365}
            value={reminder.intervalDays}
            onChange={(e) =>
              setReminder({
                ...reminder,
                intervalDays: Math.max(7, Number(e.target.value) || 30),
              })
            }
          />
        </div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <input
            type="checkbox"
            checked={reminder.notify}
            onChange={(e) => setReminder({ ...reminder, notify: e.target.checked })}
          />
          ブラウザ通知を使う（1日1回まで）
        </label>
        <div className="form-actions">
          <button
            className="btn secondary"
            type="button"
            onClick={async () => {
              const perm = await requestNotifyPermission();
              if (perm === "granted") {
                setReminder((r) => {
                  const next = { ...r, notify: true };
                  saveMaintReminderSettings(next);
                  return next;
                });
                alert("通知を許可しました");
              } else {
                alert("通知が許可されませんでした（ブラウザ設定を確認）");
              }
            }}
          >
            通知を許可
          </button>
          <button className="btn" type="submit">
            リマインダーを保存
          </button>
        </div>
      </form>

      <form className="card" style={{ marginTop: 14 }} onSubmit={onJoin}>
        <h3 style={{ marginTop: 0 }}>招待コードで参加</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          家族からもらった招待コードでグループに入ります。
          {isSupabaseConfigured
            ? "クラウド上のグループを検索して参加します。"
            : "ローカルでは、この端末のグループコードと一致する場合のみメンバー追加できます。別端末は JSON 読み込みか Supabase を使ってください。"}
        </p>
        <div className="grid two">
          <div className="field">
            <label>招待コード</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="family01"
            />
          </div>
          <div className="field">
            <label>あなたの表示名</label>
            <input
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              placeholder="父 / 友人A"
            />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn" type="submit">
            参加する
          </button>
        </div>
      </form>

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>バックアップ（JSON / GitHub）</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          全データをJSONで書き出し・読み込みできます。GitHub のプライベートリポジトリにコミットすれば、
          端末をまたいだバックアップになります。
        </p>
        <ol style={{ color: "var(--sub)", paddingLeft: 18, fontSize: "0.9rem" }}>
          <li>「JSONを書き出し」でファイルを保存</li>
          <li>GitHub Desktop などでプライベートリポジトリにコミット・プッシュ</li>
          <li>別端末では「JSONを読み込み」で復元</li>
        </ol>
        <div className="form-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          <button className="btn" type="button" onClick={() => downloadBackupJson(data)}>
            JSONを書き出し
          </button>
          <label className="btn secondary" style={{ cursor: "pointer", margin: 0 }}>
            JSONを読み込み
            <input
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                void onImportBackup(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          <button
            className="btn secondary"
            type="button"
            onClick={() =>
              downloadScoresCsv(
                memberSessions,
                memberBalls,
                activeMember?.displayName ?? "member",
              )
            }
          >
            スコアCSV（選択中メンバー）
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={async () => {
              if (
                !confirm(
                  "デモ／既存データを消して、淳司・はるみだけの空データにします。よろしいですか？（先にJSON書き出し推奨）",
                )
              ) {
                return;
              }
              const fresh = createFreshData();
              await replaceAppData(fresh);
              setGroupName(fresh.group.name);
              alert("空データで開始しました。マイボールから登録してください。");
            }}
          >
            空データでやり直す
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>AI解説・画像読取</h3>
        {sharedLlm ? (
          <p style={{ color: "var(--sub)", fontSize: "0.9rem", margin: 0 }}>
            家族共有のAPIキーが有効です。ローカル・公開版・どのブラウザでもそのまま使えます（設定不要）。
            モデル: {llm.model}
          </p>
        ) : (
          <form onSubmit={saveLlm}>
            <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
              共有キー未設定です。下に入力して保存するか、デプロイ側の VITE_LLM_API_KEY を設定してください。
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
                  placeholder="gpt-5.6"
                />
              </div>
            </div>
            <div className="field">
              <label>Base URL</label>
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
            </div>
          </form>
        )}
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>メンバー・プロフィール</h3>
          <form onSubmit={onAddMember} style={{ marginBottom: 14 }}>
            <div className="field">
              <label>表示名を追加</label>
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
          </form>
          <div style={{ display: "grid", gap: 14 }}>
            {data.members.map((m) => {
              const draft = editingMembers[m.id] ?? draftFromMember(m);
              const saved = draftFromMember(m);
              const dirty =
                draft.displayName.trim() !== saved.displayName ||
                draft.gender !== saved.gender ||
                draft.hand !== saved.hand ||
                draft.throwStyle !== saved.throwStyle ||
                draft.profileNote.trim() !== saved.profileNote.trim();
              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 12,
                    padding: 12,
                    background: m.id === activeMember?.id ? "var(--accent-soft)" : "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      value={draft.displayName}
                      onChange={(e) =>
                        setEditingMembers((prev) => ({
                          ...prev,
                          [m.id]: { ...draft, displayName: e.target.value },
                        }))
                      }
                      style={{ flex: "1 1 120px", minWidth: 0 }}
                      aria-label={`${m.displayName}の表示名`}
                    />
                    {m.isSelf ? (
                      <span style={{ color: "var(--sub)", fontSize: "0.85rem" }}>自分</span>
                    ) : null}
                  </div>
                  <p style={{ margin: "0 0 8px", color: "var(--sub)", fontSize: "0.82rem" }}>
                    現在: {formatMemberProfile(m)}
                  </p>
                  <div className="grid two">
                    <div className="field">
                      <label>性別</label>
                      <select
                        value={draft.gender}
                        onChange={(e) =>
                          setEditingMembers((prev) => ({
                            ...prev,
                            [m.id]: {
                              ...draft,
                              gender: e.target.value as MemberGender,
                            },
                          }))
                        }
                      >
                        {(Object.keys(MEMBER_GENDER_LABEL) as MemberGender[]).map((k) => (
                          <option key={k} value={k}>
                            {MEMBER_GENDER_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label>利き手</label>
                      <select
                        value={draft.hand}
                        onChange={(e) =>
                          setEditingMembers((prev) => ({
                            ...prev,
                            [m.id]: { ...draft, hand: e.target.value as MemberHand },
                          }))
                        }
                      >
                        {(Object.keys(MEMBER_HAND_LABEL) as MemberHand[]).map((k) => (
                          <option key={k} value={k}>
                            {MEMBER_HAND_LABEL[k]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="field">
                    <label>投球スタイル</label>
                    <select
                      value={draft.throwStyle}
                      onChange={(e) =>
                        setEditingMembers((prev) => ({
                          ...prev,
                          [m.id]: {
                            ...draft,
                            throwStyle: e.target.value as MemberThrowStyle,
                          },
                        }))
                      }
                    >
                      {(Object.keys(MEMBER_THROW_STYLE_LABEL) as MemberThrowStyle[]).map((k) => (
                        <option key={k} value={k}>
                          {MEMBER_THROW_STYLE_LABEL[k]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>メモ（回転多め・スピード遅めなど）</label>
                    <input
                      value={draft.profileNote}
                      onChange={(e) =>
                        setEditingMembers((prev) => ({
                          ...prev,
                          [m.id]: { ...draft, profileNote: e.target.value },
                        }))
                      }
                      placeholder="例: 回転多め / スピード控えめ"
                    />
                  </div>
                  <div className="form-actions">
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={!draft.displayName.trim() || !dirty}
                      onClick={async () => {
                        await updateMemberProfile(m.id, draft);
                        setEditingMembers((prev) => {
                          const next = { ...prev };
                          delete next[m.id];
                          return next;
                        });
                      }}
                    >
                      プロフィールを保存
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

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
