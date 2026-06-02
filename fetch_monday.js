// fetch_monday.js — 由 GitHub Action 运行,从 monday 拉取「Xero 发票同步」board,生成 data.json
// 需要环境变量 MONDAY_TOKEN(存在 GitHub Secrets 里,绝不写进网页)
// Node 18+(自带 fetch)

const TOKEN    = process.env.MONDAY_TOKEN;
const BOARD_ID = process.env.BOARD_ID || "5028690641";
const API      = "https://api.monday.com/v2";

// 列 ID(来自你的 board)
const COL = {
  invoice:   "text_mm3jyqh",
  reference: "text_mm3j2nx9",
  total:     "numeric_mm3jsm3k",   // Total (AUD) 含GST
  paid:      "numeric_mm3jpd74",   // Amount Paid (AUD) 实收
  due:       "numeric_mm3jn4xm",   // Amount Due (AUD) 未收
  status:    "color_mm3j1m2f",     // Payment Status
  fullPaid:  "date_mm3jp00z",      // Full Paid Date
  issue:     "date_mm3jfqxr",      // Issue Date 开单日期
};

if (!TOKEN) { console.error("缺少 MONDAY_TOKEN(请在 GitHub Secrets 设置)"); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 健壮请求:网关抖动/非JSON/5xx/429 自动重试
async function gql(query, variables, attempt = 1) {
  const MAX = 5;
  let res, text;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": TOKEN, "API-Version": "2024-01" },
      body: JSON.stringify({ query, variables }),
    });
    text = await res.text();
  } catch (e) {
    if (attempt <= MAX) { console.warn(`网络异常,重试 ${attempt}/${MAX}…`); await sleep(2000 * attempt); return gql(query, variables, attempt + 1); }
    throw new Error("网络请求失败: " + e.message);
  }
  if (!res.ok) {
    if ((res.status >= 500 || res.status === 429) && attempt <= MAX) {
      console.warn(`HTTP ${res.status},重试 ${attempt}/${MAX}…`); await sleep(2000 * attempt); return gql(query, variables, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  let json;
  try { json = JSON.parse(text); }
  catch (e) {
    // 返回的不是 JSON(如 "upstream connect error" 网关错误)→ 重试
    if (attempt <= MAX) { console.warn(`返回非JSON,重试 ${attempt}/${MAX}: ${text.slice(0, 80)}`); await sleep(2000 * attempt); return gql(query, variables, attempt + 1); }
    throw new Error("返回非JSON: " + text.slice(0, 300));
  }
  if (json.errors) {
    const msg = JSON.stringify(json.errors);
    if (/complexity|timeout/i.test(msg) && attempt <= MAX) { console.warn(`复杂度/超时,重试 ${attempt}/${MAX}…`); await sleep(2000 * attempt); return gql(query, variables, attempt + 1); }
    throw new Error(msg);
  }
  return json.data;
}

const ids = `["${COL.invoice}","${COL.reference}","${COL.total}","${COL.paid}","${COL.due}","${COL.status}","${COL.fullPaid}","${COL.issue}"]`;

const Q_FIRST = `query ($board: ID!) {
  boards(ids: [$board]) {
    items_page(limit: 100) {
      cursor
      items { name column_values(ids: ${ids}) { id text } }
    }
  }
}`;

const Q_NEXT = `query ($cursor: String!) {
  next_items_page(cursor: $cursor, limit: 100) {
    cursor
    items { name column_values(ids: ${ids}) { id text } }
  }
}`;

function stripCustomer(name) {
  return String(name || "").replace(/^INV-?\s*\d+\s*[-–:]?\s*/i, "").trim();
}
const num = v => parseFloat(String(v || "").replace(/[^0-9.\-]/g, "")) || 0;

function mapItem(it) {
  const cv = {};
  (it.column_values || []).forEach(c => { cv[c.id] = c.text; });
  const inv = cv[COL.invoice] || (String(it.name).match(/INV-?\d+/i)?.[0] || "");
  return {
    inv,
    ref: cv[COL.reference] || "",
    total: num(cv[COL.total]),
    paid: num(cv[COL.paid]),
    due: num(cv[COL.due]),
    status: cv[COL.status] || "",
    fpd: cv[COL.fullPaid] || null,
    issue: cv[COL.issue] || null,
    customer: stripCustomer(it.name),
  };
}

(async () => {
  const out = [];
  const isCredit = s => /credit|贷项|退/i.test(s || "");
  let data = await gql(Q_FIRST, { board: BOARD_ID });
  let page = data.boards[0].items_page;
  page.items.forEach(it => { const m = mapItem(it); if (!isCredit(m.status)) out.push(m); });
  let cursor = page.cursor;
  let pages = 1;
  while (cursor) {
    const d = await gql(Q_NEXT, { cursor });
    const np = d.next_items_page;
    np.items.forEach(it => { const m = mapItem(it); if (!isCredit(m.status)) out.push(m); });
    cursor = np.cursor;
    pages++;
  }
  const fs = await import("node:fs");
  fs.writeFileSync("data.json", JSON.stringify(out));
  console.log(`已写入 data.json:${out.length} 行(${pages} 页,已剔除 Credit)`);
})().catch(e => { console.error("失败:", e.message); process.exit(1); });
