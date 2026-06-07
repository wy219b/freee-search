// -------------------------------------------------------------------
// [Fix 1] GROUP_ICONS は group キーで引き当てる形に統一
//         （groupTitle の絵文字だけ抜き出す方式をやめ、直接マップで管理）
// -------------------------------------------------------------------
const GROUP_ICONS  = { deals: "📒", wallet: "🏦" };
const GROUP_LABELS = { deals: "取引の一覧", wallet: "口座明細" };

// groupTitle 文字列（例："📒 取引の一覧"）から group キーを逆引き
const TITLE_TO_GROUP = { "📒 取引の一覧": "deals", "🏦 口座明細": "wallet" };

function resolveIcon(groupTitle) {
  const key = TITLE_TO_GROUP[groupTitle];
  return key ? GROUP_ICONS[key] : "🔍";
}
function resolveBadge(groupTitle, menuTitle) {
  const key = TITLE_TO_GROUP[groupTitle];
  const label = key ? GROUP_LABELS[key] : "";
  return label ? `${label} › ${menuTitle}` : menuTitle;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2000);
}
function timeAgo(ts) {
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(d/3600000), day=Math.floor(d/86400000);
  if(m<1)return"たった今"; if(m<60)return`${m}分前`; if(h<24)return`${h}時間前`; if(day<7)return`${day}日前`;
  return new Date(ts).toLocaleDateString("ja-JP");
}

function renderHistory(history, filter = "") {
  const list = document.getElementById("historyList");
  const filtered = filter
    ? history.filter(h =>
        h.text.includes(filter) ||
        h.menuTitle.includes(filter) ||
        (h.groupTitle||"").includes(filter))
    : history;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="list-empty">
      <div class="icon">${filter ? "🔎" : "🕓"}</div>
      <div>${filter ? "該当なし" : "まだ検索履歴がありません"}</div>
      ${!filter ? '<div style="font-size:11px;margin-top:4px;color:#bbb">テキストを選択して右クリックで使えます</div>' : ""}
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(h => {
    const icon  = resolveIcon(h.groupTitle);
    const badge = resolveBadge(h.groupTitle, h.menuTitle);
    const eu = encodeURIComponent(h.url || "");
    return `<div class="item" data-url="${eu}">
      <div class="item-icon">${icon}</div>
      <div class="item-body">
        <div class="item-label">${h.text}</div>
        <div class="item-meta">
          <span class="item-badge">${badge}</span>
          <span>${timeAgo(h.timestamp)}</span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" data-action="open">↗</button>
        <button class="btn-icon" data-action="copy" data-url="${eu}">📋</button>
      </div>
    </div>`;
  }).join("");

  list.querySelectorAll(".item").forEach(item => {
    const getUrl = () => decodeURIComponent(item.dataset.url);
    item.addEventListener("click", e => {
      if (e.target.closest(".btn-icon")) return;
      chrome.tabs.create({ url: getUrl() }); window.close();
    });
    item.querySelector('[data-action="open"]')?.addEventListener("click", e => {
      e.stopPropagation();
      chrome.tabs.create({ url: getUrl() }); window.close();
    });
    item.querySelector('[data-action="copy"]')?.addEventListener("click", e => {
      e.stopPropagation();
      navigator.clipboard.writeText(decodeURIComponent(e.currentTarget.dataset.url))
        .then(() => showToast("コピーしました"));
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const { searchHistory=[] } = await chrome.storage.local.get("searchHistory");
  renderHistory(searchHistory);

  const filterInput = document.getElementById("filterInput");
  filterInput.addEventListener("input", e => renderHistory(searchHistory, e.target.value.trim()));

  // -------------------------------------------------------------------
  // [Fix 4] ポップアップを開いた瞬間に検索ボックスへ自動フォーカス
  // -------------------------------------------------------------------
  filterInput.focus();

  document.getElementById("clearBtn").addEventListener("click", async () => {
    if (!confirm("検索履歴をすべて消去しますか？")) return;
    await chrome.storage.local.set({ searchHistory: [] });
    renderHistory([]); showToast("消去しました");
  });
});
