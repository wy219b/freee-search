// ===================================================================
//  freee クイック検索 - background.js
// ===================================================================

function toHalfWidth(str) {
  return str
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/　/g, " ")
    .replace(/[‐－―]/g, "-");
}
function extractAmount(text) {
  const half = toHalfWidth(text);
  const isNeg = /^[-△▲]/.test(half.trim());
  const n = half.replace(/[¥,円\s\-△▲]/g, "");
  if (isNaN(n) || n === "") return null;
  return isNeg ? `-${n}` : n;
}
function extractDate(text) {
  const h = toHalfWidth(text.trim());
  const c = h.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (c && +c[2]>=1 && +c[2]<=12 && +c[3]>=1 && +c[3]<=31) return `${c[1]}-${c[2]}-${c[3]}`;
  const r = h.match(/^R(\d+)[.\/\-年](\d{1,2})[.\/\-月](\d{1,2})/i);
  if (r) return `${2018+ +r[1]}-${r[2].padStart(2,"0")}-${r[3].padStart(2,"0")}`;
  for (const p of [/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/, /^(\d{4})年(\d{1,2})月(\d{1,2})日?$/]) {
    const m = h.match(p);
    if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  }
  return null;
}
function enc(s) { return encodeURIComponent(s); }

// -------------------------------------------------------------------
// [Fix 1] groupTitle をグループ単位で定義し、全メニューへ確実に引き継ぐ
// -------------------------------------------------------------------
const GROUP_TITLES = {
  deals:  "📒 取引の一覧",
  wallet: "🏦 口座明細",
};

const MENUS = [
  { id:"deals_partner",      title:"取引先で検索",   group:"deals",
    buildUrl: async s => `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&partner=${enc(s)}` },
  { id:"deals_description",  title:"備考で検索",     group:"deals",
    buildUrl: async s => `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&line_item_description=${enc(s)}` },
  { id:"deals_amount",       title:"金額で検索",     group:"deals",
    buildUrl: async s => { const n=extractAmount(s); if(!n)return null; const a=n.replace("-",""); return `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&amount_min=${a}&amount_max=${a}`; }},
  { id:"deals_date",         title:"日付で検索",     group:"deals",
    buildUrl: async s => { const d=extractDate(s); if(!d)return null; return `https://secure.freee.co.jp/deals#limit=500&mode=search&offset=0&start_issue_date=${d}&end_issue_date=${d}`; }},
  { id:"wallet_description", title:"取引内容で検索", group:"wallet",
    buildUrl: async s => `https://secure.freee.co.jp/wallet_txns#ignore_condition=with&description=${enc(s)}&limit=500&sort=issue_date&direction=desc&offset=0&page=1` },
  { id:"wallet_amount",      title:"金額で検索",     group:"wallet",
    buildUrl: async s => { const n=extractAmount(s); if(!n)return null; const a=n.replace("-",""); return `https://secure.freee.co.jp/wallet_txns#ignore_condition=with&start_amount=${a}&end_amount=${a}&limit=500&sort=issue_date&direction=desc&offset=0&page=1`; }},
  { id:"wallet_date",        title:"日付で検索",     group:"wallet",
    buildUrl: async s => { const d=extractDate(s); if(!d)return null; return `https://secure.freee.co.jp/wallet_txns#ignore_condition=with&start_date=${d}&end_date=${d}&limit=500&sort=issue_date&direction=desc&offset=0&page=1`; }},
];

const GROUP_PARENT_IDS = {};
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id:"freee_root", title:"freee で検索 🔍", contexts:["selection"] });
    Object.entries(GROUP_TITLES).forEach(([group, title]) => {
      GROUP_PARENT_IDS[group] = `group_${group}`;
      chrome.contextMenus.create({ id:`group_${group}`, title, parentId:"freee_root", contexts:["selection"] });
    });
    MENUS.forEach(m => {
      chrome.contextMenus.create({ id:m.id, title:m.title, parentId:GROUP_PARENT_IDS[m.group]||"freee_root", contexts:["selection"] });
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (!info.selectionText) return;
  const sel = info.selectionText.trim();
  const def = MENUS.find(m => m.id === info.menuItemId);
  if (!def?.buildUrl) return;
  let url; try { url = await def.buildUrl(sel); } catch { return; }
  if (!url) {
    // -------------------------------------------------------------------
    // [Fix 3] iconUrl が存在しない場合に備えてフォールバック付きで通知
    // -------------------------------------------------------------------
    const notifOpts = {
      type: "basic",
      title: "freee：変換できませんでした",
      message: `「${sel}」を${def.title.replace("で検索","")}として認識できませんでした`,
    };
    try {
      // アイコンが同梱されている場合はそちらを優先
      await fetch(chrome.runtime.getURL("icons/icon48.png"), { method:"HEAD" });
      notifOpts.iconUrl = "icons/icon48.png";
    } catch {
      // アイコンファイルが無くても通知は出す（iconUrl 省略）
    }
    chrome.notifications.create(notifOpts);
    return;
  }
  // [Fix 1] groupTitle を GROUP_TITLES から確実に解決して保存
  const groupTitle = GROUP_TITLES[def.group] ?? "";
  await saveHistory({ text:sel, menuTitle:def.title, groupTitle, url, timestamp:Date.now() });
  chrome.tabs.create({ url });
});

// -------------------------------------------------------------------
// [Fix 2] text+menuTitle に加え URL でも重複除去
// -------------------------------------------------------------------
async function saveHistory(entry) {
  const { searchHistory=[] } = await chrome.storage.local.get("searchHistory");
  const f = searchHistory.filter(h =>
    !(h.text === entry.text && h.menuTitle === entry.menuTitle) &&
    !(h.url === entry.url)
  );
  f.unshift(entry);
  await chrome.storage.local.set({ searchHistory: f.slice(0, 30) });
}
