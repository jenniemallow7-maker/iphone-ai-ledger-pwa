import { CATEGORIES, type Category, type ParsedEntry } from "./types";

const categoryRules: Array<[Category, RegExp]> = [
  ["收入", /工资|到账|奖金|红包|报销|收入|转入|兼职|收款|利息/],
  ["餐饮", /奶茶|咖啡|早餐|午餐|晚餐|夜宵|外卖|餐|饭|面|粉|火锅|烧烤|零食|水果|饮料|食堂/],
  ["交通", /地铁|公交|打车|出租|滴滴|高铁|火车|机票|停车|加油|通勤|交通|单车|骑行/],
  ["购物", /淘宝|京东|拼多多|买|购物|衣服|鞋|包|数码|超市|便利店|日用品|快递/],
  ["娱乐", /电影|游戏|会员|演唱会|酒吧|旅游|景点|娱乐|剧本|音乐|聚会/],
  ["住房", /房租|租金|物业|水费|电费|燃气|网费|宽带|房贷|住房|家政/]
];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(text: string, now = new Date()): string {
  const normalized = text.replace(/\s+/g, "");
  const today = new Date(now);

  if (/前天/.test(normalized)) {
    today.setDate(today.getDate() - 2);
    return toDateInputValue(today);
  }

  if (/昨天|昨日/.test(normalized)) {
    today.setDate(today.getDate() - 1);
    return toDateInputValue(today);
  }

  if (/明天|明日/.test(normalized)) {
    today.setDate(today.getDate() + 1);
    return toDateInputValue(today);
  }

  const fullDate = normalized.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?/);
  if (fullDate) {
    const [, year, month, day] = fullDate;
    return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  }

  const monthDay = normalized.match(/(\d{1,2})[月/-](\d{1,2})日?/);
  if (monthDay) {
    const [, month, day] = monthDay;
    return `${today.getFullYear()}-${pad(Number(month))}-${pad(Number(day))}`;
  }

  return toDateInputValue(today);
}

function parseAmount(text: string): number {
  const match = text.replace(/,/g, "").match(/(?:¥|￥)?\s*(\d+(?:\.\d{1,2})?)\s*(?:元|块|rmb|RMB)?/);
  return match ? Number(Number(match[1]).toFixed(2)) : 0;
}

function inferType(text: string, category: Category): ParsedEntry["type"] {
  if (category === "收入") return "income";
  if (/收入|到账|工资|奖金|收款|转入|\+/.test(text)) return "income";
  return "expense";
}

function inferCategory(text: string): Category {
  for (const [category, rule] of categoryRules) {
    if (rule.test(text)) return category;
  }
  return "其他";
}

function cleanNote(text: string): string {
  return (
    text
      .replace(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})日?/g, "")
      .replace(/(\d{1,2})[月/-](\d{1,2})日?/g, "")
      .replace(/今天|今日|昨天|昨日|前天|明天|明日/g, "")
      .replace(/(?:¥|￥)?\s*\d+(?:\.\d{1,2})?\s*(?:元|块|rmb|RMB)?/g, "")
      .replace(/到账|支出|消费|花了|花|收入/g, "")
      .replace(/\s+/g, " ")
      .trim() || "未填写备注"
  );
}

export function parseNaturalLanguage(text: string): ParsedEntry {
  const amount = parseAmount(text);
  const category = inferCategory(text);
  const type = inferType(text, category);

  return {
    type,
    amount,
    category: type === "income" ? "收入" : category === "收入" ? "其他" : category,
    note: cleanNote(text),
    date: parseDate(text)
  };
}

export function categoryOptions() {
  return CATEGORIES;
}
