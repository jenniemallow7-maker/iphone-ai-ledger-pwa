import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { downloadCsv } from "./exportCsv";
import { categoryOptions, parseNaturalLanguage, toDateInputValue } from "./parser";
import { addEntry, deleteEntry, getEntries } from "./storage";
import { CATEGORIES, type Category, type EntryType, type LedgerEntry, type Page, type ParsedEntry } from "./types";
import { registerServiceWorker } from "./pwa";
import "./styles.css";

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY" });

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
            onAdd={() => setPage("add")}
            onExport={() => downloadCsv(entries)}
            onDelete={handleDelete}
          />
        )}
        {page === "add" && <AddEntry onAdd={handleAdd} />}
        {page === "monthly" && <MonthlyStats entries={entries} />}
        {page === "categories" && <CategoryStats entries={entries} />}
      </main>
      <nav className="tabbar" aria-label="主要导航">
        <TabButton active={page === "home"} label="首页" icon="⌂" onClick={() => setPage("home")} />
        <TabButton active={page === "add"} label="记账" icon="＋" onClick={() => setPage("add")} />
        <TabButton active={page === "monthly"} label="月度" icon="▥" onClick={() => setPage("monthly")} />
        <TabButton active={page === "categories"} label="分类" icon="◌" onClick={() => setPage("categories")} />
      </nav>
    </div>
  );
}

function TabButton(props: { active: boolean; label: string; icon: string; onClick: () => void }) {
  return (
    <button className={`tab ${props.active ? "active" : ""}`} onClick={props.onClick}>
      <span aria-hidden="true">{props.icon}</span>
      {props.label}
    </button>
  );
}

function Home(props: {
  loading: boolean;
  entries: LedgerEntry[];
  income: number;
  expense: number;
  onAdd: () => void;
  onExport: () => void;
  onDelete: (id: string) => void;
}) {
  const recent = props.entries.slice(0, 8);

  return (
    <section className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">本月结余</p>
          <h1>{currency.format(props.income - props.expense)}</h1>
        </div>
        <button className="ghost-button" onClick={props.onExport} disabled={!props.entries.length}>
          导出 CSV
        </button>
      </header>

      <div className="summary-grid">
        <div className="summary income">
          <span>收入</span>
          <strong>{currency.format(props.income)}</strong>
        </div>
        <div className="summary expense">
          <span>支出</span>
          <strong>{currency.format(props.expense)}</strong>
        </div>
      </div>

      <button className="primary-button" onClick={props.onAdd}>
        用一句话记一笔
      </button>

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

function AddEntry(props: { onAdd: (parsed: ParsedEntry) => void }) {
  const [text, setText] = useState("今天奶茶18元");
  const [draft, setDraft] = useState<ParsedEntry>(() => parseNaturalLanguage("今天奶茶18元"));

  function parse() {
    setDraft(parseNaturalLanguage(text));
  }

  function update<K extends keyof ParsedEntry>(key: K, value: ParsedEntry[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <section className="page add-page">
      <header className="plain-header">
        <p className="eyebrow">AI 识别</p>
        <h1>说一句，账就记好了</h1>
      </header>

      <label className="input-label" htmlFor="natural">
        自然语言输入
      </label>
      <textarea
        id="natural"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={parse}
        rows={4}
        placeholder="例如：昨天打车42.5元 / 工资到账5000"
      />
      <button className="secondary-button" onClick={parse}>
        识别内容
      </button>

      <div className="form-grid">
        <label>
          类型
          <select value={draft.type} onChange={(event) => update("type", event.target.value as EntryType)}>
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </label>
        <label>
          金额
          <input
            inputMode="decimal"
            type="number"
            min="0"
            step="0.01"
            value={draft.amount || ""}
            onChange={(event) => update("amount", Number(event.target.value))}
          />
        </label>
        <label>
          分类
          <select value={draft.category} onChange={(event) => update("category", event.target.value as Category)}>
            {categoryOptions().map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          日期
          <input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} />
        </label>
      </div>

      <label className="input-label" htmlFor="note">
        备注
      </label>
      <input id="note" value={draft.note} onChange={(event) => update("note", event.target.value)} />

      <button className="primary-button" disabled={!draft.amount || draft.amount <= 0} onClick={() => props.onAdd(draft)}>
        保存这一笔
      </button>
    </section>
  );
}

function MonthlyStats({ entries }: { entries: LedgerEntry[] }) {
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

  const max = Math.max(1, ...rows.map((row) => Math.max(row.income, row.expense)));

  return (
    <section className="page">
      <header className="plain-header">
        <p className="eyebrow">趋势</p>
        <h1>月度统计</h1>
      </header>
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
              <span>{currency.format(row.total)}</span>
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
      <strong>{currency.format(value)}</strong>
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
