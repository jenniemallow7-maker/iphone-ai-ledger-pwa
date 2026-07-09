import type { LedgerEntry } from "./types";

function escapeCsv(value: string | number) {
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadCsv(entries: LedgerEntry[]) {
  const header = ["日期", "类型", "金额", "分类", "备注", "创建时间"];
  const rows = entries.map((entry) => [
    entry.date,
    entry.type === "income" ? "收入" : "支出",
    entry.amount.toFixed(2),
    entry.category,
    entry.note,
    entry.createdAt
  ]);

  const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ai-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
