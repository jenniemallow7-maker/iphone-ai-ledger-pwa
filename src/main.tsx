import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { downloadCsv } from "./exportCsv";
import { categoryOptions, parseNaturalLanguage, toDateInputValue } from "./parser";
import { buildImportPreview, type ImportPreview } from "./importCsv";
import { dropBackup, readBackup, saveBackup, type Backup } from "./backup";
import { classifyRemote, isAiMode, setAiMode } from "./aiClassify";
import { tapFeedback } from "./haptics";
import { nextCompactState, type CompactState } from "./scrollDirection";
import { stretchFactor, targetIndex } from "./tabGesture";
import { addEntries, addEntry, clearEntries, deleteEntry, getEntries } from "./storage";
import { CATEGORIES, type Category, type EntryType, type LedgerEntry, type Page, type ParsedEntry } from "./types";
import { registerServiceWorker } from "./pwa";
import "./styles.css";

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });
const BUDGET_STORAGE_KEY = "ai-ledger-monthly-budget";
type TabIconName = "home" | "monthly" | "categories";

const TABS: Array<{ page: Page; label: string; icon: TabIconName }> = [
  { page: "home", label: "首页", icon: "home" },
  { page: "monthly", label: "月度", icon: "monthly" },
  { page: "categories", label: "分类", icon: "categories" }
];

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function App() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [page, setPage] = useState<Page>("home");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setEntries(await getEntries());
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const currentMonth = toDateInputValue(new Date()).slice(0, 7);
  const monthlyEntries = entries.filter((entry) => monthKey(entry.date) === currentMonth);
  const income = monthlyEntries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expense = monthlyEntries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);

  async function handleAdd(parsed: ParsedEntry) {
    await addEntry({
      ...parsed,
      id: uid(),
      createdAt: new Date().toISOString()
    });
    await refresh();
    setPage("home");
  }

  async function handleDelete(id: string) {
    await deleteEntry(id);
    await refresh();
  }

  async function handleImport(imported: LedgerEntry[]) {
    await addEntries(imported);
    await refresh();
  }

  async function handleClear() {
    await clearEntries();
    await refresh();
  }

  return (
    <div className="app-shell">
      <main className="screen">
        {page === "home" && (
          <Home
            loading={loading}
            entries={entries}
            income={income}
            expense={expense}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        )}
        {page === "monthly" && (
          <MonthlyStats
            entries={entries}
            onExport={() => downloadCsv(entries)}
            onImport={handleImport}
            onClear={handleClear}
          />
        )}
        {page === "categories" && <CategoryStats entries={entries} />}
      </main>
      <LiquidTabBar page={page} onChange={setPage} />
    </div>
  );
}

function TabIcon({ name }: { name: TabIconName }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  if (name === "home") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10Z" /><path {...common} d="M9 21v-6h6v6" /></svg>;
  }

  if (name === "monthly") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect {...common} x="3" y="5" width="18" height="16" rx="3" /><path {...common} d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>;
  }

  return <svg viewBox="0 0 24 24" aria-hidden="true"><path {...common} d="M4 20V10M10 20V4M16 20v-7M22 20H2" /><path {...common} d="M4 7h0M10 2h0M16 11h0" /></svg>;
}

