// fetch_monday.js — 由 GitHub Action 运行,从 monday 拉取「Xero 发票同步」board,生成 data.json
// 需要环境变量 MONDAY_TOKEN(存在 GitHub Secrets 里,绝不写进网页)
// Node 18+(自带 fetch)

const TOKEN   = process.env.MONDAY_TOKEN;
const BOARD_ID = process.env.BOARD_ID || "5028690641";
const API = "https://api.monday.com/v2";

// 列 ID(来自你的 board)
const COL = {
  invoice: "text_mm3jyqh",
  reference: "text_mm3j2nx9",
  total: "numeric_mm3jsm3k",
  status: "color_mm3j1m2f",
  fullPaid: "date_mm3jp00z",
};

if (!TOKEN) { console.error("缺少 MONDAY_TOKEN"); process.exit(1); }

async function gql(query, variables) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": TOKEN, "API-Version": "2024-01" },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

const ids = `["${COL.invoice}","${COL.reference}","${COL.total}","${COL.status}","${COL.fullPaid}"]`;

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

function mapItem(it) {
  const cv = {};
  (it.column_values || []).forEach(c => { cv[c.id] = c.text; });
  const inv = cv[COL.invoice] || (String(it.name).match(/INV-?\d+/i)?.[0] || "");
  return {
    inv,
    ref: cv[COL.reference] || "",
    total: parseFloat(String(cv[COL.total] || "").replace(/[^0-9.\-]/g, "")) || 0,
    status: cv[COL.status] || "",
    fpd: cv[COL.fullPaid] || null,
    customer: stripCustomer(it.name),
  };
}

(async () => {
  const out = [];
  let data = await gql(Q_FIRST, { board: BOARD_ID });
  let page = data.boards[0].items_page;
  page.items.forEach(it => out.push(mapItem(it)));
  let cursor = page.cursor;
  while (cursor) {
    const d = await gql(Q_NEXT, { cursor });
    const np = d.next_items_page;
    np.items.forEach(it => out.push(mapItem(it)));
    cursor = np.cursor;
  }
  const fs = await import("node:fs");
  fs.writeFileSync("data.json", JSON.stringify(out));
  console.log(`已写入 data.json:${out.length} 行`);
})().catch(e => { console.error(e); process.exit(1); });
