export const CATEGORIES = ["餐饮", "交通", "购物", "娱乐", "住房", "收入", "其他"] as const;

export type Category = (typeof CATEGORIES)[number];
export type EntryType = "expense" | "income";

export interface LedgerEntry {
  id: string;
  type: EntryType;
  amount: number;
  category: Category;
  note: string;
  date: string;
  createdAt: string;
}

export interface ParsedEntry {
  type: EntryType;
  amount: number;
  category: Category;
  note: string;
  date: string;
}

export type Page = "home" | "add" | "monthly" | "categories";
