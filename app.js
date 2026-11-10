/**
 * app.js - 前端核心邏輯 (純淨無重複、極速載入版)
 */

const GOOGLE_CLIENT_ID = "709009270844-mdhc9tuanitn13fsbtrebrdirvhvn1uq.apps.googleusercontent.com";
const API_URL = "https://script.google.com/macros/s/AKfycbymW1267l6UWmdVElFgupFmOMo735hctNkAztjttTJfzUF4rpJ-qvmT3spGRBX5n27p/exec";

let idToken = localStorage.getItem("cup_noodle_id_token") || "";
let userEmail = localStorage.getItem("cup_noodle_user_email") || "";
let userRole = localStorage.getItem("cup_noodle_user_role") || "我只是來吃吃的";
let userAvatarUrl = localStorage.getItem("cup_noodle_user_avatar") || "";
let userNickname = localStorage.getItem("cup_noodle_user_nickname") || "";
let pendingOrderDeduct = null;
let newProductBase64Image = "";

let currentActiveSheetName = "";
let currentActiveWeek = 1;

let products = [];
let tab2DataList = [];
let tab3DataList = [];
let cart = {};
let currentBarcode = null;
let html5QrCode = null;
let activeTab = "tab1";
let localStream = null;
let isLiveScanning = false;

let currentPage = 1;
let pageSize = 12;

let deviceId = localStorage.getItem("cup_noodle_device_id");
if (!deviceId) {
  deviceId = "DEV-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Date.now().toString(36).slice(-4).toUpperCase();
  localStorage.setItem("cup_noodle_device_id", deviceId);
}

let pendingEdit = null;
const hasNativeBarcodeDetector = ('BarcodeDetector' in window);
let nativeDetector = null;
if (hasNativeBarcodeDetector) {
  try {
    nativeDetector = new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code']
    });
  } catch (e) {
    nativeDetector = null;
  }
}

function cleanBarcode(code) {
  if (!code) return "";
  let s = code.toString().trim();
  if (s.endsWith(".0")) s = s.substring(0, s.length - 2);
  return s.replace(/^0+/, "");
}

function appAlert(message, title = "系統提示") {
  return new Promise(resolve => {
    const modal = document.getElementById("appDialogModal");
    document.getElementById("appDialogTitle").innerText = title;
    document.getElementById("appDialogMsg").innerHTML = (message || "").replace(/\n/g, "<br>");
    const actionsEl = document.getElementById("appDialogActions");
    actionsEl.innerHTML = `<button class="btn-confirm" id="appDialogOkBtn" style="width:100%;">確定</button>`;
    modal.style.display = "flex";
    document.getElementById("appDialogOkBtn").onclick = () => {
      modal.style.display = "none";
      resolve();
    };
  });
}

function appConfirm(message, title = "操作確認") {
  return new Promise(resolve => {
    const modal = document.getElementById("appDialogModal");
    document.getElementById("appDialogTitle").innerText = title;
    document.getElementById("appDialogMsg").innerHTML = (message || "").replace(/\n/g, "<br>");
    const actionsEl = document.getElementById("appDialogActions");
    actionsEl.innerHTML = `
      <button class="btn-cancel" id="appDialogCancelBtn">取消</button>
      <button class="btn-confirm" id="appDialogConfirmBtn">確認</button>
    `;
    modal.style.display = "flex";
    document.getElementById("appDialogCancelBtn").onclick = () => {
      modal.style.display = "none";
      resolve(false);
    };
    document.getElementById("appDialogConfirmBtn").onclick = () => {
      modal.style.display = "none";
      resolve(true);
    };
  });
}

async function apiRequest(path = "", options = {}) {
  const url = new URL(API_URL + path);
  let fetchOptions = { ...options };

  if (!options.method || options.method.toUpperCase() === "GET") {
    if (idToken) url.searchParams.set("id_token", idToken);
  } else {
    let payload = {};
    if (typeof options.body === "string") {
      try { payload = JSON.parse(options.body); } catch (e) { payload = { data: options.body }; }
    } else if (typeof options.body === "object") {
      payload = { ...options.body };
    }
    if (idToken) payload.id_token = idToken;

    fetchOptions = {
      ...options,
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  fetchOptions.signal = controller.signal;

  try {
    const response = await fetch(url.toString(), fetchOptions);
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`API 請求失敗（HTTP ${response.status}）`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("伺服器連線超時（超過 25 秒無回應），請檢查網路或稍後重試。");
    }
    throw err;
  }
}
window.apiRequest = apiRequest;

// 頂部狀態列渲染：頭像/姓名 與 角色標籤 獨立點擊
// 頂部狀態列渲染：頭像/姓名 與 角色標籤 獨立點擊
function renderUserStatus() {
  const textEl = document.getElementById("userStatusText");
  const gisBox = document.getElementById("gisButtonBox");
  const btnLogout = document.getElementById("btnLogout");

  if (userEmail && userEmail.indexOf("@") > -1) {
    if (!userRole || userRole === "我只是來吃吃的") {
      userRole = "我只是來大吃的";
      localStorage.setItem("cup_noodle_user_role", userRole);
    }
    const displayName = userNickname || userEmail.split("@")[0];
    let roleBadgeText = (userRole === "我只是來大吃的") ? "大吃" : userRole;

    // 向量剪影圖標 (防範顯示文字 User)
    const avatarImg = userAvatarUrl 
      ? `<img src="${userAvatarUrl}" style="width:24px; height:24px; border-radius:50%; object-fit:cover;">`
      : `<span style="display:inline-flex; width:24px; height:24px; border-radius:50%; background:#1565c0; color:#fff; align-items:center; justify-content:center; font-size:12px;">👤</span>`;

    textEl.innerHTML = `
      <span onclick="openUserProfileModal()" style="cursor: pointer; display: inline-flex; align-items: center; gap: 6px;" title="點擊檢視個人名片">
        ${avatarImg}
        <b>${displayName}</b>
      </span>
      <span style="color:#aaa;">|</span>
      <span class="user-role-badge" onclick="onRoleBadgeClicked(event)" title="點擊檢視系統權限說明書" style="cursor:pointer;">
        ${roleBadgeText}
      </span>
    `;
    gisBox.style.display = "none";
    btnLogout.style.display = "inline-block";
  } else {
    textEl.innerHTML = `未登入訪客 | <span class="user-role-badge" onclick="onRoleBadgeClicked(event)" style="cursor:pointer;">吃吃</span>`;
    gisBox.style.display = "inline-block";
    btnLogout.style.display = "none";
  }
}
// 點擊 System / 角色徽章時直接開啟權限說明書 (阻止冒泡，不跳個人名片)
function onRoleBadgeClicked(e) {
  if (e) e.stopPropagation();
  openRoleGuideModal();
}

function parseJwt(token) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("無效的 Token 格式。");
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(decodeURIComponent(
    atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))
      .split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
  ));
}

