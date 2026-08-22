import { CATEGORIES, type Category, type ParsedEntry } from "./types";

// 每条规则给一个权重：品牌和专有名词权重高，通用词权重低，
// 像「买」这种到处都能碰上的字权重最低，避免它盖掉更准确的线索。
type Rule = { category: Category; weight: number; pattern: RegExp };

const rules: Rule[] = [
  // 餐饮
  { category: "餐饮", weight: 10, pattern: /星巴克|瑞幸|库迪|Manner|manner|喜茶|奈雪|蜜雪冰城|茶百道|古茗|沪上阿姨|霸王茶姬|coco|CoCo|一点点|麦当劳|肯德基|汉堡王|必胜客|德克士|华莱士|塔斯汀|海底捞|西贝|真功夫|老乡鸡|南城香|和府捞面|美团外卖|饿了么|美团买菜|叫了个外卖/ },
  { category: "餐饮", weight: 8, pattern: /奶茶|咖啡|早餐|早饭|午餐|午饭|晚餐|晚饭|夜宵|宵夜|外卖|食堂|火锅|烧烤|自助餐|下午茶|聚餐|请客吃饭|吃饭|喝酒?水?|甜品|蛋糕|面包|披萨|寿司|烤肉|麻辣烫|米线|馄饨|饺子|包子|炸鸡|拿铁|美式|卡布奇诺|摩卡|latte|日料|韩料|西餐|中餐|川菜|粤菜|烤鱼|小龙虾|沙拉|轻食|三明治|汉堡|牛排|烧鸟|居酒屋|早茶|茶餐厅|夜市|煎饼|肉夹馍|烤冷面|手抓饼|凉皮|炒饭|盖饭|快餐|小吃|粥|汤面|雪糕|冰淇淋|冰棍|甜筒|鸡块|鸡翅|薯条|奶昔|果汁|油条|豆浆|豆腐脑|馒头|烧饼|春卷|串串|烤串|卤味|熟食|西瓜|水饺|吃了顿|吃了个|点了份/ },
  { category: "餐饮", weight: 5, pattern: /餐|饭|面|粉|零食|饮料|矿泉水|可乐/ },

  // 交通
  { category: "交通", weight: 10, pattern: /滴滴|高德打车|曹操出行|T3出行|哈啰|青桔|美团单车|共享单车|ETC|etc|12306/ },
  { category: "交通", weight: 8, pattern: /打车|出租车|网约车|地铁|公交|高铁|动车|火车票?|机票|飞机|航班|停车费?|加油|加满油|油费|充电费?|过路费|高速费|车位|停车位|洗车|车险|年检|保养|单车|骑行|通勤|车费|船票|长途汽车|大巴|班车|摆渡车|机场快线|代驾|车票|客车|地铁卡|公交卡/ },
  { category: "交通", weight: 5, pattern: /交通|出行/ },

  // 购物
  { category: "购物", weight: 10, pattern: /淘宝|天猫|京东|拼多多|唯品会|得物|闲鱼|山姆|开市客|Costco|costco|盒马|永辉|大润发|沃尔玛|物美|便利蜂|全家|罗森|7-?11|优衣库|Zara|zara|耐克|阿迪达斯|无印良品|宜家|名创优品/ },
  { category: "购物", weight: 8, pattern: /超市|商场|便利店|菜市场|水果店|日用品|洗发水|沐浴露|牙膏|牙刷|纸巾|洗衣液|洗洁精|清洁剂|垃圾袋|保鲜膜|护手霜|保温杯|囤货|囤了|双十一|双11|618|化妆品|护肤品|口红|面膜|衣服|裤子|鞋子?|外套|包包|数码|耳机|手机|电脑|键盘|鼠标|显示器|主机|硬盘|内存条?|路由器|音箱|摄像头|数据线|充电器|充电宝|支架|螺丝|配件|眼罩|鼻托|香烟|烟(?!花)|软件|插件|应用商店|快递费?|网购|下单/ },
  { category: "购物", weight: 4, pattern: /购物|买菜|水果|零钱?花/ },
  { category: "购物", weight: 1, pattern: /买|购/ },

  // 娱乐
  { category: "娱乐", weight: 10, pattern: /Netflix|netflix|爱奇艺|腾讯视频|优酷|芒果TV|B站|哔哩哔哩|Spotify|网易云|QQ音乐|Steam|steam|剧本杀|密室逃脱|KTV|ktv|唱歌|唱K|K歌|按摩卡|听音乐|听歌|音乐|电视|追剧|看剧|综艺|播客|迪士尼|环球影城/ },
  { category: "娱乐", weight: 8, pattern: /电影票?|演唱会|音乐节|话剧|展览|演出|音乐会|相声|脱口秀|爬山|漂流|滑雪|露营|温泉|剧场|展会|手办|乐高|桌游|switch|Switch|PS5|游戏|皮肤|抽卡|健身房?|瑜伽|游泳|球场|台球|桌游|酒吧|夜店|旅游|旅行|景点|门票|民宿|酒店|住宿|按摩|spa|SPA/ },
  { category: "娱乐", weight: 4, pattern: /娱乐|会员|年卡|月卡|订阅/ },

  // 住房
  { category: "住房", weight: 8, pattern: /房租|租金|物业费?|水费|电费|燃气费?|天然气|取暖费|房贷|按揭|中介费|保洁|家政|搬家|装修|家具|家电|维修|房东|空调|冰箱|洗衣机|热水器|油烟机|马桶|水管|床单|被罩|被子|枕头|窗帘|沙发|衣柜|灯泡|台灯|请人修|修理|水电煤|水电费|下水道|疏通|通下水|暖气费?|门锁|锁芯|防盗门|地板|墙面|打扫|阿姨/ },
  { category: "住房", weight: 4, pattern: /住房|家里|家用/ },

  // 医疗
  { category: "医疗", weight: 10, pattern: /挂.{0,3}号|专家号|门诊|就诊|就医|复诊|急诊|住院|体检|看病|看牙|拔牙|补牙|洗牙|正畸|智齿|牙(?!膏|刷)|疫苗|输液|化验|拍片|CT|核磁|配眼镜|隐形眼镜/ },
  { category: "医疗", weight: 6, pattern: /药(?!妆)/ },
  { category: "医疗", weight: 8, pattern: /医院|诊所|药店|药房|买药|感冒药|退烧药|创可贴|口罩|医保|医疗|医生|检查费|手术|理疗|中医|西医|中药|保健品|益生菌|钙片|鱼油|胃镜|肠镜|B超|彩超|心电图|挂水|糖浆|药膏|药水|消炎药|止痛药|维生素|退热贴|体温计|绷带/ },

  // 通讯
  { category: "通讯", weight: 10, pattern: /话费|电话费|手机费|通话费|流量包?|宽带|移动充值|联通充值|电信充值|iCloud|icloud|VPN|vpn|梯子|加速器|云空间|云储存|云存储/ },
  { category: "通讯", weight: 6, pattern: /中国移动|中国联通|中国电信|充话费|网费|通讯|手机卡|副卡/ },

  // 教育
  { category: "教育", weight: 10, pattern: /学费|网课|培训班|补习|辅导班|驾校|驾照|科目[一二三]|补考费|考试报名|报名费|教材|课本|练习册|习题|作业本|上课|听课|自习|Anki|anki|背单词|文具|学杂费|兴趣班|夏令营|考研|雅思|托福|钢琴课?|画画班?|舞蹈班?|学钢琴|学画画|书法班?/ },
  { category: "教育", weight: 6, pattern: /书店|买书|电子书|课程|讲座|教育|学习/ },

  // 人情
  { category: "人情", weight: 10, pattern: /随礼|随份子|随了|份子钱|礼金|彩礼|压岁钱|人情|孝敬|赡养|发红包|给.{0,4}红包|结婚礼|满月酒|白事|红包/ },
  { category: "人情", weight: 8, pattern: /生日礼物|礼物|送礼|请客(?!户)|AA|请了.{0,4}吃|给妈妈|给爸爸|给爸妈|给父母|给爷爷|给奶奶|给老妈|给老爸|给孩子|给儿子|给女儿|转给|转了给|给.{1,3}打了钱/ },
  { category: "人情", weight: 4, pattern: /结婚|婚礼|生日|喜酒/ }
];