function LiquidTabBar({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  const navRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [compact, setCompact] = useState(false);
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.page === page)
  );
  const layout = useRef({ itemWidth: 0, step: 0, maxX: 0 });
  const lastDrag = useRef({ x: 0, time: 0, velocity: 0 });
  const dragStartX = useRef(0);
  const suppressClick = useRef(false);
  const dragging = useRef(false);

  // 向下滚动时收起，向上滚动或回到顶部时恢复。判断逻辑在 nextCompactState 里。
  useEffect(() => {
    let state: CompactState = { compact: false, lastY: window.scrollY };
    let ticking = false;

    function evaluate() {
      state = nextCompactState(window.scrollY, state);
      setCompact(state.compact);
      ticking = false;
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(evaluate);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function measure() {
    const nav = navRef.current;
    if (!nav) return layout.current;
    const styles = window.getComputedStyle(nav);
    const padding = Number.parseFloat(styles.paddingLeft) || 7;
    const gap = Number.parseFloat(styles.columnGap) || 6;
    const width = nav.getBoundingClientRect().width - padding * 2;
    const itemWidth = (width - gap * (TABS.length - 1)) / TABS.length;
    layout.current = {
      itemWidth,
      step: itemWidth + gap,
      maxX: (itemWidth + gap) * (TABS.length - 1)
    };
    return layout.current;
  }

  function xFromPointer(clientX: number) {
    const nav = navRef.current;
    const current = measure();
    if (!nav) return 0;
    const styles = window.getComputedStyle(nav);
    const padding = Number.parseFloat(styles.paddingLeft) || 7;
    const left = nav.getBoundingClientRect().left + padding + current.itemWidth / 2;
    return Math.min(current.maxX, Math.max(0, clientX - left));
  }

  function indexFromX(x: number) {
    const current = measure();
    return Math.min(TABS.length - 1, Math.max(0, Math.round(x / current.step)));
  }

  /**
   * 拖动期间直接写 DOM，不走 React state。指针事件在 120Hz 屏上每秒能发
   * 上百次，每次都重渲染组件的话，动效再精细也会卡在渲染上。
   */
  function paint(x: number, stretch: number, shine: number, origin: number) {
    const node = indicatorRef.current;
    if (!node) return;

    // 拉长的同时变窄，保持「体积」不变——液体被拉伸就是这样，
    // 只放大 X 会像贴纸被扯宽。
    node.style.transform = `translate3d(${x}px, 0, 0) scaleX(${stretch}) scaleY(${1 / Math.sqrt(stretch)})`;
    node.style.transformOrigin = `${origin}% 50%`;
    node.style.setProperty("--shine-x", `${shine}%`);
  }

  function clearPaint() {
    const node = indicatorRef.current;
    if (!node) return;
    node.style.transform = "";
    node.style.transformOrigin = "";
    node.style.removeProperty("--shine-x");
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    measure();
    const x = xFromPointer(event.clientX);
    dragStartX.current = x;
    suppressClick.current = false;
    lastDrag.current = { x, time: performance.now(), velocity: 0 };
    dragging.current = true;
    setIsDragging(true);
    setPreviewIndex(indexFromX(x));
    paint(x, 1.03, 50, 50);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragging.current) return;

    const current = measure();
    const x = xFromPointer(event.clientX);
    if (Math.abs(x - dragStartX.current) > 10) suppressClick.current = true;

    const now = performance.now();
    const elapsed = Math.max(8, now - lastDrag.current.time);
    const delta = x - lastDrag.current.x;
    const speed = delta / elapsed;

    const snapPoint = Math.round(x / current.step) * current.step;
    const stretch = stretchFactor(speed, x - snapPoint, current.step);
    // 高光被甩到运动方向的后方，像光斑追不上玻璃。
    const shine = Math.min(80, Math.max(20, 50 - (delta / Math.max(1, current.step)) * 70));
    const origin = delta >= 0 ? 18 : 82;

    lastDrag.current = { x, time: now, velocity: speed };
    paint(x, stretch, shine, origin);

    const next = indexFromX(x);
    setPreviewIndex((previous) => (previous === next ? previous : next));
  }

  function finishDrag(event: React.PointerEvent<HTMLElement>) {
    if (!dragging.current) return;

    const current = measure();
    const x = xFromPointer(event.clientX);
    const velocity = lastDrag.current.velocity;

    const index = targetIndex(x, current.step, velocity, TABS.length);

    dragging.current = false;
    setIsDragging(false);
    setPreviewIndex(null);
    clearPaint();
    event.currentTarget.releasePointerCapture(event.pointerId);

    if (TABS[index].page !== page) {
      tapFeedback();
      onChange(TABS[index].page);
    }
  }

  function handleTabClick(tabPage: Page) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (tabPage !== page) tapFeedback();
    onChange(tabPage);
  }

  return (
    <nav
      ref={navRef}
      className={`tabbar three-tabs ${isDragging ? "dragging" : ""} ${compact ? "compact" : ""}`}
      aria-label="主要导航"
      style={{ "--active-index": activeIndex, "--tab-count": TABS.length } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div className="liquid-indicator" ref={indicatorRef} />
      <div className="tabbar-tabs">
        {TABS.map((tab, index) => (
          <button
            key={tab.page}
            className={`tab ${page === tab.page ? "active" : ""} ${
              previewIndex === index && page !== tab.page ? "preview" : ""
            }`}
            onClick={() => handleTabClick(tab.page)}
          >
            <span className="tab-icon"><TabIcon name={tab.icon} /></span>
            <span className="sr-only">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function Home(props: {
  loading: boolean;
  entries: LedgerEntry[];
  income: number;
  expense: number;
  onAdd: (parsed: ParsedEntry) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const recent = props.entries.slice(0, 8);
  const [quickText, setQuickText] = useState("");
  const [quickDraft, setQuickDraft] = useState<ParsedEntry>(() => parseNaturalLanguage(""));
  const [aiMode, setAiModeState] = useState(() => isAiMode());
  const [isAsking, setIsAsking] = useState(false);
  const askIdRef = useRef(0);
  const [isQuickParsing, setIsQuickParsing] = useState(false);
  const [isSavingQuickEntry, setIsSavingQuickEntry] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(() => {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    return saved ? Number(saved) : 0;
  });
  const [showCustomBudget, setShowCustomBudget] = useState(() => {
    const saved = Number(localStorage.getItem(BUDGET_STORAGE_KEY));
    return saved > 0 && ![1000, 3000, 5000].includes(saved);
  });

  const budgetRatio = monthlyBudget > 0 ? props.expense / monthlyBudget : 0;
  const budgetLevel =
    monthlyBudget <= 0 ? "unset" : budgetRatio >= 1 ? "danger" : budgetRatio >= 0.85 ? "warning" : "safe";
  const budgetMessage =
    budgetLevel === "unset"
      ? "设一个本月限额，我会帮你盯住节奏。"
      : budgetLevel === "danger"
        ? "已经超出限额，接下来每一笔都要谨慎。"
        : budgetLevel === "warning"
          ? "快到限额了，建议放慢一点。"
          : "节奏不错，还在安全范围内。";
  const budgetPercent = Math.min(100, Math.round(budgetRatio * 100));

  useEffect(() => {
    if (!quickText.trim()) {
      setIsQuickParsing(false);
      setIsAsking(false);
      return;
    }

    setIsQuickParsing(true);
    let cancelled = false;

    const timer = window.setTimeout(() => {
      // 规则先出结果，界面不等网络。
      const parsed = parseNaturalLanguage(quickText);
      setQuickDraft(parsed);
      setIsQuickParsing(false);

      if (!aiMode || parsed.type === "income") {
        setIsAsking(false);
        return;
      }

      // 每次请求领一个编号。边打字边请求时，只有最新那次的结果和状态算数，
      // 旧请求回来时编号已经变了，既不会改分类，也不会把「判断中」误关掉。
      const askId = askIdRef.current + 1;
      askIdRef.current = askId;
      setIsAsking(true);

      // 失败、超时、离线都返回 null，界面保持规则的结果。
      classifyRemote(parsed.note, parsed.amount)
        .then((category) => {
          if (cancelled || askIdRef.current !== askId || !category) return;
          setQuickDraft((draft) => (draft.note === parsed.note ? { ...draft, category } : draft));
        })
        .finally(() => {
          if (askIdRef.current === askId) setIsAsking(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quickText, aiMode]);

  function updateBudget(value: number) {
    const normalized = Number.isFinite(value) && value > 0 ? value : 0;
    setMonthlyBudget(normalized);
    if (normalized > 0) {
      localStorage.setItem(BUDGET_STORAGE_KEY, String(normalized));
    } else {
      localStorage.removeItem(BUDGET_STORAGE_KEY);
    }
  }

  function selectPreset(value: number) {
    setShowCustomBudget(false);
    updateBudget(value);
  }

  function updateQuickDraft<K extends keyof ParsedEntry>(key: K, value: ParsedEntry[K]) {
    setQuickDraft((current) => ({ ...current, [key]: value }));
  }

  function updateQuickType(type: EntryType) {
    setQuickDraft((current) => ({
      ...current,
      type,
      category: type === "income" ? "收入" : current.category === "收入" ? "其他" : current.category
    }));
  }

  async function submitQuickEntry() {
    if (!quickDraft.amount || quickDraft.amount <= 0 || isSavingQuickEntry) return;
    setIsSavingQuickEntry(true);
    try {
      await props.onAdd(quickDraft);
      setQuickText("");
      setQuickDraft(parseNaturalLanguage(""));
    } finally {
      setIsSavingQuickEntry(false);
    }
  }

  return (
    <section className="page home-page">
      <header className="app-header">
        <div>
          <p className="eyebrow">AI 记账</p>
          <h1>今天花了什么？</h1>
        </div>
      </header>

      <section className="balance-card">
        <div className="balance-topline">
          <span>本月支出</span>
          <span>{toDateInputValue(new Date()).slice(0, 7)}</span>
        </div>
        <strong>{currency.format(props.expense)}</strong>
        <div className="mini-ledger">
          <div className="income">
            <span>收入</span>
            <b>{currency.format(props.income)}</b>
          </div>
          <div className="expense">
            <span>结余</span>
            <b>{currency.format(props.income - props.expense)}</b>
          </div>
        </div>
        <div className={`budget-strip ${budgetLevel}`}>
          <div className="budget-copy">
            <span>本月限额</span>
            <strong>{monthlyBudget > 0 ? `已用 ${currency.format(props.expense)} / ${currency.format(monthlyBudget)}` : "尚未设置"}</strong>
            <p>{budgetMessage}</p>
          </div>
          <div className="budget-options" aria-label="选择本月限额">
            {[1000, 3000, 5000].map((value) => (
              <button
                key={value}
                type="button"
                className={monthlyBudget === value && !showCustomBudget ? "active" : ""}
                aria-pressed={monthlyBudget === value && !showCustomBudget}
                onClick={() => selectPreset(value)}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              className={showCustomBudget ? "active" : ""}
              aria-pressed={showCustomBudget}
              onClick={() => setShowCustomBudget(true)}
            >
              自定义
            </button>
          </div>
          {showCustomBudget && (
            <label className="custom-budget-input">
              <span>自定义限额</span>
              <input
                inputMode="decimal"
                type="number"
                min="0"
                step="100"
                value={monthlyBudget || ""}
                onChange={(event) => updateBudget(Number(event.target.value))}
                placeholder="输入金额"
                aria-label="自定义本月限额"
              />
            </label>
          )}
          <div
            className="budget-track"
            role="progressbar"
            aria-label="本月限额使用进度"
            aria-valuemin={0}
            aria-valuemax={monthlyBudget || undefined}
            aria-valuenow={monthlyBudget > 0 ? Math.min(props.expense, monthlyBudget) : 0}
          >
            <div style={{ width: `${monthlyBudget > 0 ? budgetPercent : 0}%` }} />
          </div>
        </div>
      </section>

      <section className="quick-entry">
        <div className="quick-entry-heading">
          <label htmlFor="quick-entry">一句话快速记账</label>
          <button
            type="button"
            className={`ai-toggle ${aiMode ? "on" : ""}`}
            onClick={() => {
              const next = !aiMode;
              setAiModeState(next);
              setAiMode(next);
            }}
            aria-pressed={aiMode}
            title={aiMode ? "AI 分类已开启，联网时用模型判断分类" : "AI 分类已关闭，只用内置规则"}
          >
            AI
          </button>
        </div>
        <div className="quick-entry-box">
          <input
            id="quick-entry"
            value={quickText}
            onChange={(event) => setQuickText(event.target.value)}
            placeholder="今天奶茶18元"
          />
        </div>
        <p className={`quick-parse-status ${isQuickParsing ? "is-parsing" : ""}`} role="status">
          {isQuickParsing
            ? "正在识别..."
            : isAsking
              ? "AI 判断中…"
              : quickText.trim()
                ? aiMode
                  ? "已识别，可直接修改后记账"
                  : "已识别（内置规则），可直接修改后记账"
                : "也可以直接填写金额和分类"}
        </p>
        <div className="quick-fields">
          <label className="quick-amount-field" htmlFor="quick-amount">
            <span>金额</span>
            <input
              id="quick-amount"
              inputMode="decimal"
              type="number"
              min="0"
              step="0.01"
              value={quickDraft.amount || ""}
              onChange={(event) => updateQuickDraft("amount", Number(event.target.value))}
              placeholder="0.00"
            />
          </label>
          <label className="quick-category-field" htmlFor="quick-category">
            <span>分类</span>
            <select
              id="quick-category"
              value={quickDraft.category}
              onChange={(event) => updateQuickDraft("category", event.target.value as Category)}
            >
              {categoryOptions()
                .filter((category) => (quickDraft.type === "income" ? category === "收入" : category !== "收入"))
                .map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="quick-type-control" role="group" aria-label="账目类型">
          <button
            type="button"
            className={quickDraft.type === "expense" ? "active expense" : ""}
            aria-pressed={quickDraft.type === "expense"}
            onClick={() => updateQuickType("expense")}
          >
            支出
          </button>
          <button
            type="button"
            className={quickDraft.type === "income" ? "active income" : ""}
            aria-pressed={quickDraft.type === "income"}
            onClick={() => updateQuickType("income")}
          >
            收入
          </button>
        </div>
        <button
          className="primary-button quick-save-button"
          disabled={!quickDraft.amount || quickDraft.amount <= 0 || isSavingQuickEntry}
          onClick={submitQuickEntry}
        >
          {isSavingQuickEntry ? "正在保存..." : "记一笔"}
        </button>
        <div className="quick-hints">
          <button type="button" onClick={() => setQuickText("今天奶茶18元")}>奶茶18</button>
          <button type="button" onClick={() => setQuickText("昨天打车42.5元")}>打车42.5</button>
          <button type="button" onClick={() => setQuickText("工资到账5000")}>工资5000</button>
        </div>
      </section>

      <section className="section">
        <div className="section-title">
          <h2>最近记录</h2>
          <span>{props.entries.length} 笔</span>
        </div>
        {props.loading && <p className="empty">正在读取本地账本...</p>}
        {!props.loading && recent.length === 0 && <p className="empty">还没有记录，先从一杯奶茶开始也行。</p>}
        <div className="entry-list">
          {recent.map((entry) => (
            <EntryItem key={entry.id} entry={entry} onDelete={props.onDelete} />
          ))}
        </div>
      </section>
    </section>
  );
}

function ClearButton({
  entries,
  onImport,
  onClear
}: {
  entries: LedgerEntry[];
  onImport: (imported: LedgerEntry[]) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(() => readBackup());
  const [restoring, setRestoring] = useState(false);

  async function confirmClear() {
    setWorking(true);

    // 顺序很重要：备份先落地，再触发下载，最后才动数据。
    const saved = saveBackup(entries);
    if (!saved) {
      setWorking(false);
      window.alert("备份没能写入本机存储，已取消清空。");
      return;
    }

    downloadCsv(entries);
    await onClear();

    setBackup(saved);
    setWorking(false);
    setConfirming(false);
  }

  async function restore() {
    if (!backup) return;
    setRestoring(true);

    const preview = buildImportPreview(backup.csv, entries);
    await onImport(preview.fresh);

    setRestoring(false);
    dropBackup();
    setBackup(null);
  }

  return (
    <>
      <button
        className="icon-button danger"
        onClick={() => setConfirming(true)}
        disabled={!entries.length}
        aria-label="清空账单"
      >
        清空
      </button>

      {backup && (
        <div className="restore-strip">
          <div>
            <strong>备份还在</strong>
            <span>
              {backup.count} 条 · {backup.savedAt.slice(0, 10)} 清空
            </span>
          </div>
          <div className="restore-actions">
            <button
              className="ghost-button"
              onClick={() => {
                dropBackup();
                setBackup(null);
              }}
              disabled={restoring}
            >
              删除
            </button>
            <button className="ghost-button strong" onClick={restore} disabled={restoring}>
              {restoring ? "恢复中…" : "恢复"}
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="清空账单">
          <div className="sheet">
            <p className="eyebrow">危险操作</p>
            <h2>清空全部账单</h2>
            <p className="sheet-copy">
              将删除 {entries.length} 条记录。清空前会自动备份到本机，并导出一份 CSV 文件。
              手机上导出有时只是弹出分享面板，不一定真的存下来了——本机那份备份是保底，清空后可以一键恢复。
            </p>
            <div className="sheet-actions">
              <button className="secondary-button light" onClick={() => setConfirming(false)} disabled={working}>
                取消
              </button>
              <button className="primary-button danger" onClick={confirmClear} disabled={working}>
                {working ? "处理中…" : "备份并清空"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ImportButton({
  entries,
  onImport
}: {
  entries: LedgerEntry[];
  onImport: (imported: LedgerEntry[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const text = await file.text();
    setFileName(file.name);
    setPreview(buildImportPreview(text, entries));
  }

  async function confirmImport() {
    if (!preview) return;
    setSaving(true);
    await onImport(preview.fresh);
    setSaving(false);
    setPreview(null);
  }

  return (
    <>
      <button className="icon-button" onClick={() => inputRef.current?.click()} aria-label="导入 CSV">
        导入
      </button>
      <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden-file-input" onChange={handleFile} />
      {preview && (
        <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="导入预览">
          <div className="sheet">
            <p className="eyebrow">{fileName}</p>
            <h2>导入预览</h2>
            <ul className="import-summary">
              <li>
                <span>可导入</span>
                <b>{preview.fresh.length} 条</b>
              </li>
              <li>
                <span>重复跳过</span>
                <b>{preview.duplicates} 条</b>
              </li>
              <li>
                <span>无法识别</span>
                <b>{preview.issues.length} 行</b>
              </li>
            </ul>
            {preview.issues.length > 0 && (
              <div className="import-issues">
                {preview.issues.slice(0, 5).map((issue) => (
                  <p key={`${issue.line}-${issue.reason}`}>
                    {issue.line > 0 ? `第 ${issue.line} 行 · ` : ""}
                    {issue.reason}
                  </p>
                ))}
                {preview.issues.length > 5 && <p>另有 {preview.issues.length - 5} 行同样被跳过。</p>}
              </div>
            )}
            <div className="sheet-actions">
              <button className="secondary-button light" onClick={() => setPreview(null)} disabled={saving}>
                取消
              </button>
              <button className="primary-button" onClick={confirmImport} disabled={saving || !preview.fresh.length}>
                {saving ? "导入中…" : `导入 ${preview.fresh.length} 条`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MonthlyStats({
  entries,
  onExport,
  onImport,
  onClear
}: {
  entries: LedgerEntry[];
  onExport: () => void;
  onImport: (imported: LedgerEntry[]) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const rows = useMemo(() => {
    const map = new Map<string, { month: string; income: number; expense: number }>();
    entries.forEach((entry) => {
      const key = monthKey(entry.date);
      const row = map.get(key) || { month: key, income: 0, expense: 0 };
      row[entry.type] += entry.amount;
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [entries]);
  const currentYear = String(new Date().getFullYear());
  const yearRows = rows.filter((row) => row.month.startsWith(currentYear));
  const yearIncome = yearRows.reduce((sum, row) => sum + row.income, 0);
  const yearExpense = yearRows.reduce((sum, row) => sum + row.expense, 0);
  const activeMonths = yearRows.filter((row) => row.income > 0 || row.expense > 0).length;
  const averageExpense = yearExpense / Math.max(1, activeMonths);
  const highestExpenseMonth = yearRows.reduce(
    (highest, row) => (row.expense > highest.expense ? row : highest),
    { month: "暂无", income: 0, expense: 0 }
  );

  const max = Math.max(1, ...rows.map((row) => Math.max(row.income, row.expense)));

  return (
    <section className="page">
      <header className="app-header plain-header">
        <div>
          <p className="eyebrow">趋势</p>
          <h1>月度统计</h1>
        </div>
        <div className="header-actions">
          <ClearButton entries={entries} onImport={onImport} onClear={onClear} />
          <ImportButton entries={entries} onImport={onImport} />
          <button className="icon-button" onClick={onExport} disabled={!entries.length} aria-label="导出 CSV">
            导出
          </button>
        </div>
      </header>
      <section className="year-card">
        <div className="balance-topline">
          <span>{currentYear} 年支出</span>
          <span>{activeMonths} 个月有记录</span>
        </div>
        <strong>{currency.format(yearExpense)}</strong>
        <div className="year-grid">
          <div className="income">
            <span>年收入</span>
            <b>{currency.format(yearIncome)}</b>
          </div>
          <div className={yearIncome - yearExpense >= 0 ? "income" : "expense"}>
            <span>年结余</span>
            <b>{currency.format(yearIncome - yearExpense)}</b>
          </div>
          <div>
            <span>月均支出</span>
            <b>{currency.format(averageExpense)}</b>
          </div>
          <div>
            <span>最高月份</span>
            <b>
              {highestExpenseMonth.month} · {currency.format(highestExpenseMonth.expense)}
            </b>
          </div>
        </div>
      </section>
      {rows.length === 0 && <p className="empty">有记录后，这里会显示每个月的收入和支出。</p>}
      <div className="stats-list">
        {rows.map((row) => (
          <article className="stat-row" key={row.month}>
            <div className="stat-heading">
              <strong>{row.month}</strong>
              <span>结余 {currency.format(row.income - row.expense)}</span>
            </div>
            <Bar label="收入" value={row.income} max={max} tone="income" />
            <Bar label="支出" value={row.expense} max={max} tone="expense" />
          </article>
        ))}
      </div>
    </section>
  );
}

type RangeKey = "month" | "quarter" | "year" | "all";

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "month", label: "本月" },
  { key: "quarter", label: "近三月" },
  { key: "year", label: "今年" },
  { key: "all", label: "全部" }
];

function rangeStart(range: RangeKey, now = new Date()): string | null {
  if (range === "all") return null;

  const start = new Date(now);
  if (range === "month") start.setDate(1);
  if (range === "quarter") start.setMonth(start.getMonth() - 2, 1);
  if (range === "year") start.setMonth(0, 1);

  return toDateInputValue(start);
}

function CategoryStats({ entries }: { entries: LedgerEntry[] }) {
  const [range, setRange] = useState<RangeKey>("month");
  const [openCategory, setOpenCategory] = useState<Category | null>(null);

  const expenseEntries = useMemo(() => {
    const from = rangeStart(range);
    return entries.filter((entry) => entry.type === "expense" && (!from || entry.date >= from));
  }, [entries, range]);

  const rows = useMemo(
    () =>
      CATEGORIES.filter((category) => category !== "收入")
        .map((category) => {
          const own = expenseEntries.filter((entry) => entry.category === category);
          return {
            category,
            total: own.reduce((sum, entry) => sum + entry.amount, 0),
            entries: own.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
          };
        })
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total),
    [expenseEntries]
  );

  const max = Math.max(1, ...rows.map((row) => row.total));
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);

  return (
    <section className="page">
      <header className="app-header plain-header">
        <div>
          <p className="eyebrow">支出结构</p>
          <h1>分类统计</h1>
        </div>
        <label className="range-select">
          <span className="sr-only">统计范围</span>
          <select
            value={range}
            onChange={(event) => {
              setRange(event.target.value as RangeKey);
              setOpenCategory(null);
            }}
          >
            {RANGES.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {rows.length === 0 ? (
        <p className="empty">这段时间还没有支出记录。</p>
      ) : (
        <p className="range-total">
          共 {expenseEntries.length} 笔 · {currency.format(grandTotal)}
        </p>
      )}

      <div className="stats-list">
        {rows.map((row) => {
          const open = openCategory === row.category;

          return (
            <article className={`category-row ${open ? "open" : ""}`} key={row.category}>
              <button
                className="category-toggle"
                onClick={() => setOpenCategory(open ? null : row.category)}
                aria-expanded={open}
              >
                <div className="stat-heading">
                  <strong>
                    {row.category}
                    <em>{row.entries.length} 笔</em>
                  </strong>
                  <span className="expense">{currency.format(row.total)}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill expense" style={{ width: `${Math.max(4, (row.total / max) * 100)}%` }} />
                </div>
              </button>

              {open && (
                <ul className="category-detail">
                  {row.entries.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.note}</strong>
                        <span>{entry.date}</span>
                      </div>
                      <b>{currency.format(entry.amount)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "income" | "expense" }) {
  return (
    <div className="bar-line">
      <span>{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
      </div>
      <strong className={tone}>{currency.format(value)}</strong>
    </div>
  );
}

function EntryItem({ entry, onDelete }: { entry: LedgerEntry; onDelete: (id: string) => void }) {
  return (
    <article className="entry-item">
      <div className={`category-pill ${entry.type}`}>{entry.category}</div>
      <div className="entry-main">
        <strong>{entry.note}</strong>
        <span>{entry.date}</span>
      </div>
      <div className={`entry-amount ${entry.type}`}>
        {entry.type === "income" ? "+" : "-"}
        {currency.format(entry.amount)}
      </div>
      <button className="delete-button" aria-label={`删除${entry.note}`} onClick={() => onDelete(entry.id)}>
        ×
      </button>
    </article>
  );
}

registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