async function handleCredentialResponse(response) {
  try {
    idToken = response.credential;
    localStorage.setItem("cup_noodle_id_token", idToken);
    const profile = parseJwt(idToken);
    userEmail = profile.email || "";
    userAvatarUrl = profile.picture || "https://via.placeholder.com/80?text=User";
    userNickname = profile.name || userEmail.split("@")[0];

    localStorage.setItem("cup_noodle_user_email", userEmail);
    localStorage.setItem("cup_noodle_user_avatar", userAvatarUrl);
    localStorage.setItem("cup_noodle_user_nickname", userNickname);

    userRole = "我只是來大吃的";
    localStorage.setItem("cup_noodle_user_role", userRole);

    renderUserStatus();
    await loadProducts(currentActiveSheetName || null, currentActiveWeek || null);
    setupPermissions();
  } catch (err) {
    appAlert("登入處理失敗：" + err.message, "登入錯誤");
  }
}

async function logoutUser() {
  const ok = await appConfirm("確定要登出 Google 帳號嗎？", "帳號登出");
  if (ok) {
    localStorage.removeItem("cup_noodle_id_token");
    localStorage.removeItem("cup_noodle_user_email");
    localStorage.removeItem("cup_noodle_user_role");
    localStorage.removeItem("cup_noodle_user_avatar");
    localStorage.removeItem("cup_noodle_user_nickname");
    idToken = "";
    userEmail = "";
    userAvatarUrl = "";
    userNickname = "";
    userRole = "我只是來吃吃的";
    renderUserStatus();
    setupPermissions();
    onSheetOrWeekChange();
  }
}

function initGoogleGIS() {
  if (!window.google?.accounts?.id) return;
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleCredentialResponse,
    auto_select: true
  });
  google.accounts.id.renderButton(
    document.getElementById("gisButtonBox"),
    { type: "standard", theme: "outline", size: "medium", text: "signin_with" }
  );
}

// 修正：括號正確閉合，管理員才能看見新增產品按鈕
function setupPermissions() {
  const btn1 = document.getElementById("tab1Btn");
  const btn2 = document.getElementById("tab2Btn");
  const btn3 = document.getElementById("tab3Btn");
  const sheetSel = document.getElementById("sheetSelect");
  const sheetTxt = document.getElementById("sheetText");
  const weekSel = document.getElementById("weekSelect");
  const weekTxt = document.getElementById("weekText");
  const addBtn = document.getElementById("btnOpenAddModal");

  const roleStr = (userRole || "").toLowerCase();
  const isSystem = (userRole === "System");
  const isAdmin = (userRole === "Admin" || userRole === "管理員" || roleStr === "admin");
  const isAuditor = (userRole === "核對員");

  if (btn1) btn1.style.display = "block";
  if (btn2) btn2.style.display = (isSystem || isAdmin) ? "block" : "none";
  if (btn3) btn3.style.display = (isSystem || isAdmin || isAuditor) ? "block" : "none";
  if (addBtn) addBtn.style.display = (isSystem || isAdmin) ? "inline-block" : "none";

  if (isSystem || isAdmin) {
    if (sheetSel) sheetSel.style.display = "inline-block";
    if (sheetTxt) sheetTxt.style.display = "none";
    if (weekSel) weekSel.style.display = "inline-block";
    if (weekTxt) weekTxt.style.display = "none";
  } else {
    if (sheetSel) sheetSel.style.display = "none";
    if (sheetTxt) sheetTxt.style.display = "inline-block";
    if (weekSel) weekSel.style.display = "none";
    if (weekTxt) weekTxt.style.display = "inline-block";
  }
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });
}

// 3. 切換 Tab 時自動無感同步最新庫存
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  const targetBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  const targetContent = document.getElementById(tabId);
  if (targetBtn) targetBtn.classList.add("active");
  if (targetContent) targetContent.classList.add("active");
  activeTab = tabId;

  closeDrawer();
  const isTab1 = (tabId === "tab1");
  const pageSizeContainer = document.getElementById("pageSizeContainer");
  if (pageSizeContainer) pageSizeContainer.style.display = isTab1 ? "flex" : "none";
  const footer = document.getElementById("tab1Footer");
  if (footer) footer.style.display = isTab1 ? "flex" : "none";

  // 切換分頁時，自動無感拉取最新庫存，無需手動 F5
  if (tabId === "tab1") loadProducts(currentActiveSheetName, currentActiveWeek);
  if (tabId === "tab2") loadTab2Data();
  if (tabId === "tab3") loadTab3Data();
}


function onPageSizeChange() {
  pageSize = Number(document.getElementById("pageSizeSelect").value);
  currentPage = 1;
  renderGrid();
}

function onSheetOrWeekChange() {
  const isHigh = (userRole === "System" || userRole === "Admin" || userRole === "管理員");
  const sheetName = isHigh ? document.getElementById("sheetSelect").value : null;
  const week = isHigh ? Number(document.getElementById("weekSelect").value) : null;
  currentPage = 1;
  loadProducts(sheetName, week);
  if (activeTab === "tab2") loadTab2Data();
  if (activeTab === "tab3") loadTab3Data();
}
// 1. 全域版本號追蹤
let localStockVersion = "";
let stockSyncTimer = null;
// 2. 修正 loadProducts：保證 Tab 1 與 Tab 2 永遠使用同一個月份與週次
async function loadProducts(targetSheet, targetWeek) {
  const grid = document.getElementById("gridContainer");
  if (grid && products.length === 0) {
    grid.innerHTML = "<p style='grid-column:1/-1; text-align:center; color:#666; padding:40px;'>資料載入中，請稍候...</p>";
  }

  try {
    let query = "?action=getProducts";
    if (targetSheet) query += `&sheetName=${encodeURIComponent(targetSheet)}`;
    if (targetWeek) query += `&week=${encodeURIComponent(targetWeek)}`;

    const res = await apiRequest(query);
    if (res.error) {
      await appAlert("後端資料讀取提示：" + res.error, "資料載入提示");
    }

    products = res.products || [];
    if (res.sheetName) currentActiveSheetName = res.sheetName;
    if (res.currentWeek) currentActiveWeek = res.currentWeek;

    // 強制同步更新控制列的下拉選單選取值，確保 Tab 1 與 Tab 2 完全一致
    const sel = document.getElementById("sheetSelect");
    if (sel && res.sheets) {
      sel.innerHTML = "";
      res.sheets.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.innerText = s.replace("杯麵每週訂購與統計表", "");
        if (s === res.sheetName) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.value = res.sheetName;
    }
    const sheetTxt = document.getElementById("sheetText");
    if (sheetTxt && res.sheetName) sheetTxt.innerText = res.sheetName.replace("杯麵每週訂購與統計表", "");

    if (res.currentWeek) {
      const wSel = document.getElementById("weekSelect");
      if (wSel) wSel.value = res.currentWeek;
      const wTxt = document.getElementById("weekText");
      if (wTxt) wTxt.innerText = `第 ${res.currentWeek} 週`;
    }

    renderGrid();
  } catch (err) {
    if (grid) grid.innerHTML = `<p style='grid-column:1/-1; text-align:center; color:#d32f2f; padding:40px;'>載入失敗：${err.message}</p>`;
  }
}
function onFilterChange() {
  currentPage = 1;
  renderGrid();
}

