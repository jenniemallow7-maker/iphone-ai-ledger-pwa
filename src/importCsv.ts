import { CATEGORIES, type Category, type EntryType, type LedgerEntry } from "./types";

export interface ImportIssue {
  line: number;
  reason: string;
}

export interface ImportPreview {
  fresh: LedgerEntry[];
  duplicates: number;
  issues: ImportIssue[];
  totalRows: number;
}

const TYPE_LABELS: Record<string, EntryType> = {
  收入: "income",
  income: "income",
  支出: "expense",
  expense: "expense"
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim().length));
}

/**
 * 创建时间也算进去。少了它，同一天同金额同备注的两笔独立消费会被当成重复
 * 丢掉一笔——「8 月 15 日两次买游戏各 2 元」就是真实会发生的情况。
 * 导出的 CSV 一直带着创建时间，所以重复导入同一份文件照样能正确去重。
 */
function fingerprint(entry: {
  date: string;
  amount: number;
  category: string;
  note: string;
  type: EntryType;
  createdAt: string;
}) {
  return [entry.date, entry.type, entry.amount.toFixed(2), entry.category, entry.note.trim(), entry.createdAt].join("|");
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeDate(raw: string): string | null {
  const text = raw.trim().replace(/[年月]/g, "-").replace(/[日/.]/g, "-").replace(/-+$/, "");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return null;

  return `${year}-${String(monthNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
}

export function buildImportPreview(text: string, existing: LedgerEntry[]): ImportPreview {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const issues: ImportIssue[] = [];

  if (!rows.length) {
    return { fresh: [], duplicates: 0, issues: [{ line: 0, reason: "文件是空的" }], totalRows: 0 };
  }

  const hasHeader = rows[0][0]?.trim() === "日期";
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const headerOffset = hasHeader ? 2 : 1;

  const seen = new Set(existing.map(fingerprint));
  const fresh: LedgerEntry[] = [];
  let duplicates = 0;

  dataRows.forEach((cells, index) => {
    const line = index + headerOffset;
    const [rawDate = "", rawType = "", rawAmount = "", rawCategory = "", rawNote = "", rawCreatedAt = ""] = cells;

    const date = normalizeDate(rawDate);
    if (!date) {
      issues.push({ line, reason: `日期无法识别：${rawDate.trim() || "(空)"}` });
      return;
    }

    const type = TYPE_LABELS[rawType.trim()];
    if (!type) {
      issues.push({ line, reason: `类型只能是收入或支出，收到：${rawType.trim() || "(空)"}` });
      return;
    }

    const amount = Number(rawAmount.replace(/[¥￥,\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      issues.push({ line, reason: `金额无效：${rawAmount.trim() || "(空)"}` });
      return;
    }

    const categoryText = rawCategory.trim() as Category;
    const category: Category = CATEGORIES.includes(categoryText)
      ? categoryText
      : type === "income"
        ? "收入"
        : "其他";

    const note = rawNote.trim();
    const createdAt = Number.isNaN(Date.parse(rawCreatedAt.trim()))
      ? new Date(`${date}T00:00:00`).toISOString()
      : new Date(rawCreatedAt.trim()).toISOString();

    const candidate: LedgerEntry = {
      id: uid(),
      type,
      amount: Math.round(amount * 100) / 100,
      category,
      note,
      date,
      createdAt
    };

    const key = fingerprint(candidate);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }

    seen.add(key);
    fresh.push(candidate);
  });

  return { fresh, duplicates, issues, totalRows: dataRows.length };
}
