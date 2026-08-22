import { buildCsv } from "./exportCsv";
import type { LedgerEntry } from "./types";

const BACKUP_KEY = "ai-ledger-last-backup";

export interface Backup {
  csv: string;
  count: number;
  savedAt: string;
}

/**
 * 清空账单前把整份 CSV 同步写进 localStorage。文件下载没有任何回调能告诉
 * 页面用户到底存没存下来（iOS 上常常只是弹个分享面板），所以不能拿它当保障。
 * 这份备份跟账单数据分开存放，清空 IndexedDB 不会连它一起清掉。
 */
export function saveBackup(entries: LedgerEntry[]): Backup | null {
  const backup: Backup = {
    csv: buildCsv(entries),
    count: entries.length,
    savedAt: new Date().toISOString()
  };

  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    return backup;
  } catch {
    return null;
  }
}

export function readBackup(): Backup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Backup;
    return typeof parsed?.csv === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function dropBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // localStorage 被禁用时忽略，备份本来就没写进去
  }
}