// ==========================================
// [Part JS.2] [F_JS_01] 卡片網格渲染 (庫存為 0 時禁用增加按鈕)
// ==========================================
function renderGrid() {
  let totalStock = 0;
  products.forEach(p => { totalStock += (Number(p.remain) || 0); });
  const subTitleEl = document.getElementById("tab1SubTitle");
  if (subTitleEl) subTitleEl.innerText = `現貨總數：${totalStock} 杯`;

  const grid = document.getElementById("gridContainer");
  if (!grid) return;
  grid.innerHTML = "";
  const onlyStock = document.getElementById("onlyStockCheckbox").checked;
  const filtered = products.filter(p => onlyStock ? (p.remain > 0) : true);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const startIndex = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize);

  pageItems.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    const isOutOfStock = (p.remain <= 0);

    const stockHtml = !isOutOfStock
      ? `<div class="stock-tag in-stock">現貨：${p.remain} 杯</div>`
      : '<div class="stock-tag preorder" style="color:#d32f2f; background:#ffebee;">已售罄 (現貨 0)</div>';

    // 核心修正：庫存為 0 時，+ 按鈕直接 disabled，徹底防止點選
    const disablePlus = isOutOfStock ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : '';

    card.innerHTML =
      `<div class="img-box" onclick="showProductDetail(${p.rowIndex})"><img src="${p.imgUrl || 'https://via.placeholder.com/90?text=CupNoodle'}" loading="lazy" alt="${p.name}"></div>
      <div class="title" title="點擊查看條碼與詳情" onclick="showProductDetail(${p.rowIndex})">${p.fullName}</div>
      ${stockHtml}
      <div class="stepper">
        <button onclick="updateQty(${p.rowIndex}, -1)">-</button>
        <div class="val" id="qty-${p.rowIndex}">${cart[p.rowIndex] || 0}</div>
        <button onclick="updateQty(${p.rowIndex}, 1)" ${disablePlus}>+</button>
      </div>`;
    grid.appendChild(card);
  });

  if (pageItems.length === 0) {
    grid.innerHTML = "<p style='grid-column:1/-1; text-align:center; color:#999; padding:60px;'>目前無符合條件之現貨商品</p>";
  }

  document.getElementById("pageInfo").innerText = `第 ${currentPage} / ${totalPages} 頁 (共 ${filtered.length} 款)`;
  document.getElementById("prevBtn").disabled = (currentPage <= 1);
  document.getElementById("nextBtn").disabled = (currentPage >= totalPages);
}

function changePage(delta) {
  currentPage += delta;
  renderGrid();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showProductDetail(rowIndex) {
  const p = products.find(x => x.rowIndex == rowIndex);
  if (!p) return;
  document.getElementById("detailModalImg").src = p.imgUrl || "https://via.placeholder.com/120?text=CupNoodle";
  document.getElementById("detailModalName").innerText = p.fullName;
  document.getElementById("detailModalCategory").innerText = p.category || "特色杯麵";
  document.getElementById("detailModalOrigin").innerText = p.origin || "香港";
  document.getElementById("detailModalBarcode").innerText = p.barcode || "尚未登錄條碼";
  document.getElementById("prodDetailModal").style.display = "flex";
}

async function updateQty(rowId, delta) {
  const current = cart[rowId] || 0;
  const next = current + delta;
  if (current === 1 && delta === -1) {
    const ok = await appConfirm("確定要將數量減至 0 並從預訂清單中移除嗎？", "清單調整");
    if (!ok) return;
  }
  if (next <= 0) delete cart[rowId];
  else cart[rowId] = next;
  const el = document.getElementById("qty-" + rowId);
  if (el) el.innerText = cart[rowId] || 0;
  updateFooterAndDrawer();
}

// ==========================================
// [Part JS.3] [F_JS_02] 抽屜清單渲染 (強制置右且美觀)
// ==========================================
function updateFooterAndDrawer() {
  let total = 0;
  let listHtml = "";

  for (const rId in cart) {
    const p = products.find(x => x.rowIndex == rId);
    if (p) {
      total += cart[rId];
      const maxStock = Number(p.remain) || 0;
      const disablePlus = (cart[rId] >= maxStock) ? 'disabled style="opacity:0.3; cursor:not-allowed;"' : '';

      listHtml +=
        `<div class="drawer-item">
          <div class="drawer-item-title">${p.fullName}</div>
          <div class="drawer-stepper">
            <button onclick="updateQty(${p.rowIndex}, -1)">-</button>
            <div class="val">${cart[rId]}</div>
            <button onclick="updateQty(${p.rowIndex}, 1)" ${disablePlus}>+</button>
          </div>
        </div>`;
    }
  }

  document.getElementById("footerTotal").innerText = `已選：${total} 杯`;
  document.getElementById("drawerList").innerHTML = listHtml || "<p style='color:#999; text-align:center; padding:20px 0;'>尚未選擇任何商品</p>";
}

// 5. 前端智慧無感即時同步探針 (極省資源)
// [Part JS.2] 輕量背景即時同步探針 (縮短至 5 秒檢測，喚醒視窗即刻同步)
function initRealtimeStockSync() {
  if (stockSyncTimer) clearInterval(stockSyncTimer);
  stockSyncTimer = setInterval(() => {
    if (!document.hidden) {
      checkStockVersionSilently();
    }
  }, 5000); // 5 秒極速探針 (僅傳送 15 字元純文字，0 消耗)

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      checkStockVersionSilently();
    }
  });
}
// ==========================================
// [Part JS.3] [F_JS_03] 數量增減與上限攔截
// ==========================================
async function updateQty(rowId, delta) {
  const p = products.find(x => x.rowIndex == rowId);
  const maxStock = p ? (Number(p.remain) || 0) : 0;
  const current = cart[rowId] || 0;
  const next = current + delta;

  // 1. 庫存為 0 時阻擋
  if (maxStock <= 0 && delta > 0) {
    await appAlert(`【${p.fullName}】目前現貨為 0 杯，無法選購！`, "現貨不足");
    return;
  }

  // 2. 超過可用現貨時阻擋
  if (delta > 0 && next > maxStock) {
    await appAlert(`【${p.fullName}】目前現貨僅剩 ${maxStock} 杯，無法登記更多！`, "數量上限提示");
    return;
  }

  if (current === 1 && delta === -1) {
    const ok = await appConfirm("確定要將數量減至 0 並從預訂清單中移除嗎？", "清單調整");
    if (!ok) return;
  }

  if (next <= 0) {
    delete cart[rowId];
  } else {
    cart[rowId] = next;
  }

  const el = document.getElementById("qty-" + rowId);
  if (el) el.innerText = cart[rowId] || 0;
  updateFooterAndDrawer();
}

