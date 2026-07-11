import type { AppData } from "./types";

const BACKUP_VERSION = 1;

export type BackupPayload = {
  version: number;
  exportedAt: string;
  app: "ball-manager";
  data: AppData;
};

export function buildBackupPayload(data: AppData): BackupPayload {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: "ball-manager",
    data,
  };
}

export function downloadBackupJson(data: AppData) {
  const payload = buildBackupPayload(data);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const day = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `ball-manager-backup-${day}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseBackupJson(raw: string): AppData {
  const parsed = JSON.parse(raw) as BackupPayload | AppData;
  if (parsed && typeof parsed === "object" && "data" in parsed && (parsed as BackupPayload).app === "ball-manager") {
    const payload = parsed as BackupPayload;
    if (!payload.data?.group || !Array.isArray(payload.data.members)) {
      throw new Error("バックアップ形式が不正です");
    }
    return {
      ...payload.data,
      maintenances: payload.data.maintenances ?? [],
    };
  }
  // 生の AppData も許容
  const data = parsed as AppData;
  if (!data.group || !Array.isArray(data.members) || !Array.isArray(data.sessions)) {
    throw new Error("JSONに Ball Manager のデータが見つかりません");
  }
  return { ...data, maintenances: data.maintenances ?? [] };
}

export async function readBackupFile(file: File): Promise<AppData> {
  const text = await file.text();
  return parseBackupJson(text);
}
