import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { downloadCsv } from "./exportCsv";
import { categoryOptions, parseNaturalLanguage, toDateInputValue } from "./parser";
import { addEntry, deleteEntry, getEntries } from "./storage";
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
        {page === "monthly" && <MonthlyStats entries={entries} onExport={() => downloadCsv(entries)} />}
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
  const [dragX, setDragX] = useState<number | null>(null);
  const [dragPhysics, setDragPhysics] = useState({ scale: 1, shine: 50, origin: 50 });
  const [isDragging, setIsDragging] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.page === page)
  );
  const layout = useRef({ itemWidth: 0, step: 0, maxX: 0 });
  const lastDrag = useRef({ x: 0, time: 0 });
  const dragStartX = useRef(0);
  const suppressClick = useRef(false);

  function measure() {
    const nav = navRef.current;
    if (!nav) return layout.current;
    const styles = window.getComputedStyle(nav);
    const padding = Number.parseFloat(styles.paddingLeft) || 8;
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
    const padding = Number.parseFloat(styles.paddingLeft) || 8;
    const left = nav.getBoundingClientRect().left + padding + current.itemWidth / 2;
    return Math.min(current.maxX, Math.max(0, clientX - left));
  }

  function selectFromX(x: number) {
    const current = measure();
    const index = indexFromX(x);
    onChange(TABS[index].page);
  }

  function indexFromX(x: number) {
    const current = measure();
    return Math.min(TABS.length - 1, Math.max(0, Math.round(x / current.step)));
  }

  function updatePhysics(x: number) {
    const current = measure();
    const now = performance.now();
    const elapsed = Math.max(16, now - lastDrag.current.time);
    const delta = x - lastDrag.current.x;
    const velocity = Math.min(1, Math.abs(delta) / elapsed / 1.2);
    const snapPoint = Math.round(x / current.step) * current.step;
    const pull = Math.min(1, Math.abs(x - snapPoint) / Math.max(1, current.step / 2));
    const scale = 1 + velocity * 0.08 + pull * 0.07;
    const shine = Math.min(78, Math.max(22, 50 + (delta / Math.max(1, current.step)) * 70));
    const origin = delta >= 0 ? 18 : 82;

    lastDrag.current = { x, time: now };
    setDragPhysics({ scale, shine, origin });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    measure();
    const x = xFromPointer(event.clientX);
    dragStartX.current = x;
    suppressClick.current = false;
    lastDrag.current = { x, time: performance.now() };
    setIsDragging(true);
    setDragX(x);
    setPreviewIndex(indexFromX(x));
    setDragPhysics({ scale: 1.03, shine: 50, origin: 50 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!isDragging) return;
    const x = xFromPointer(event.clientX);
    if (Math.abs(x - dragStartX.current) > 10) suppressClick.current = true;
    setDragX(x);
    setPreviewIndex(indexFromX(x));
    updatePhysics(x);
  }

  function finishDrag(event: React.PointerEvent<HTMLElement>) {
    if (!isDragging) return;
    const x = xFromPointer(event.clientX);
    selectFromX(x);
    setDragX(null);
    setPreviewIndex(null);
    setDragPhysics({ scale: 1, shine: 50, origin: 50 });
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleTabClick(tabPage: Page) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onChange(tabPage);
  }

  return (
    <nav
      ref={navRef}
      className={`tabbar three-tabs ${isDragging ? "dragging" : ""}`}
      aria-label="主要导航"
      style={{ "--active-index": activeIndex, "--tab-count": TABS.length } as React.CSSProperties}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div
        className="liquid-indicator"
        style={
          dragX === null
            ? ({ "--shine-x": `${dragPhysics.shine}%` } as React.CSSProperties)
            : ({
                "--shine-x": `${dragPhysics.shine}%`,
                transform: `translate3d(${dragX}px, 0, 0) scaleX(${dragPhysics.scale})`,
                transformOrigin: `${dragPhysics.origin}% 50%`
              } as React.CSSProperties)
        }
      />
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
            {tab.label}
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
      return;
    }

    setIsQuickParsing(true);
    const timer = window.setTimeout(() => {
      setQuickDraft(parseNaturalLanguage(quickText));
      setIsQuickParsing(false);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [quickText]);

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
          <span>自动识别</span>
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
          {isQuickParsing ? "正在识别..." : quickText.trim() ? "已识别，可直接修改后记账" : "也可以直接填写金额和分类"}
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

function MonthlyStats({ entries, onExport }: { entries: LedgerEntry[]; onExport: () => void }) {
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
        <button className="icon-button" onClick={onExport} disabled={!entries.length} aria-label="导出 CSV">
          CSV
        </button>
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

function CategoryStats({ entries }: { entries: LedgerEntry[] }) {
  const expenseEntries = entries.filter((entry) => entry.type === "expense");
  const rows = CATEGORIES.filter((category) => category !== "收入").map((category) => ({
    category,
    total: expenseEntries.filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amount, 0)
  })).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((row) => row.total));

  return (
    <section className="page">
      <header className="plain-header">
        <p className="eyebrow">支出结构</p>
        <h1>分类统计</h1>
      </header>
      {expenseEntries.length === 0 && <p className="empty">支出分类会在这里汇总，帮你看清钱花到哪里了。</p>}
      <div className="stats-list">
        {rows.map((row) => (
          <article className="category-row" key={row.category}>
            <div className="stat-heading">
              <strong>{row.category}</strong>
              <span className="expense">{currency.format(row.total)}</span>
            </div>
            <div className="bar-track">
              <div className="bar-fill expense" style={{ width: `${Math.max(4, (row.total / max) * 100)}%` }} />
            </div>
          </article>
        ))}
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