// ==========================================
// [Part JS.3] [F_JS_02] 訂單送出前雙重校驗
// ==========================================
async function confirmOrder() {
  let total = 0;
  const items = [];

  for (const r in cart) {
    const p = products.find(x => x.rowIndex == r);
    if (p) {
      const maxStock = Number(p.remain) || 0;
      // 送出前最後防禦：確認無超賣
      if (cart[r] > maxStock) {
        await appAlert(`【${p.fullName}】選擇數量 (${cart[r]} 杯) 已超過可用現貨 (${maxStock} 杯)！\n請重新調整數量後再提交。`, "庫存不足");
        return;
      }

      total += cart[r];
      items.push({ 
        rowIndex: r, 
        name: p.fullName, 
        qty: cart[r], 
        price: p.price || 0,
        imgUrl: p.imgUrl || "" 
      });
    }
  }

  if (total === 0) {
    await appAlert("請至少選擇 1 杯麵！", "提示");
    return;
  }

  const isGuest = (!userEmail || userEmail === "" || userEmail.indexOf("@") === -1);
  const isLimited = isGuest || (userRole === "我只是來吃吃的");

  if (isLimited && total > 3) {
    await appAlert("⚠️ 預訂限制提示：\n未登入訪客或「我只是來吃吃的」單次預訂不可超過 3 杯！\n若需無限制訂購，請登入升級為「大吃」。", "預訂限制");
    return;
  }

  const ok = await appConfirm(`確認提交預訂共 ${total} 杯？`, "確認預訂");
  if (ok) {
    const sheetName = currentActiveSheetName || null;
    const week = currentActiveWeek || null;
    const submitBtn = document.querySelector("#cartDrawer .btn-submit");
    if (submitBtn) submitBtn.innerText = "⏳ 提交中...";

    try {
      const res = await apiRequest("", {
        method: "POST",
        body: { action: "submitOrder", items, sheetName, week, deviceId }
      });
      if (submitBtn) submitBtn.innerText = "確認提交報名";

      if (res.success) {
        // [Part JS.1] 保存訂單至本機歷史記錄 (訪客與會員皆保存)
        const orderHistory = JSON.parse(localStorage.getItem("cup_noodle_order_history") || "[]");
        orderHistory.unshift({
          id: res.orderId,
          time: new Date().toLocaleString(),
          user: userEmail || `未登入訪客 [${deviceId}]`,
          deviceId: deviceId,
          items: items,
          totalCups: total,
          week: week || currentActiveWeek,
          sheetName: sheetName || currentActiveSheetName
        });
        localStorage.setItem("cup_noodle_order_history", JSON.stringify(orderHistory));

        
        localStockVersion = "";
        cart = {};
        updateFooterAndDrawer();
        closeDrawer();

        await appAlert("預訂成功！" + (isGuest ? "（已記錄訪客設備登記）" : "確認信件已發送至您的 Gmail。"), "預訂結果");

        await loadProducts(sheetName, week);
        if (activeTab === "tab2") loadTab2Data();
        if (activeTab === "tab3") loadTab3Data();
      } else {
        // 後端庫存校驗失敗攔截 (例如剛好被其他人搶先買走)
        await appAlert(res.msg, "訂購失敗");
        await loadProducts(sheetName, week);
      }
    } catch (err) {
      if (submitBtn) submitBtn.innerText = "確認提交報名";
      await appAlert("提交失敗：" + err.message, "錯誤");
    }
  }
}

async function checkStockVersionSilently() {
  try {
    const res = await apiRequest("?action=checkVersion");
    if (res && res.version) {
      if (!localStockVersion) {
        localStockVersion = res.version;
      } else if (localStockVersion !== res.version) {
        // 發現有人下單或核銷，無感刷新
        localStockVersion = res.version;
        loadProducts(currentActiveSheetName, currentActiveWeek);
        if (activeTab === "tab2") loadTab2Data();
        if (activeTab === "tab3") loadTab3Data();
      }
    }
  } catch(e) {}
}
async function checkStockVersionSilently() {
  try {
    const res = await apiRequest("?action=checkVersion");
    if (res && res.version) {
      if (!localStockVersion) {
        localStockVersion = res.version;
      } else if (localStockVersion !== res.version) {
        // 發現伺服器庫存版本更新（代表其他人剛下了單或核銷了庫存）
        localStockVersion = res.version;
        // 背景無感刷新商品列表，使用者畫面上數量自動即時跳動
        loadProducts(currentActiveSheetName, currentActiveWeek);
        if (activeTab === "tab2") loadTab2Data();
        if (activeTab === "tab3") loadTab3Data();
      }
    }
  } catch(e) {}
}

// 在 DOMContentLoaded 最後啟動同步探針：
window.addEventListener("DOMContentLoaded", () => {
  renderUserStatus();
  setupTabs();
  setupPermissions();
  setupBarcodeInput();
  safeInitGIS();
  loadProducts(null, null);
  initRealtimeStockSync(); // 啟動無感即時同步
});

function closeDrawer() {
  const drawer = document.getElementById("cartDrawer");
  if (drawer) drawer.style.display = "none";
}

// [Part JS.1] confirmOrder：下單成功當下立即重設版本號並即刻重新載入
async function confirmOrder() {
  let total = 0;
  const items = [];
  for (const r in cart) {
    const p = products.find(x => x.rowIndex == r);
    if (p) {
      total += cart[r];
      items.push({ 
        rowIndex: r, 
        name: p.fullName, 
        qty: cart[r], 
        price: p.price || 0,
        imgUrl: p.imgUrl || "" 
      });
    }
  }
  if (total === 0) {
    await appAlert("請至少選擇 1 杯麵！", "提示");
    return;
  }

  const isGuest = (!userEmail || userEmail === "" || userEmail.indexOf("@") === -1);
  const isLimited = isGuest || (userRole === "我只是來吃吃的");

  if (isLimited && total > 3) {
    await appAlert("⚠️ 預訂限制提示：\n未登入訪客或「我只是來吃吃的」單次預訂不可超過 3 杯！\n若需無限制訂購，請登入升級為「大吃」。", "預訂限制");
    return;
  }

  const ok = await appConfirm(`確認提交預訂共 ${total} 杯？`, "確認預訂");
  if (ok) {
    const sheetName = currentActiveSheetName || null;
    const week = currentActiveWeek || null;
    const submitBtn = document.querySelector("#cartDrawer .btn-submit");
    if (submitBtn) submitBtn.innerText = "⏳ 提交中...";

    try {
      await apiRequest("", {
        method: "POST",
        body: { action: "submitOrder", items, sheetName, week, deviceId }
      });
      if (submitBtn) submitBtn.innerText = "確認提交報名";
      
      // 關鍵：下單成功當下立即將前端本地快取版本清空，強迫下一次載入取得伺服器最新數據
      localStockVersion = "";
      cart = {};
      updateFooterAndDrawer();
      closeDrawer();

      await appAlert("預訂成功！" + (isGuest ? "（已記錄訪客設備登記）" : "確認信件已發送至您的 Gmail。"), "預訂結果");

      // 0 秒即時渲染全新剩餘數目 (不再延遲一分鐘)
      await loadProducts(sheetName, week);
      if (activeTab === "tab2") loadTab2Data();
      if (activeTab === "tab3") loadTab3Data();
    } catch (err) {
      if (submitBtn) submitBtn.innerText = "確認提交報名";
      await appAlert("提交失敗：" + err.message, "錯誤");
    }
  }
}