// 收入线索。放在支出线索之前判断，但会被下面的 expenseOverride 否决。
const incomePattern =
  /工资|薪水|薪资|奖金|年终奖|绩效|到账|报销|收款|转入|兼职|外快|副业|稿费|收益|利息|分红|理财|退款|退货|返现|返利|中奖|卖了|卖掉|卖出|卖闲置|二手卖|基金|股票|赚了|盈利|公司发|单位发|发工资|收入|还我|还给我|收到|收红包|进账|入账|收款/;

// 这些词里虽然带着收入关键字，但其实是支出。
const expenseOverride = /还信用卡|还款|还花呗|还白条|还贷|发红包|给.{0,4}红包|随礼|份子钱|礼金|压岁钱|买理财|存进|转出|转给/;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const fullDatePattern = /(\d{4})\s*[年/-]\s*(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*日?/;
const monthDayPattern = /(\d{1,2})\s*[月/-]\s*(\d{1,2})\s*日?/;
// 数量词：「3件」「两杯」这类不是金额，取金额前先剔掉。
const quantityPattern =
  /\d+(?:\.\d+)?\s*(?:个|件|杯|张|份|盒|瓶|只|双|本|斤|台|条|包|袋|碗|人|位|次|天|晚|间|部|支|箱|桶|套|片|颗|根)/g;

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

  const fullDate = normalized.match(fullDatePattern);
  if (fullDate) {
    const [, year, month, day] = fullDate;
    return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
  }

  const monthDay = normalized.match(monthDayPattern);
  if (monthDay) {
    const [, month, day] = monthDay;
    return `${today.getFullYear()}-${pad(Number(month))}-${pad(Number(day))}`;
  }

  return toDateInputValue(today);
}

