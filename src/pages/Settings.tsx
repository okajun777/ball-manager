import {
  APP_PUBLIC_URL,
  appEntryUrl,
  appInviteUrl,
  clearInviteFromLocation,
  readInviteFromLocation,
} from "../lib/appUrl";
import { createFreshDataKeepingGroup } from "../lib/storage";
import {
  clearSupabaseSettings,
  isSupabaseConfigured,
  loadSupabaseSettings,
  saveSupabaseSettings,
  type SupabaseSettings,
} from "../lib/supabase";
import { loadUserPrefs, saveUserPrefs, type UserPrefs } from "../lib/prefs";
import { findAdminMemberId } from "../lib/identity";
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
import { useEffect, useState } from "react";
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
    deviceMember,
    isAdmin,
    memberBalls,
    memberSessions,
    addMember,
    deleteMember,
    updateMemberProfile,
    updateGroupName,
    replaceAppData,
    joinGroup,
    claimAsMember,
    unlockAdmin,
    setAdminPin,
    resetIdentity,
    refresh,
  } = useStore();
  const [groupName, setGroupName] = useState(data?.group.name ?? "");
  const [memberName, setMemberName] = useState("");
  const [editingMembers, setEditingMembers] = useState<Record<string, MemberDraft>>({});
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [llm, setLlm] = useState<LlmSettings>(() => loadLlmSettings());
  const [supabaseForm, setSupabaseForm] = useState<SupabaseSettings>(() => loadSupabaseSettings());
  const [supabaseReady, setSupabaseReady] = useState(() => isSupabaseConfigured());
  const [reminder, setReminder] = useState<MaintReminderSettings>(() =>
    loadMaintReminderSettings(),
  );
  const [prefs, setPrefs] = useState<UserPrefs>(() => loadUserPrefs());
  const [adminPinDraft, setAdminPinDraft] = useState("");
  const [switchPin, setSwitchPin] = useState("");
  const [switchPinError, setSwitchPinError] = useState("");
  const [pendingOwner, setPendingOwner] = useState(false);
  const sharedLlm = hasSharedLlmKey();
  const publicUrl = APP_PUBLIC_URL;
  const inviteLink = data ? appInviteUrl(data.group.inviteCode) : publicUrl;
  const thisDeviceUrl = appEntryUrl();

  useEffect(() => {
    const code = readInviteFromLocation();
    if (!code) return;
    setJoinCode(code);
    clearInviteFromLocation();
  }, []);

  if (!data) return null;

  const visibleMembers = isAdmin
    ? data.members
    : data.members.filter((m) => m.id === deviceMember?.id);

  async function saveGroup(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
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
    if (!isAdmin) return;
    const name = memberName.trim();
    if (!name) return;
    try {
      await addMember(name);
      setMemberName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "メンバー追加に失敗しました");
    }
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

  function saveSupabase(e: FormEvent) {
    e.preventDefault();
    const url = supabaseForm.url.trim();
    const anonKey = supabaseForm.anonKey.trim();
    if (!url || !anonKey) {
      alert("Project URL と anon キーの両方を入れてください");
      return;
    }
    if (!/^https:\/\/.+\.supabase\.co\/?$/i.test(url.replace(/\/$/, ""))) {
      // 緩めに許可（カスタムドメイン等）
    }
    saveSupabaseSettings({ url, anonKey });
    setSupabaseReady(true);
    alert("クラウド接続を保存しました。ページを再読み込みします。");
    window.location.reload();
  }

  function saveReminder(e: FormEvent) {
    e.preventDefault();
    saveMaintReminderSettings(reminder);
    alert("メンテリマインダーを保存しました");
  }

  async function onImportBackup(file: File | null) {
    if (!file || !isAdmin) return;
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

  const inviteText = `Bowling Ball Manager
すぐ開く: ${inviteLink}
グループ: ${data.group.name}
招待コード: ${data.group.inviteCode}
（リンクを開いて、表示名を入れて参加してください）`;

  async function copyText(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label}をコピーしました`);
    } catch {
      prompt("コピーできない場合は手動でコピーしてください", text);
    }
  }

  return (
    <div>
      <div className="page-title">
        <div>
          <h1>設定・共有</h1>
          <p>
            データはクラウドに保存されます。全員分の追記・変更は管理者（淳司）のみです。一般メンバーは自分のデータだけ編集できます。
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, background: "#eef6ff", borderColor: "#bfdbfe" }}>
        <strong>同期の正本</strong>
        <p style={{ margin: "6px 0 0", color: "var(--sub)", fontSize: "0.9rem" }}>
          グループ「{data.group.name}」／招待コード{" "}
          <code style={{ fontWeight: 700 }}>{data.group.inviteCode}</code>
          {" · "}メンバー {data.members.length} 人・ボール {data.balls.length} 個
          {isSupabaseConfigured() ? " · クラウド接続中" : " · クラウド未設定（端末内のみ）"}
          {" · "}この端末: {deviceMember?.displayName ?? "—"}
          {isAdmin ? "（管理者）" : ""}
          {isAdmin ? ` · 編集中: ${activeMember?.displayName ?? "—"}` : ""}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>利用者</h3>
        <p style={{ marginTop: 0 }}>
          <strong>{deviceMember?.displayName ?? "—"}</strong>
          {isAdmin ? "（管理者・全員のクラウドデータを編集可）" : "（自分のデータのみ）"}
        </p>
        {isAdmin ? (
          <div>
            <div className="field">
              <label>ロック番号（4桁）</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={adminPinDraft}
                onChange={(e) => setAdminPinDraft(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                autoComplete="off"
              />
              <div className="form-actions" style={{ justifyContent: "flex-start" }}>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    const res = setAdminPin(adminPinDraft);
                    if (!res.ok) {
                      alert(res.error || "設定できませんでした");
                      return;
                    }
                    setAdminPinDraft("");
                    alert("保存しました");
                  }}
                >
                  保存
                </button>
              </div>
            </div>
            <button className="btn secondary" type="button" onClick={() => resetIdentity()}>
              利用者を選び直す
            </button>
          </div>
        ) : pendingOwner ? (
          <div>
            <div className="field">
              <label>管理者ロック番号（4桁）</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={switchPin}
                onChange={(e) => {
                  setSwitchPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                  setSwitchPinError("");
                }}
                placeholder="••••"
                autoComplete="off"
                autoFocus
              />
            </div>
            {switchPinError ? (
              <p style={{ color: "#b42318", fontSize: "0.88rem" }}>{switchPinError}</p>
            ) : null}
            <div className="form-actions" style={{ justifyContent: "flex-start" }}>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const res = unlockAdmin(switchPin);
                  if (!res.ok) {
                    setSwitchPinError(res.error || "違います");
                    return;
                  }
                  setPendingOwner(false);
                  setSwitchPin("");
                }}
              >
                管理者で開く
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => {
                  setPendingOwner(false);
                  setSwitchPin("");
                  setSwitchPinError("");
                }}
              >
                戻る
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="field">
              <label>利用者を切り替え</label>
              <select
                value={deviceMember?.id ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const owner = findAdminMemberId(data.members);
                  if (owner && id === owner) {
                    setPendingOwner(true);
                    return;
                  }
                  claimAsMember(id);
                }}
              >
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                    {m.isSelf ? "（管理者）" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn secondary" type="button" onClick={() => resetIdentity()}>
              選び直す
            </button>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>アプリをすぐ開くURL</h3>
        <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
          ブックマークやLINE・メールに貼ると、すぐ Ball Manager を開けます。
        </p>
        <div className="field">
          <label>公開版（おすすめ）</label>
          <input readOnly value={publicUrl} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="field">
          <label>招待リンク（公開版＋招待コード）</label>
          <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="field">
          <label>この端末で開いているURL</label>
          <input readOnly value={thisDeviceUrl} onFocus={(e) => e.currentTarget.select()} />
        </div>
        <div className="form-actions">
          <button className="btn" type="button" onClick={() => void copyText("公開版URL", publicUrl)}>
            公開版をコピー
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void copyText("招待リンク", inviteLink)}
          >
            招待リンクをコピー
          </button>
          <a className="btn secondary" href={publicUrl} target="_blank" rel="noreferrer">
            公開版を開く
          </a>
        </div>
      </div>

      <div className="grid two">
        <form className="card" onSubmit={saveGroup}>
          <h3 style={{ marginTop: 0 }}>グループ</h3>
          <div className="field">
            <label>グループ名</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
          <div className="field">
            <label>招待コード</label>
            <input value={data.group.inviteCode} readOnly />
          </div>
          {isAdmin ? (
            <div className="form-actions">
              <button className="btn" type="submit">
                保存
              </button>
            </div>
          ) : null}
        </form>

        <form className="card" onSubmit={saveSupabase}>
          <h3 style={{ marginTop: 0 }}>クラウド保存（Supabase）</h3>
          {!isAdmin ? (
            <p style={{ color: "var(--sub)", fontSize: "0.9rem", margin: 0 }}>
              状態:{" "}
              <strong style={{ color: supabaseReady ? "var(--good)" : "var(--warn)" }}>
                {supabaseReady ? "接続設定あり" : "未設定"}
              </strong>
            </p>
          ) : (
            <>
          <p style={{ color: "var(--sub)", fontSize: "0.9rem", marginTop: 0 }}>
            状態:{" "}
            <strong style={{ color: supabaseReady ? "var(--good)" : "var(--warn)" }}>
              {supabaseReady ? "接続設定あり" : "未設定（今は端末内に保存）"}
            </strong>
          </p>
          <p style={{ color: "var(--sub)", fontSize: "0.88rem" }}>
            Edge で Supabase の Bowling を開き、左の歯車 → API にある2つを下に貼って保存してください。
          </p>
          <div className="field">
            <label>Project URL</label>
            <input
              value={supabaseForm.url}
              onChange={(e) => setSupabaseForm({ ...supabaseForm, url: e.target.value })}
              placeholder="https://xxxx.supabase.co"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>anon キー（anon public）</label>
            <input
              type="password"
              value={supabaseForm.anonKey}
              onChange={(e) => setSupabaseForm({ ...supabaseForm, anonKey: e.target.value })}
              placeholder="eyJ..."
              autoComplete="off"
            />
          </div>
          <div className="form-actions">
            <button className="btn" type="submit">
              クラウド接続を保存
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                clearSupabaseSettings();
                setSupabaseForm({ url: "", anonKey: "" });
                setSupabaseReady(false);
                alert("クラウド接続を削除しました");
              }}
            >
              接続を削除
            </button>
          </div>
            </>
          )}
        </form>
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
          {isSupabaseConfigured()
            ? "クラウド上のグループを検索して参加します。"
            : "ローカルでは、この端末のグループコードと一致する場合のみメンバー追加できます。別端末は JSON 読み込みか Supabase を使ってください。"}
        </p>
        <div className="grid two">
          <div className="field">
            <label>招待コード</label>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="招待コード"
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

      {isAdmin ? (
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
                  "ボール・スコア・メンテを空にします。グループと招待コード、淳司・はるみのIDは維持します（他端末と別れません）。よろしいですか？（先にJSON書き出し推奨）",
                )
              ) {
                return;
              }
              const fresh = createFreshDataKeepingGroup(data);
              await replaceAppData(fresh);
              setGroupName(fresh.group.name);
              alert("中身を空にしました。招待コードはそのままです。");
            }}
          >
            空データでやり直す
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await refresh();
              alert("クラウドから最新を取り込みました。");
            }}
          >
            クラウドから再読込
          </button>
        </div>
      </div>
      ) : (
      <div className="card" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>スコアCSV</h3>
        <div className="form-actions">
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
            書き出し
          </button>
        </div>
      </div>
      )}

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
          <h3 style={{ marginTop: 0 }}>
            {isAdmin ? "メンバー・プロフィール" : "プロフィール"}
          </h3>
          {isAdmin ? (
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
          ) : null}
          <div style={{ display: "grid", gap: 14 }}>
            {visibleMembers.map((m) => {
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
                    {m.id === activeMember?.id ? (
                      <span style={{ color: "var(--sub)", fontSize: "0.85rem" }}>表示中</span>
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
                      <label>利き手（右 / 左）</label>
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
                    <label>投球スタイル（1ハンド / 2ハンド）</label>
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
                    {isAdmin && !m.isSelf ? (
                      <button
                        className="btn secondary"
                        type="button"
                        onClick={() => {
                          if (
                            !confirm(
                              `${m.displayName} を削除しますか？\nこのメンバーのボール・スコア・メンテ記録も消えます。`,
                            )
                          ) {
                            return;
                          }
                          void deleteMember(m.id).then(() => {
                            setEditingMembers((prev) => {
                              const next = { ...prev };
                              delete next[m.id];
                              return next;
                            });
                          });
                        }}
                      >
                        削除
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {isAdmin ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>招待文</h3>
          <textarea readOnly value={inviteText} style={{ minHeight: 140 }} />
          <div className="form-actions">
            <button
              className="btn secondary"
              type="button"
              onClick={() => void copyText("招待文", inviteText)}
            >
              コピー
            </button>
          </div>
        </div>
        ) : null}
      </div>
    </div>
  );
}