async function loadTab2Data() {
  const isHigh = (userRole === "System" || userRole === "Admin" || userRole === "管理員");
  const isSystem = (userRole === "System");
  const sheetName = isHigh ? document.getElementById("sheetSelect").value : currentActiveSheetName;
  const week = isHigh ? Number(document.getElementById("weekSelect").value) : currentActiveWeek;
  const vType = document.getElementById("viewTypeDropdown").value;

  document.getElementById("thRegHeader").innerText = (vType === "week") ? "本週報名" : "全月累計報名";

  try {
    let query = `?action=getTab2&viewType=${encodeURIComponent(vType)}`;
    if (week) query += `&week=${encodeURIComponent(week)}`;
    if (sheetName) query += `&sheetName=${encodeURIComponent(sheetName)}`;

    const res = await apiRequest(query);
    if (res.error) {
      await appAlert("後端資料讀取提示：" + res.error, "讀取提示");
      return;
    }

    tab2DataList = res.rows || [];
    const tbody = document.getElementById("tab2Body");
    const tfoot = document.getElementById("tab2Foot");
    let html = "";

    tab2DataList.forEach(r => {
      const regEditBtn = (isSystem && vType === "week")
        ? `<span class="stock-badge-edit" style="margin-left:4px; padding:2px 6px;" onclick="openEditByRowIndex(${r.rowIndex}, 'reg', ${res.week})">✏️</span>` : "";
      const remEditBtn = (isSystem && vType === "week")
        ? `<span class="stock-badge-edit" style="margin-left:4px; padding:2px 6px;" onclick="openEditByRowIndex(${r.rowIndex}, 'remain', ${res.week})">✏️</span>` : "";

      html += `<tr>
        <td class="clickable-prod" onclick="showProductDetail(${r.rowIndex})">${r.name}</td>
        <td>${r.prevRemain}</td>
        <td>${r.regQty} ${regEditBtn}</td>
        <td>${r.curRemain} ${remEditBtn}</td>
      </tr>`;
    });

    if (tab2DataList.length > 0) {
      tbody.innerHTML = html;
      const totals = res.totals || { prevRemain: 0, regQty: 0, curRemain: 0 };
      tfoot.innerHTML = `
        <tr style="font-weight:bold; background:#fafafa;">
          <td>總計</td>
          <td>${totals.prevRemain}</td>
          <td>${totals.regQty}</td>
          <td>${totals.curRemain}</td>
        </tr>`;
    } else {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:28px; color:#888; font-weight:500;">查無任何庫存與報名數據（歷史記錄皆為 0）</td></tr>';
      tfoot.innerHTML = `
        <tr style="font-weight:bold; background:#fafafa; color:#999;">
          <td>總計</td><td>-</td><td>-</td><td>-</td>
        </tr>`;
    }
  } catch (err) {
    appAlert("載入報名數目失敗: " + err.message, "讀取錯誤");
  }
}

async function loadTab3Data() {
  const roleStr = (userRole || "").toLowerCase();
  const canEdit = (userRole === "System" || userRole === "Admin" || userRole === "核對員" || roleStr === "admin");
  const week = currentActiveWeek || 1;
  const sheetName = currentActiveSheetName || null;

  try {
    let query = `?action=getTab3&week=${encodeURIComponent(week)}`;
    if (sheetName) query += `&sheetName=${encodeURIComponent(sheetName)}`;

    const res = await apiRequest(query);
    tab3DataList = res.items || [];
    const tbody = document.getElementById("tab3Body");
    let html = "";
    let sumPrev = 0;
    let sumCur = 0;

    tab3DataList.forEach(p => {
      const remainCellContent = canEdit 
        ? `<div class="stock-badge-edit" onclick="openTab3EditModal(${p.rowIndex})">
             <span>${p.curRemain}</span>
             <span style="font-size:11px; opacity:0.8;">✏️</span>
           </div>`
        : `<div class="stock-badge-static">${p.curRemain}</div>`;

      html += `<tr>
        <td class="clickable-prod" onclick="showProductDetail(${p.rowIndex})">${p.name}</td>
        <td>${p.prevRemain}</td>
        <td>${remainCellContent}</td>
      </tr>`;
      sumPrev += (Number(p.prevRemain) || 0);
      sumCur += (Number(p.curRemain) || 0);
    });

    tbody.innerHTML = html || '<tr><td colspan="3" style="padding:20px; color:#888;">暫無商品庫存資料</td></tr>';
    document.getElementById("tab3Foot").innerHTML =
      `<tr style="font-weight:bold; background:#fafafa;">
        <td>總計</td>
        <td>${sumPrev}</td>
        <td>${sumCur}</td>
      </tr>`;
  } catch (e) {
    console.warn("載入 Tab3 失敗: ", e);
  }
}

function openTab3EditModal(rowIndex) {
  const pTab3 = tab3DataList.find(x => x.rowIndex == rowIndex);
  const pProd = products.find(x => x.rowIndex == rowIndex);
  const prodName = pTab3 ? pTab3.name : (pProd ? pProd.fullName : `品項 (第 ${rowIndex} 列)`);
  const currentVal = pTab3 ? pTab3.curRemain : 0;
  const prevVal = pTab3 ? pTab3.prevRemain : 0;
  const imgUrl = (pTab3 && pTab3.imgUrl) ? pTab3.imgUrl : (pProd ? pProd.imgUrl : "");

  pendingEdit = {
    rowIndex,
    prodName,
    fieldType: "remain",
    oldValue: currentVal,
    weekNum: currentActiveWeek,
    sheetName: currentActiveSheetName
  };

  document.getElementById("editModalImg").src = imgUrl || "https://via.placeholder.com/90?text=CupNoodle";
  document.getElementById("editModalProdTitle").innerText = prodName;
  document.getElementById("editModalDesc").innerHTML = `上次剩餘：<b>${prevVal}</b> | 目前最新剩餘：<b>${currentVal}</b>`;
  document.getElementById("editNewValInput").value = currentVal;
  document.getElementById("editModal").style.display = "flex";
}

function adjustEditVal(delta) {
  const input = document.getElementById("editNewValInput");
  let val = (parseInt(input.value, 10) || 0) + delta;
  if (val < 0) val = 0;
  input.value = val;
}

function closeModal(id) {
  document.getElementById(id).style.display = "none";
}