function parseAmount(text: string): number {
  const stripped = text
    .replace(/,/g, "")
    .replace(new RegExp(fullDatePattern.source, "g"), " ")
    .replace(new RegExp(monthDayPattern.source, "g"), " ")
    .replace(quantityPattern, " ");

  // 带货币标记的数字最可信，取最后一个。
  const marked = [
    ...stripped.matchAll(/(?:¥|￥|\$)\s*(\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:元|块钱?|圆|rmb|RMB|人民币)/g)
  ];
  const lastMarked = marked[marked.length - 1];
  const markedValue = lastMarked && (lastMarked[1] ?? lastMarked[2]);
  if (markedValue) return Number(Number(markedValue).toFixed(2));

  // 否则取最后一个数字：中文习惯把金额放句尾（「奶茶 1杯 18」）。
  const numbers = [...stripped.matchAll(/\d+(?:\.\d{1,2})?/g)];
  const lastNumber = numbers[numbers.length - 1];
  return lastNumber ? Number(Number(lastNumber[0]).toFixed(2)) : 0;
}

function inferType(text: string): ParsedEntry["type"] {
  if (expenseOverride.test(text)) return "expense";
  if (incomePattern.test(text)) return "income";
  if (/^\+/.test(text.trim())) return "income";
  return "expense";
}

/**
 * 按「权重 + 命中长度」打分，取分最高的分类。命中越长说明线索越具体
 * （「水果店」比「水果」更能说明是购物），同分时靠前的规则优先。
 */
function inferCategory(text: string): Category {
  let best: { category: Category; score: number } | null = null;

  for (const rule of rules) {
    const match = text.match(rule.pattern);
    if (!match) continue;

    const score = rule.weight * 10 + match[0].length;
    if (!best || score > best.score) best = { category: rule.category, score };
  }

  return best?.category ?? "其他";
}

function cleanNote(text: string): string {
  return (
    text
      .replace(new RegExp(fullDatePattern.source, "g"), "")
      .replace(new RegExp(monthDayPattern.source, "g"), "")
      .replace(/今天|今日|昨天|昨日|前天|明天|明日/g, "")
      .replace(/(?:¥|￥)?\s*\d+(?:\.\d{1,2})?\s*(?:元|块钱?|rmb|RMB)?/g, "")
      .replace(/到账|支出|消费|花了|花|收入/g, "")
      .replace(/\s+/g, " ")
      .trim() || "未填写备注"
  );
}

export function parseNaturalLanguage(text: string): ParsedEntry {
  const type = inferType(text);
  const category = inferCategory(text);

  return {
    type,
    amount: parseAmount(text),
    category: type === "income" ? "收入" : category === "收入" ? "其他" : category,
    note: cleanNote(text),
    date: parseDate(text)
  };
}

export function categoryOptions() {
  return CATEGORIES;
}
