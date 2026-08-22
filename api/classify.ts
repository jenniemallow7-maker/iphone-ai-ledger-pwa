// Vercel serverless 函数：把分类请求转发给 Gemini。
// API key 只存在于服务端环境变量，永远不会出现在前端 bundle 里。

const CATEGORIES = ["餐饮", "交通", "购物", "娱乐", "住房", "医疗", "通讯", "教育", "人情", "其他"];
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface Item {
  note: string;
  amount: number;
}

function buildPrompt(items: Item[]) {
  const list = items.map((item, index) => `${index + 1}. ${item.note}（${item.amount} 元）`).join("\n");

  return [
    "你在给中文记账 app 的支出记录分类。",
    `只能从这些分类里选：${CATEGORIES.join("、")}。`,
    "规则：",
    "- 还款、还债、转账、给出去的整笔生活费，一律归「其他」，因为那不是消费。",
    "- 看不出来是什么就归「其他」，不要硬猜。",
    "- 只输出一个 JSON 数组，元素是分类名字符串，顺序和条目一致，不要任何解释。",
    "",
    "条目：",
    list
  ].join("\n");
}

function parseCategories(text: string, count: number): string[] | null {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length !== count) return null;
    // 模型有可能编出不存在的分类，落回「其他」而不是写进用户的库
    return parsed.map((value) => (CATEGORIES.includes(value) ? value : "其他"));
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({ error: "GEMINI_API_KEY 未配置" });
    return;
  }

  const items: Item[] = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
  if (!items.length) {
    res.status(400).json({ error: "items 为空" });
    return;
  }

  try {
    const response = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(items) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 }
      })
    });

    if (!response.ok) {
      res.status(502).json({ error: `上游返回 ${response.status}` });
      return;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part: any) => part.text).join("") ?? "";
    const categories = parseCategories(text, items.length);

    if (!categories) {
      res.status(502).json({ error: "无法解析模型输出" });
      return;
    }

    res.status(200).json({ categories });
  } catch (error) {
    res.status(502).json({ error: "调用失败" });
  }
}