async function executeSystemEdit() {
  if (!pendingEdit) return;
  const newVal = document.getElementById("editNewValInput").value;
  if (newVal === "" || isNaN(newVal) || Number(newVal) < 0) {
    await appAlert("請輸入正確的正整數數值！", "輸入錯誤");
    return;
  }

  const ok = await appConfirm(`確定將 [${pendingEdit.prodName}] 第 ${pendingEdit.weekNum} 週 最新剩餘數目 由 ${pendingEdit.oldValue} 修改為 ${newVal} 嗎？`, "確認修改");
  if (!ok) return;

  try {
    const res = await apiRequest("", {
      method: "POST",
      body: {
        action: "systemEdit",
        sheetName: pendingEdit.sheetName,
        rowIndex: pendingEdit.rowIndex,
        week: pendingEdit.weekNum,
        fieldType: pendingEdit.fieldType,
        oldValue: pendingEdit.oldValue,
        newValue: newVal,
        name: pendingEdit.prodName
      }
    });
    closeModal("editModal");
    if (res.success) {
      const t3Item = tab3DataList.find(x => x.rowIndex == pendingEdit.rowIndex);
      if (t3Item) t3Item.curRemain = Number(newVal);
      const prodItem = products.find(x => x.rowIndex == pendingEdit.rowIndex);
      if (prodItem) prodItem.remain = Number(newVal);

      loadTab3Data();
      renderGrid();

      await appAlert(`修改成功！\n[${pendingEdit.prodName}] 本週最新剩餘已更新為 ${newVal}。`, "修改結果");
      if (activeTab === "tab2") loadTab2Data();
    } else {
      await appAlert(res.msg, "操作被拒");
    }
  } catch (err) {
    await appAlert("修改失敗: " + err.message, "伺服器錯誤");
  }
}

function setupBarcodeInput() {
  const inputEl = document.getElementById("manualBarcodeInput");
  if (inputEl) {
    inputEl.addEventListener("keypress", e => { if (e.key === "Enter") handleManualBarcodeClick(); });
  }
}

function handleManualBarcodeClick() {
  const inputEl = document.getElementById("manualBarcodeInput");
  const code = inputEl ? inputEl.value.trim() : "";
  if (!code) { 
    appAlert("請輸入或刷入條碼！", "提示"); 
    return; 
  }
  inputEl.value = "";
  onBarcodeScanned(code);
}

function startScanner() {
  const wrapper = document.getElementById("scannerWrapper");
  const videoEl = document.getElementById("readerVideo");

  const constraints = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia(constraints).then(stream => {
      localStream = stream;
      wrapper.style.display = "block";
      videoEl.style.display = "block";
      videoEl.srcObject = stream;
      isLiveScanning = true;

      try {
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.zoom) {
          const targetZoom = Math.min(2.0, capabilities.zoom.max);
          track.applyConstraints({ advanced: [{ zoom: targetZoom }] }).catch(() => {});
        }
      } catch(e) {}

      if (nativeDetector) {
        detectBarcodeStream(videoEl);
      } else if (typeof Html5Qrcode !== "undefined") {
        videoEl.style.display = "none";
        if (!html5QrCode) html5QrCode = new Html5Qrcode("reader");
        html5QrCode.start(
          { facingMode: "environment" }, 
          { fps: 20, qrbox: { width: 280, height: 180 } }, 
          onScanSuccess, 
          () => {}
        );
      }
    }).catch(() => {
      appAlert("無法啟動相機，請直接在上方輸入框輸入條碼進行盤點。", "相機提示");
    });
  }
}

function detectBarcodeStream(videoEl) {
  if (!isLiveScanning) return;
  if (videoEl.readyState >= videoEl.HAVE_ENOUGH_DATA) {
    nativeDetector.detect(videoEl).then(barcodes => {
      if (barcodes && barcodes.length > 0 && isLiveScanning) {
        stopScanner();
        (barcodes[0].rawValue);
        return;
      }
      if (isLiveScanning) requestAnimationFrame(() => detectBarcodeStream(videoEl));
    }).catch(() => {
      if (isLiveScanning) requestAnimationFrame(() => detectBarcodeStream(videoEl));
    });
  } else {
    if (isLiveScanning) requestAnimationFrame(() => detectBarcodeStream(videoEl));
  }
}

function onScanSuccess(decodedText) {
  stopScanner();
  onBarcodeScanned(decodedText);
}

function stopScanner() {
  isLiveScanning = false;
  const wrapper = document.getElementById("scannerWrapper");
  const videoEl = document.getElementById("readerVideo");
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (videoEl) {
    videoEl.pause();
    videoEl.srcObject = null;
    videoEl.style.display = "none";
  }
  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().finally(() => { if (wrapper) wrapper.style.display = "none"; });
  } else {
    if (wrapper) wrapper.style.display = "none";
  }
}

// ==========================================
// [Part JS.5] [F_JS_05] 掃碼核銷與自訂備註傳送
// ==========================================
function onBarcodeScanned(code) {
  // 1. 若掃描到取餐專用 QR Code (CNORDER:)
  if (code.indexOf("CNORDER:") === 0) {
    try {
      const jsonStr = code.substring(8);
      const order = JSON.parse(jsonStr);
      pendingOrderDeduct = order;

      // 明確展示是誰下單 (包含裝置數位憑證 DEV-XXXX-XXXX)
      const placerIdentity = order.user || order.deviceId || "未知訪客";
      document.getElementById("deductModalUser").innerText = placerIdentity;
      document.getElementById("deductModalTime").innerText = order.time || "-";
      document.getElementById("deductModalOrderId").innerText = order.id || "-";
      document.getElementById("deductRemarkInput").value = ""; // 重置備註框

      const tbody = document.getElementById("deductModalList");
      let html = "";
      order.items.forEach(it => {
        html += `<tr><td style="text-align:left;">${it.name}</td><td><b>x${it.qty}</b></td></tr>`;
      });
      tbody.innerHTML = html;
      document.getElementById("orderDeductModal").style.display = "flex";
      return;
    } catch (e) {
      appAlert("QR Code 格式不正確或已損壞！", "解析錯誤");
      return;
    }
  }

  // 2. 常規杯麵條碼...
  currentBarcode = code;
  const cleanTarget = cleanBarcode(code);
  const p = products.find(x => cleanBarcode(x.barcode) === cleanTarget && cleanTarget !== "");

  const imgEl = document.getElementById("scanModalImg");
  const nameEl = document.getElementById("scanModalName");
  const codeEl = document.getElementById("scanModalBarcode");
  const qtyInput = document.getElementById("scanModalQtyInput");

  codeEl.innerText = `條碼號碼：${code}`;
  if (p) {
    imgEl.src = p.imgUrl || "https://via.placeholder.com/100?text=CupNoodle";
    nameEl.innerText = p.fullName;
    qtyInput.value = p.remain || 0;
  } else {
    imgEl.src = "https://via.placeholder.com/100?text=Barcode";
    nameEl.innerText = `條碼商品 (${code})`;
    qtyInput.value = 0;
  }
  document.getElementById("scanModal").style.display = "flex";
}
async function executeOrderDeduct() {
  if (!pendingOrderDeduct) return;
  const btn = document.getElementById("btnConfirmDeduct");
  btn.innerText = "⏳ 核銷扣減中...";
  const remark = document.getElementById("deductRemarkInput").value.trim();

  try {
    const res = await apiRequest("", {
      method: "POST",
      body: {
        action: "deductOrder",
        orderPayload: pendingOrderDeduct,
        remark: remark, // 攜帶核對員填寫的備註
        sheetName: currentActiveSheetName,
        week: currentActiveWeek
      }
    });

    btn.innerText = "確認一鍵扣減核銷";
    closeModal("orderDeductModal");

    if (res.success) {
      const who = pendingOrderDeduct.user || pendingOrderDeduct.deviceId || "顧客";
      await appAlert(`✅ 核銷扣減成功！\n\n對象：${who}\n訂單號：${res.orderId}\n扣減明細：\n${res.details.join("\n")}${remark ? `\n已登記備註：${remark}` : ''}`, "核銷完成");
      loadProducts(currentActiveSheetName, currentActiveWeek);
      if (activeTab === "tab2") loadTab2Data();
      if (activeTab === "tab3") loadTab3Data();
    } else {
      await appAlert(res.msg, "核銷失敗");
    }
  } catch (e) {
    btn.innerText = "確認一鍵扣減核銷";
    await appAlert("核銷失敗: " + e.message, "伺服器錯誤");
  }
}

