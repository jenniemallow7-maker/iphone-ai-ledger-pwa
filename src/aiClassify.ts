import type { Category } from "./types";
import { CATEGORIES } from "./types";

const TOGGLE_KEY = "ai-ledger-ai-mode";
const CACHE_KEY = "ai-ledger-ai-cache";
const TIMEOUT_MS = 6000;

export function isAiMode(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) === "on";
  } catch {
    return false;
  }
}

export function setAiMode(on: boolean) {
  try {
    localStorage.setItem(TOGGLE_KEY, on ? "on" : "off");
  } catch {
    // 存不进去也不影响本次会话，只是刷新后回到规则模式
  }
}

function readCache(): Record<string, Category> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, Category>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, Category>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // 缓存满了就算了，下次重新问一遍
  }
}

function cacheKey(note: string, amount: number) {
  return `${note.trim()}|${amount}`;
}

export function cachedCategory(note: string, amount: number): Category | null {
  return readCache()[cacheKey(note, amount)] ?? null;
}

/**
 * 问一次模型。任何一步不顺——离线、超时、服务端没配 key、返回看不懂——
 * 都返回 null，交给调用方继续用规则的结果。分类永远不会因此卡住或报错。
 */
export async function classifyRemote(note: string, amount: number): Promise<Category | null> {
  const trimmed = note.trim();
  if (!trimmed) return null;

  const cached = cachedCategory(trimmed, amount);
  if (cached) return cached;

  if (typeof navigator !== "undefined" && navigator.onLine === false) return null;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch("/api/classify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: [{ note: trimmed, amount }] }),
      signal: controller.signal
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { categories?: string[] };
    const category = data.categories?.[0];
    if (!category || !(CATEGORIES as readonly string[]).includes(category)) return null;

    const cache = readCache();
    cache[cacheKey(trimmed, amount)] = category as Category;
    writeCache(cache);

    return category as Category;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