function adjustScanQty(delta) {
  const input = document.getElementById("scanModalQtyInput");
  let val = (parseInt(input.value, 10) || 0) + delta;
  if (val < 0) val = 0;
  input.value = val;
}

async function confirmScanStock() {
  const sheetName = currentActiveSheetName || null;
  const week = currentActiveWeek || null;
  const targetTotal = parseInt(document.getElementById("scanModalQtyInput").value, 10) || 0;

  const btn = document.getElementById("btnConfirmScan");
  btn.innerText = "⏳ 處理中...";

  try {
    const res = await apiRequest("", {
      method: "POST",
      body: { 
        action: "setBarcodeStock", 
        barcode: currentBarcode, 
        newTotal: targetTotal, 
        sheetName, 
        week 
      }
    });
    btn.innerText = "確認設定";
    closeModal("scanModal");

    if (res.success) {
      const cleanTarget = cleanBarcode(currentBarcode);
      const prodItem = products.find(x => cleanBarcode(x.barcode) === cleanTarget);
      if (prodItem) {
        prodItem.remain = res.newStock;
        const t3Item = tab3DataList.find(x => x.rowIndex == prodItem.rowIndex);
        if (t3Item) t3Item.curRemain = res.newStock;
      }

      loadTab3Data();
      renderGrid();

      await appAlert(`盤點設定成功！\n品項：${res.name}\n最新剩餘總數：${res.newStock}`, "核算成功");
      if (activeTab === "tab2") loadTab2Data();
    } else {
      await appAlert(res.msg, "核算提示");
    }
  } catch (err) {
    btn.innerText = "確認設定";
    await appAlert("條碼核算失敗: " + err.message, "網路/伺服器錯誤");
  }
}
// 開啟名片彈窗
function openUserProfileModal() {
  const avatarImg = document.getElementById("profileModalAvatar");
  const avatarSvg = document.getElementById("profileModalAvatarSvg");
  if (userAvatarUrl) {
    avatarImg.src = userAvatarUrl;
    avatarImg.style.display = "block";
    avatarSvg.style.display = "none";
  } else {
    avatarImg.style.display = "none";
    avatarSvg.style.display = "block";
  }

  document.getElementById("profileModalName").innerText = userNickname || userEmail.split("@")[0];
  document.getElementById("profileModalEmail").innerText = userEmail;
  document.getElementById("profileModalRoleBadge").innerText = `${userRole} (點擊開啟說明書)`;
  document.getElementById("userProfileModal").style.display = "flex";
}

function openRoleGuideFromProfile() {
  closeModal("userProfileModal");
  openRoleGuideModal();
}

// 開啟權限說明書手風琴
// 開啟權限說明書手風琴
function openRoleGuideModal() {
  const roles = ['admin', 'auditor', 'eater-pro', 'eater-guest'];
  roles.forEach(r => {
    const b = document.getElementById(`body-${r}`);
    const a = document.getElementById(`arrow-${r}`);
    const t = document.getElementById(`tag-${r}`);
    const c = document.getElementById(`card-${r}`);
    if (b) b.style.display = 'none';
    if (a) a.innerText = '▼';
    if (t) t.style.display = 'none';
    if (c) c.classList.remove('current-role');
  });

  // 判定目前身分並優先自動展開
  let currentKey = 'eater-guest';
  if (userEmail && userEmail.indexOf("@") > -1) {
    if (userRole === 'System' || userRole === 'Admin' || userRole === '管理員') currentKey = 'admin';
    else if (userRole === '核對員') currentKey = 'auditor';
    else currentKey = 'eater-pro';
  }

  const activeBody = document.getElementById(`body-${currentKey}`);
  const activeArrow = document.getElementById(`arrow-${currentKey}`);
  const activeTag = document.getElementById(`tag-${currentKey}`);
  const activeCard = document.getElementById(`card-${currentKey}`);

  if (activeBody) activeBody.style.display = 'block';
  if (activeArrow) activeArrow.innerText = '▲';
  if (activeTag) activeTag.style.display = 'inline-block';
  if (activeCard) activeCard.classList.add('current-role');

  const modal = document.getElementById("roleGuideModal");
  if (modal) modal.style.display = "flex";
}
function toggleRoleCard(roleKey) {
  const body = document.getElementById(`body-${roleKey}`);
  const arrow = document.getElementById(`arrow-${roleKey}`);
  if (!body) return;
  const isExpanded = (body.style.display === 'block');
  body.style.display = isExpanded ? 'none' : 'block';
  if (arrow) arrow.innerText = isExpanded ? '▼' : '▲';
}
function openAddProductModal() {
  const cats = new Set();
  const brands = new Set();
  const origins = new Set();

  products.forEach(p => {
    if (p.category) cats.add(p.category.trim());
    if (p.brand) brands.add(p.brand.trim());
    if (p.origin) origins.add(p.origin.trim());
  });

  populateSelectOptions("newProdCategorySel", Array.from(cats), "請選擇分類...");
  populateSelectOptions("newProdBrandSel", Array.from(brands), "請選擇品牌...");
  populateSelectOptions("newProdOriginSel", Array.from(origins), "請選擇產地...");

  document.getElementById("newProdCategoryCustom").style.display = "none";
  document.getElementById("newProdCategoryCustom").value = "";
  document.getElementById("newProdBrandCustom").style.display = "none";
  document.getElementById("newProdBrandCustom").value = "";
  document.getElementById("newProdOriginCustom").style.display = "none";
  document.getElementById("newProdOriginCustom").value = "";
  document.getElementById("newProdNameInput").value = "";
  document.getElementById("newProdPriceInput").value = "10";
  document.getElementById("newProdBarcodeInput").value = "";
  document.getElementById("newProdRemarkInput").value = "";
  document.getElementById("newProdImgFileInput").value = "";
  document.getElementById("newProdImgPreviewBox").style.display = "none";
  newProductBase64Image = "";

  document.getElementById("addProductModal").style.display = "flex";
}

function populateSelectOptions(elId, list, placeholder) {
  const sel = document.getElementById(elId);
  sel.innerHTML = `<option value="">${placeholder}</option>`;
  list.sort().forEach(item => {
    sel.innerHTML += `<option value="${item}">${item}</option>`;
  });
  sel.innerHTML += `<option value="__other__" style="color:#1565c0; font-weight:bold;">➕ 其他 (自訂輸入)...</option>`;
}

function onCategorySelectChange() {
  const sel = document.getElementById("newProdCategorySel");
  const custom = document.getElementById("newProdCategoryCustom");
  custom.style.display = (sel.value === "__other__") ? "block" : "none";
}

function onBrandSelectChange() {
  const sel = document.getElementById("newProdBrandSel");
  const custom = document.getElementById("newProdBrandCustom");
  custom.style.display = (sel.value === "__other__") ? "block" : "none";
}

function onOriginSelectChange() {
  const sel = document.getElementById("newProdOriginSel");
  const custom = document.getElementById("newProdOriginCustom");
  custom.style.display = (sel.value === "__other__") ? "block" : "none";
}

function previewNewProductImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      const maxDim = 800;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
      newProductBase64Image = compressedDataUrl.split(",")[1];

      document.getElementById("newProdImgPreview").src = compressedDataUrl;
      document.getElementById("newProdImgPreviewBox").style.display = "block";
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function scanBarcodeForNewProduct() {
  const code = prompt("請對準條碼進行掃描，或在此手動輸入/刷入條碼號碼：");
  if (code && code.trim()) {
    document.getElementById("newProdBarcodeInput").value = cleanBarcode(code);
  }
}

async function submitNewProduct() {
  const name = document.getElementById("newProdNameInput").value.trim();
  if (!name) {
    await appAlert("請填寫「規格與口味 (產品名稱)」！", "資料未完整");
    return;
  }

  let category = document.getElementById("newProdCategorySel").value;
  if (category === "__other__") category = document.getElementById("newProdCategoryCustom").value.trim();

  let brand = document.getElementById("newProdBrandSel").value;
  if (brand === "__other__") brand = document.getElementById("newProdBrandCustom").value.trim();

  let origin = document.getElementById("newProdOriginSel").value;
  if (origin === "__other__") origin = document.getElementById("newProdOriginCustom").value.trim();

  const price = Number(document.getElementById("newProdPriceInput").value) || 0;
  const barcode = document.getElementById("newProdBarcodeInput").value.trim();
  const remark = document.getElementById("newProdRemarkInput").value.trim();

  const btn = document.getElementById("btnSubmitNewProd");
  btn.innerText = "⏳ 同步寫入中...";

  try {
    const res = await apiRequest("", {
      method: "POST",
      body: {
        action: "addProduct",
        productData: {
          category,
          brand,
          origin,
          name,
          price,
          barcode,
          remark,
          imageBase64: newProductBase64Image
        }
      }
    });

    btn.innerText = "確認同步新增";
    closeModal("addProductModal");

    if (res.success) {
      await appAlert(`✅ 新增成功！\n${res.msg}`, "成功");
      await loadProducts(currentActiveSheetName, currentActiveWeek);
      if (activeTab === "tab2") loadTab2Data();
    } else {
      await appAlert(res.msg, "操作被拒");
    }
  } catch (err) {
    btn.innerText = "確認同步新增";
    await appAlert("新增失敗：" + err.message, "伺服器錯誤");
  }
}

function safeInitGIS() {
  if (window.google?.accounts?.id) {
    initGoogleGIS();
  } else {
    window.addEventListener("load", initGoogleGIS);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  renderUserStatus();
  setupTabs();
  setupPermissions();
  setupBarcodeInput();
  safeInitGIS();
  loadProducts(null, null);
});

// ==========================================
// [Part JS.4] [F_JS_04] 預訂記錄彈窗與出示 QR Code
// ==========================================
function openOrderHistoryModal() {
  document.getElementById("historyModalDeviceId").innerText = deviceId;
  document.getElementById("historyModalUser").innerText = userEmail ? `${userEmail} (${userRole})` : "未登入訪客";

  const history = JSON.parse(localStorage.getItem("cup_noodle_order_history") || "[]");
  const container = document.getElementById("orderHistoryListContainer");

  if (history.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px 10px; color:#888;">本裝置尚無任何預訂記錄</div>`;
  } else {
    let html = "";
    history.forEach(order => {
      const itemsText = order.items.map(it => `${it.name} x${it.qty}`).join("、 ");
      html += `
        <div class="history-order-card" onclick="showOrderQrModal('${order.id}')">
          <div class="history-order-header">
            <span class="history-order-id">${order.id}</span>
            <span class="history-order-time">${order.time}</span>
          </div>
          <div class="history-order-details">
            <b>共 ${order.totalCups} 杯</b> | 明細：${itemsText}
          </div>
          <div style="text-align:right; margin-top:6px; font-size:11px; color:#1565c0; font-weight:bold;">
            📱 點擊出示取餐 QR Code ❯
          </div>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  document.getElementById("orderHistoryModal").style.display = "flex";
}

// 點擊卡片彈出高解析取餐 QR Code
function showOrderQrModal(orderId) {
  const history = JSON.parse(localStorage.getItem("cup_noodle_order_history") || "[]");
  const order = history.find(o => o.id === orderId);
  if (!order) return;

  const orderPayload = "CNORDER:" + JSON.stringify({
    id: order.id,
    time: order.time,
    user: order.user,
    deviceId: order.deviceId,
    week: order.week,
    items: order.items.map(it => ({ row: it.rowIndex, name: it.name, qty: it.qty }))
  });

  const qrUrl = "https://quickchart.io/qr?text=" + encodeURIComponent(orderPayload) + "&size=260&ecLevel=M";

  document.getElementById("qrViewTitle").innerText = "🍜 現場取餐專用憑證";
  document.getElementById("qrViewSubtitle").innerHTML = `訂單號：<b>${order.id}</b><br>憑證：${order.deviceId}`;
  document.getElementById("qrViewImg").src = qrUrl;
  document.getElementById("qrViewItemsList").innerHTML = order.items.map(it => `• ${it.name} x <b>${it.qty}</b>`).join("<br>");

  document.getElementById("orderQrViewModal").style.display = "flex";
}

