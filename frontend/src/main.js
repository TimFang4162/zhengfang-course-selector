import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import "monaco-editor/min/vs/editor/editor.main.css";
import { mountSolidRoot } from "./solid-entry.js";

const state = {
  bootstrap: null,
  categories: [],
  categoryCourses: {},
  courseClasses: {},
  expandedCategories: new Set(),
  expandedCourses: new Set(),
  loadingCategories: new Set(),
  loadingCourses: new Set(),
  filters: { conflict: false, credit: false },
  search: { query: "", scope: "all" },
  sidebarCollapsed: false,
  activities: [],
  grabTasks: {},
  timetable: {
    entries: [],
    selectedCourseIds: [],
    selectedClassIds: [],
    selectedDoJxbIds: [],
    maxCredit: 32,
    currentCredit: 0,
  },
  displayWeek: 1,
  activeTab: "tree",
  logSince: 0,
  selectedCell: null,
  modalClass: null,
  grabDraft: null,
  grabEditor: null,
};

const weekdayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const maxWeek = 19;
const maxJieci = 13;
const LEFT_WIDTH_KEY = "jwxt.leftPaneWidth";
const DETAIL_HEIGHT_KEY = "jwxt.detailHeight";
const SIDEBAR_COLLAPSED_KEY = "jwxt.sidebarCollapsed";
const ACTIVITY_HEIGHT_KEY = "jwxt.activityHeight";

async function apiGet(path) {
  const response = await fetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function apiPost(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

async function apiPostEmpty(path) {
  const response = await fetch(path, { method: "POST" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getGrabExpressionValue() {
  if (state.grabEditor) return state.grabEditor.getValue();
  return document.getElementById("grab-expression").value;
}

function setGrabExpressionValue(value) {
  document.getElementById("grab-expression").value = value;
  if (state.grabEditor) state.grabEditor.setValue(value);
}

function initGrabMonaco() {
  const monacoRoot = document.getElementById("grab-monaco");
  const textarea = document.getElementById("grab-expression");
  if (!monacoRoot || state.grabEditor) return;
  monaco.languages.register({ id: "grabexpr" });
  monaco.languages.setMonarchTokensProvider("grabexpr", {
    tokenizer: {
      root: [
        [/\b(and|or|not|in)\b/, "keyword"],
        [/\b(course|class|teachers|conflicts|has_capacity)\b/, "variable"],
        [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/, "string"],
        [/\b\d+(\.\d+)?\b/, "number"],
        [/[=!<>]=?|[()]/, "operator"],
      ],
    },
  });
  monaco.languages.registerCompletionItemProvider("grabexpr", {
    provideCompletionItems: () => ({
      suggestions: grabSymbols.map((label) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Field,
        insertText: label,
        detail: grabSymbolDocs[label] || "抢课表达式字段",
      })).concat(["and", "or", "not", "in"].map((label) => ({
        label,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: label,
      }))),
    }),
  });
  monaco.languages.registerHoverProvider("grabexpr", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;
      const line = model.getLineContent(position.lineNumber);
      const prefix = line.slice(0, word.startColumn - 1).match(/[A-Za-z_][\w.]*$/)?.[0] || "";
      const key = prefix ? `${prefix}.${word.word}` : word.word;
      const doc = grabSymbolDocs[key] || grabSymbolDocs[word.word];
      if (!doc) return null;
      return { contents: [{ value: `\`${key}\`` }, { value: doc }] };
    },
  });
  state.grabEditor = monaco.editor.create(monacoRoot, {
    value: textarea.value,
    language: "grabexpr",
    theme: "vs-dark",
    minimap: { enabled: false },
    lineNumbers: "off",
    scrollBeyondLastLine: false,
    wordWrap: "on",
    automaticLayout: true,
    fontSize: 13,
    tabSize: 2,
  });
  state.grabEditor.onDidChangeModelContent(() => refreshGrabPreview().catch(showError));
  textarea.classList.add("monaco-enabled");
}

function applyStoredLayout() {
  const storedLeftWidth = Number(window.localStorage.getItem(LEFT_WIDTH_KEY) || 0);
  const storedDetailHeight = Number(window.localStorage.getItem(DETAIL_HEIGHT_KEY) || 0);
  const storedActivityHeight = Number(window.localStorage.getItem(ACTIVITY_HEIGHT_KEY) || 0);
  if (storedLeftWidth > 0) {
    document.documentElement.style.setProperty("--left-pane-width", `${storedLeftWidth}px`);
  }
  if (storedDetailHeight > 0) {
    document.documentElement.style.setProperty("--detail-height", `${storedDetailHeight}px`);
  }
  if (storedActivityHeight > 0) {
    document.documentElement.style.setProperty("--activity-height", `${storedActivityHeight}px`);
  }
  state.sidebarCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
}

function constrainLayoutVars() {
  const mainLayout = document.querySelector(".main-layout");
  const timetablePanel = document.getElementById("tab-timetable");
  const rightPane = document.querySelector(".right-pane");
  if (mainLayout && window.innerWidth > 960) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--left-pane-width")) || mainLayout.clientWidth * 0.65;
    const next = clamp(current, 360, Math.max(420, mainLayout.clientWidth - 280 - 6));
    document.documentElement.style.setProperty("--left-pane-width", `${next}px`);
  }
  if (timetablePanel) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-height")) || 150;
    const next = clamp(current, 110, Math.max(110, Math.min(window.innerHeight * 0.5, timetablePanel.clientHeight - 120)));
    document.documentElement.style.setProperty("--detail-height", `${next}px`);
  }
  if (rightPane) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--activity-height")) || 220;
    const next = clamp(current, 120, Math.max(120, rightPane.clientHeight - 120));
    document.documentElement.style.setProperty("--activity-height", `${next}px`);
  }
}

function bindSplitters() {
  const mainSplitter = document.getElementById("main-splitter");
  const detailSplitter = document.getElementById("detail-splitter");
  const activitySplitter = document.getElementById("activity-splitter");

  if (mainSplitter) {
    mainSplitter.addEventListener("pointerdown", (event) => {
      if (window.innerWidth <= 960) return;
      event.preventDefault();
      mainSplitter.classList.add("is-dragging");
      const onMove = (moveEvent) => {
        const maxWidth = Math.max(420, window.innerWidth - 280 - 6);
        const next = clamp(moveEvent.clientX, 360, maxWidth);
        document.documentElement.style.setProperty("--left-pane-width", `${next}px`);
        window.localStorage.setItem(LEFT_WIDTH_KEY, String(next));
      };
      const onUp = () => {
        mainSplitter.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  if (detailSplitter) {
    detailSplitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      detailSplitter.classList.add("is-dragging");
      const panel = document.getElementById("tab-timetable");
      const onMove = (moveEvent) => {
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const next = clamp(rect.bottom - moveEvent.clientY, 110, Math.max(110, Math.min(window.innerHeight * 0.5, panel.clientHeight - 120)));
        document.documentElement.style.setProperty("--detail-height", `${next}px`);
        window.localStorage.setItem(DETAIL_HEIGHT_KEY, String(next));
      };
      const onUp = () => {
        detailSplitter.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  if (activitySplitter) {
    activitySplitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      activitySplitter.classList.add("is-dragging");
      const pane = document.querySelector(".right-pane");
      const onMove = (moveEvent) => {
        if (!pane) return;
        const rect = pane.getBoundingClientRect();
        const next = clamp(rect.bottom - moveEvent.clientY, 120, Math.max(120, pane.clientHeight - 120));
        document.documentElement.style.setProperty("--activity-height", `${next}px`);
        window.localStorage.setItem(ACTIVITY_HEIGHT_KEY, String(next));
      };
      const onUp = () => {
        activitySplitter.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  window.addEventListener("resize", constrainLayoutVars);
}

function selectedCourseIds() {
  return new Set(state.timetable.selectedCourseIds || []);
}

function selectedClassIds() {
  return new Set(state.timetable.selectedClassIds || []);
}

function selectedDoJxbIds() {
  return new Set(state.timetable.selectedDoJxbIds || []);
}

function isSelectedCourse(course) {
  return selectedCourseIds().has(course.kchId);
}

function isSelectedClass(item) {
  return selectedClassIds().has(item.jxbId) || selectedDoJxbIds().has(item.doJxbId);
}

function remainingCredit() {
  return Math.max(0, (state.timetable.maxCredit || 0) - (state.timetable.currentCredit || 0));
}

function occupiedSlotSet() {
  const set = new Set();
  for (const entry of state.timetable.entries) {
    for (const slot of entry.slots || []) {
      set.add(slot.join("-"));
    }
  }
  return set;
}

function courseExceedsCredit(course) {
  return !isSelectedCourse(course) && course.creditValue !== null && course.creditValue > remainingCredit();
}

function classConflicts(item) {
  const occupied = occupiedSlotSet();
  return (item.slots || []).some((slot) => occupied.has(slot.join("-")));
}

function classMuted(course, item) {
  if (isSelectedClass(item)) return false;
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (state.filters.conflict && classConflicts(item)) return true;
  return false;
}

function classConflictMuted(item) {
  return state.filters.conflict && classConflicts(item) && !isSelectedClass(item);
}

function courseMuted(categoryId, course) {
  if (isSelectedCourse(course)) return false;
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (!state.filters.conflict) return false;
  const classItems = state.courseClasses[`${categoryId}:${course.kchId}`];
  if (!classItems || !classItems.length) return false;
  return classItems.every((item) => classMuted(course, item));
}

function setLoginStatus(text) {
  document.getElementById("login-status").textContent = text;
}

function setFilterStatus() {
  const conflict = document.querySelector('#display-menu [data-action="toggle-conflict"]');
  const credit = document.querySelector('#display-menu [data-action="toggle-credit"]');
  if (conflict) conflict.textContent = `灰色显示冲突教学班:${state.filters.conflict ? "开" : "关"}`;
  if (credit) credit.textContent = `隐藏超学分课程:${state.filters.credit ? "开" : "关"}`;
}

function closeMenus() {
  document.querySelectorAll(".menu-popover").forEach((menu) => {
    menu.classList.add("hidden");
  });
}

function toggleMenu(menuId) {
  const menu = document.getElementById(menuId);
  const wasHidden = menu.classList.contains("hidden");
  closeMenus();
  if (wasHidden) menu.classList.remove("hidden");
}

function upsertActivity(id, patch) {
  const now = new Date().toLocaleTimeString();
  const existing = state.activities.find((item) => item.id === id);
  if (existing) Object.assign(existing, patch, { updatedAt: now });
  else state.activities.unshift({ id, name: id, status: "等待", progress: "-", updatedAt: now, ...patch });
  renderActivities();
}

function renderActivities() {
  const tbody = document.getElementById("activity-list");
  if (!tbody) return;
  if (!state.activities.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="dim">暂无活动</td></tr>';
    return;
  }
  tbody.innerHTML = state.activities.map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.progress)} <button type="button" class="activity-more" data-task-id="${escapeHtml(item.id)}">⋯</button></td>
    </tr>
  `).join("");
  tbody.querySelectorAll(".activity-more").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openActivityTaskMenu(button.dataset.taskId, button);
    });
  });
}

function syncSearchScopeOptions() {
  const select = document.getElementById("search-scope");
  if (!select) return;
  const previous = select.value || state.search.scope;
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "全部大类";
  select.appendChild(all);
  for (const category of state.categories) {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  }
  select.value = [...select.options].some((option) => option.value === previous) ? previous : "all";
  state.search.scope = select.value;
}

function normalizedSearchQuery() {
  return state.search.query.trim().toLowerCase();
}

function textMatchesSearch(...parts) {
  const query = normalizedSearchQuery();
  if (!query) return true;
  return parts.filter(Boolean).some((part) => String(part).toLowerCase().includes(query));
}

function courseMatchesSearch(categoryId, course) {
  if (!textMatchesSearch(course.courseName, course.kchId, course.creditText, course.classCount)) {
    const classItems = state.courseClasses[`${categoryId}:${course.kchId}`] || [];
    return classItems.some((item) => classMatchesSearch(item));
  }
  return true;
}

function classMatchesSearch(item) {
  return textMatchesSearch(item.classNo, item.teacherName, item.teacherTitle, item.sksj, item.location, item.courseProperty);
}

function categoryInSearchScope(categoryId) {
  return state.search.scope === "all" || state.search.scope === categoryId;
}

function shouldRenderCourse(categoryId, course) {
  if (state.filters.credit && courseExceedsCredit(course)) return false;
  return courseMatchesSearch(categoryId, course);
}

function shouldRenderClass(item) {
  return true;
}

function applyLocalSearch() {
  state.search.query = document.getElementById("course-search").value;
  state.search.scope = document.getElementById("search-scope").value;
  renderTree();
}

function runDisplayAction(action) {
  if (action === "toggle-conflict") state.filters.conflict = !state.filters.conflict;
  if (action === "toggle-credit") state.filters.credit = !state.filters.credit;
  if (action) {
    setFilterStatus();
    renderTree();
  }
}

function runFeatureAction(action) {
  if (action === "export-courses") exportAllCourses().catch(showError);
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  document.getElementById("toggle-sidebar").textContent = state.sidebarCollapsed ? "⇥" : "⇤";
  window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, state.sidebarCollapsed ? "1" : "0");
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tab}`);
  });
}

function updateAuthStatus() {
  const baseSelect = document.getElementById("workspace-base-url");
  if (state.bootstrap?.baseUrl && baseSelect) {
    baseSelect.value = state.bootstrap.baseUrl;
  }
}

function getLoginBaseUrl() {
  const select = document.getElementById("base-url");
  if (select.value === "__custom__") {
    return document.getElementById("custom-base-url").value.trim();
  }
  return select.value;
}

function syncCustomAddressInput() {
  const isCustom = document.getElementById("base-url").value === "__custom__";
  document.getElementById("custom-base-url").classList.toggle("hidden", !isCustom);
}

function updateAddressOptionLatency(url, ms) {
  for (const select of [document.getElementById("base-url"), document.getElementById("workspace-base-url")]) {
    const option = [...select.options].find((item) => item.value === url);
    if (!option) continue;
    option.textContent = option.textContent.replace(/\s\(\d+ms\)$/, "") + ` (${ms}ms)`;
  }
}

async function updateSslVerifySetting() {
  const disableSslVerify = document.getElementById("disable-ssl-verify").checked;
  if (state.bootstrap) state.bootstrap.disableSslVerify = disableSslVerify;
  await apiPost("/api/settings", { disableSslVerify });
}

async function loadBootstrap() {
  state.bootstrap = await apiGet("/api/bootstrap");
  const baseSelect = document.getElementById("base-url");
  const workspaceBaseSelect = document.getElementById("workspace-base-url");
  baseSelect.innerHTML = "";
  workspaceBaseSelect.innerHTML = "";
  for (const item of state.bootstrap.addressChoices) {
    for (const select of [baseSelect, workspaceBaseSelect]) {
      const option = document.createElement("option");
      option.value = item.url;
      option.textContent = `${item.url} (${item.description})`;
      if (item.url === state.bootstrap.baseUrl) option.selected = true;
      select.appendChild(option);
    }
  }
  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "自定义地址...";
  baseSelect.appendChild(customOption);
  if (state.bootstrap.baseUrl && !state.bootstrap.addressChoices.some((item) => item.url === state.bootstrap.baseUrl)) {
    baseSelect.value = "__custom__";
    document.getElementById("custom-base-url").value = state.bootstrap.baseUrl;
  }
  syncCustomAddressInput();
  document.getElementById("disable-ssl-verify").checked = Boolean(state.bootstrap.disableSslVerify);
  const savedHint = document.getElementById("saved-hint");
  savedHint.textContent = state.bootstrap.savedCredentials.available
    ? `已保存账号 ${state.bootstrap.savedCredentials.masked}`
    : "无已保存凭据";
  document.getElementById("saved-login-panel").classList.toggle("hidden", !state.bootstrap.savedCredentials.available);
  document.getElementById("saved-login-button").textContent = state.bootstrap.savedCredentials.available
    ? `以 ${state.bootstrap.savedCredentials.masked} 登录`
    : "以已保存凭据登录";
  document.getElementById("student-number").value = state.bootstrap.savedCredentials.studentNumber || "";
  syncSearchScopeOptions();
  if (state.bootstrap.authenticated) {
    state.categories = state.bootstrap.categories?.items || [];
    state.timetable = state.bootstrap.timetable || state.timetable;
    document.getElementById("login-overlay").classList.add("hidden");
    syncSearchScopeOptions();
    setFilterStatus();
    await syncTreeState();
    renderTree();
    renderTimetable();
    renderTimetableDetailAll();
  }
}

async function doLogin(useSavedOverride = false) {
  setLoginStatus("登录中...");
  try {
    const payload = {
      baseUrl: getLoginBaseUrl(),
      useSaved: useSavedOverride || document.getElementById("use-saved").checked,
      studentNumber: document.getElementById("student-number").value.trim(),
      password: document.getElementById("password").value,
      saveCredentials: document.getElementById("save-creds").checked,
      disableSslVerify: document.getElementById("disable-ssl-verify").checked,
    };
    const result = await apiPost("/api/login", payload);
    if (!result.ok) throw new Error(result.message || "登录失败");
    state.categories = result.categories.items;
    state.timetable = result.timetable;
    state.bootstrap.baseUrl = getLoginBaseUrl();
    state.bootstrap.disableSslVerify = document.getElementById("disable-ssl-verify").checked;
    document.getElementById("login-overlay").classList.add("hidden");
    updateAuthStatus();
    syncSearchScopeOptions();
    setFilterStatus();
    await syncTreeState();
    renderTree();
    renderTimetable();
    renderTimetableDetailAll();
    setLoginStatus("");
  } catch (error) {
    setLoginStatus(error.message);
  }
}

async function testLoginAddresses() {
  const content = document.getElementById("speed-content");
  document.getElementById("speed-modal").classList.remove("hidden");
  const addresses = state.bootstrap.addressChoices.map((item) => ({ label: item.description, url: item.url }));
  const customUrl = document.getElementById("custom-base-url").value.trim();
  if (customUrl) addresses.push({ label: "自定义地址", url: customUrl });
  content.innerHTML = `
    <table class="speed-table">
      <thead><tr><th>地址</th><th>状态</th><th>耗时</th><th>说明</th></tr></thead>
      <tbody>
        ${addresses.map((item, index) => `
          <tr id="speed-row-${index}" class="is-pending">
            <td><button type="button" class="link-button" data-url="${escapeHtml(item.url)}">${escapeHtml(item.url)}</button><div class="dim">${escapeHtml(item.label)}</div></td>
            <td>等待中</td>
            <td>-</td>
            <td>-</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  content.querySelectorAll("[data-url]").forEach((button) => {
    button.addEventListener("click", () => {
      setLoginBaseUrl(button.dataset.url);
      document.getElementById("speed-modal").classList.add("hidden");
    });
  });
  await Promise.all(addresses.map(async (address, index) => {
    const row = document.getElementById(`speed-row-${index}`);
    if (!row) return;
    row.children[1].textContent = "测试中";
    try {
      const data = await apiPost("/api/addresses/test", {
        addresses: [address],
        disableSslVerify: document.getElementById("disable-ssl-verify").checked,
      });
      const item = data.items?.[0];
      if (!item) throw new Error("无测速结果");
      row.className = item.ok ? "is-ok" : "is-error";
      row.children[1].textContent = `${item.ok ? "可达" : "失败"}${item.status ? ` / ${item.status}` : ""}`;
      row.children[2].textContent = `${item.ms}ms`;
      row.children[3].textContent = item.message || "";
      if (item.ok) updateAddressOptionLatency(item.url, item.ms);
    } catch (error) {
      row.className = "is-error";
      row.children[1].textContent = "失败";
      row.children[2].textContent = "-";
      row.children[3].textContent = error.message || String(error);
    }
  }));
}

function setLoginBaseUrl(url) {
  const select = document.getElementById("base-url");
  const matched = [...select.options].some((option) => option.value === url);
  if (matched) {
    select.value = url;
  } else {
    select.value = "__custom__";
    document.getElementById("custom-base-url").value = url;
  }
  syncCustomAddressInput();
}

async function refreshCategories(force = false) {
  const data = await apiGet(`/api/categories${force ? "?refresh=1" : ""}`);
  state.categories = data.items;
  syncSearchScopeOptions();
  if (force) {
    state.categoryCourses = {};
    state.courseClasses = {};
    state.expandedCategories.clear();
    state.expandedCourses.clear();
    state.loadingCategories.clear();
    state.loadingCourses.clear();
  }
  renderTree();
}

function applyTreeState(tree) {
  if (!tree?.items) return;
  state.categories = tree.items.map((item) => ({
    id: item.id,
    name: item.name,
    kklxdm: item.kklxdm,
    xkkzId: item.xkkzId,
    grade: item.grade,
    zyhId: item.zyhId,
  }));
  syncSearchScopeOptions();
  for (const category of tree.items) {
    state.categoryCourses[category.id] = {
      courses: category.courses || [],
      hasMore: Boolean(category.hasMore),
      nextPage: category.nextPage || 1,
      loaded: Boolean(category.coursesLoaded),
    };
    for (const course of category.courses || []) {
      if (course.classesLoaded) {
        state.courseClasses[`${category.id}:${course.kchId}`] = course.classes || [];
      }
    }
  }
}

async function syncTreeState() {
  const tree = await apiGet("/api/tree/state");
  applyTreeState(tree);
  renderTree();
}

async function refreshTimetable() {
  state.timetable = await apiGet("/api/timetable");
  setFilterStatus();
  renderTimetable();
  renderTimetableDetailAll();
  renderTree();
}

async function loadCategoryCourses(categoryId, page = 1) {
  state.loadingCategories.add(categoryId);
  renderTree();
  const data = await apiGet(`/api/courses?category_id=${categoryId}&page=${page}`);
  const bucket = state.categoryCourses[categoryId] || { courses: [], hasMore: false, nextPage: 2, loaded: false };
  const merged = [...bucket.courses];
  for (const course of data.courses) {
    const idx = merged.findIndex((item) => item.kchId === course.kchId);
    if (idx >= 0) merged[idx] = course;
    else merged.push(course);
  }
  state.categoryCourses[categoryId] = {
    courses: merged,
    hasMore: data.hasMore,
    nextPage: data.nextPage,
    loaded: true,
  };
  state.loadingCategories.delete(categoryId);
  await syncTreeState();
  renderTree();
}

async function fetchAllCategoryCourses(categoryId) {
  const courses = [];
  let page = 1;
  let hasMore = true;
  let nextPage = 1;
  while (hasMore) {
    const data = await apiGet(`/api/courses?category_id=${categoryId}&page=${page}`);
    for (const course of data.courses || []) {
      const idx = courses.findIndex((item) => item.kchId === course.kchId);
      if (idx >= 0) courses[idx] = course;
      else courses.push(course);
    }
    hasMore = Boolean(data.hasMore);
    nextPage = data.nextPage || page + 1;
    page = nextPage;
  }
  state.categoryCourses[categoryId] = {
    courses,
    hasMore: false,
    nextPage,
    loaded: true,
  };
  return courses;
}

async function fetchCourseClassesForExport(categoryId, course) {
  const key = `${categoryId}:${course.kchId}`;
  if (state.courseClasses[key]) return state.courseClasses[key];
  const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(course.kchId)}`);
  state.courseClasses[key] = data.classes || [];
  return state.courseClasses[key];
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportAllCourses() {
  const action = document.getElementById("feature-menu-button");
  action.disabled = true;
  upsertActivity("export-courses", { name: "导出所有课程", status: "运行中", progress: "准备" });
  try {
    const exportedAt = new Date().toISOString();
    const categories = [];
    for (const [categoryIndex, category] of state.categories.entries()) {
      upsertActivity("export-courses", { status: "拉取大类", progress: `${categoryIndex + 1}/${state.categories.length} ${category.name}` });
      const courses = await fetchAllCategoryCourses(category.id);
      const exportedCourses = [];
      for (const [courseIndex, course] of courses.entries()) {
        upsertActivity("export-courses", { status: "拉取教学班", progress: `${categoryIndex + 1}/${state.categories.length} ${courseIndex + 1}/${courses.length}` });
        const classes = await fetchCourseClassesForExport(category.id, course);
        exportedCourses.push({ ...course, classes });
      }
      categories.push({ ...category, courses: exportedCourses });
      renderTree();
    }
    downloadJson(`jwxt-courses-${exportedAt.replaceAll(":", "-")}.json`, {
      exportedAt,
      baseUrl: state.bootstrap?.baseUrl || "",
      categoryCount: categories.length,
      courseCount: categories.reduce((total, category) => total + category.courses.length, 0),
      classCount: categories.reduce((total, category) => total + category.courses.reduce((sum, course) => sum + course.classes.length, 0), 0),
      categories,
    });
    upsertActivity("export-courses", { status: "完成", progress: `${categories.length}大类 ${categories.reduce((total, category) => total + category.courses.length, 0)}课程` });
  } catch (error) {
    upsertActivity("export-courses", { status: "失败", progress: error.message || String(error) });
    throw error;
  } finally {
    action.disabled = false;
    renderTree();
  }
}

async function loadCourseClasses(categoryId, kchId) {
  const loadingKey = `${categoryId}:${kchId}`;
  state.loadingCourses.add(loadingKey);
  renderTree();
  const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(kchId)}`);
  state.courseClasses[`${categoryId}:${kchId}`] = data.classes;
  state.loadingCourses.delete(loadingKey);
  await syncTreeState();
  renderTree();
}

function toggleCategory(categoryId) {
  if (state.expandedCategories.has(categoryId)) {
    state.expandedCategories.delete(categoryId);
    renderTree();
    return;
  }
  state.expandedCategories.add(categoryId);
  if (!state.categoryCourses[categoryId]?.loaded) {
    loadCategoryCourses(categoryId, 1).catch(showError);
  } else {
    renderTree();
  }
}

function toggleCourse(categoryId, kchId) {
  const key = `${categoryId}:${kchId}`;
  if (state.expandedCourses.has(key)) {
    state.expandedCourses.delete(key);
    renderTree();
    return;
  }
  state.expandedCourses.add(key);
  if (!state.courseClasses[key]) {
    loadCourseClasses(categoryId, kchId).catch(showError);
  } else {
    renderTree();
  }
}

function makeTreeRow({ level, label, selected = false, muted = false, expandable = false, expanded = false, onClick }) {
  const row = document.createElement("div");
  row.className = `tree-row level-${level}${selected ? " selected" : ""}${muted ? " muted" : ""}`;
  const arrow = document.createElement("span");
  arrow.className = `tree-arrow${expandable ? " is-expandable" : ""}${expanded ? " is-expanded" : ""}`;
  arrow.textContent = expandable ? (expanded ? "▾" : "▸") : "·";
  const text = document.createElement("div");
  text.className = "tree-label";
  if (label instanceof Node) text.appendChild(label);
  else text.textContent = label;
  row.append(arrow, text);
  row.addEventListener("click", onClick);
  return row;
}

function makeCell(text, className = "") {
  const cell = document.createElement("span");
  cell.className = className;
  cell.textContent = text || "-";
  return cell;
}

function makeRowChrome(content, { checked = false, onMore = null } = {}) {
  const row = document.createElement("div");
  row.className = "tree-row-grid";
  const checkbox = document.createElement("span");
  checkbox.className = `tree-check${checked ? " is-checked" : ""}`;
  checkbox.textContent = checked ? "✓" : "";
  const more = document.createElement("span");
  more.className = "tree-more-dot";
  more.textContent = "⋯";
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    if (onMore) onMore(more);
  });
  row.append(checkbox, content, more);
  return row;
}

function courseSummary(category, course) {
  const table = document.createElement("div");
  table.className = "tree-table tree-course-table";
  table.append(
    makeCell(course.courseName, "tree-table-main"),
    makeCell(course.kchId, "tree-table-code"),
    makeCell(course.creditText ? `${course.creditText}学分` : "-", "tree-table-credit"),
    makeCell(`${course.classCount}教学班`, "tree-table-count"),
  );
  return makeRowChrome(table, {
    checked: isSelectedCourse(course),
    onMore: (anchor) => openTreeMoreMenu(anchor, { type: "course", category, course }),
  });
}

function classSummary(category, course, item) {
  const teacher = item.teacherTitle ? `${item.teacherName}/${item.teacherTitle}` : item.teacherName || "未标注教师";
  const countText = `${item.selectedCount}/${item.capacity}`;
  const table = document.createElement("div");
  table.className = "tree-table tree-class-table";
  table.append(
    makeCell(`${item.index}. ${item.classNo}`, "tree-table-code"),
    makeCell(teacher, "tree-table-teacher"),
    makeCell(item.sksj, "tree-table-time"),
    makeCell(item.location, "tree-table-location"),
    makeCell(item.courseProperty, "tree-table-prop"),
    makeCell(countText, "tree-table-count"),
  );
  return makeRowChrome(table, {
    checked: isSelectedClass(item),
    onMore: (anchor) => openTreeMoreMenu(anchor, { type: "class", category, course, classItem: item }),
  });
}

function renderTree() {
  const root = document.getElementById("course-tree");
  root.innerHTML = "";
  for (const category of state.categories) {
    if (!categoryInSearchScope(category.id)) continue;
    const bucket = state.categoryCourses[category.id];
    const courses = bucket?.courses || [];
    const categoryLoading = state.loadingCategories.has(category.id);
    const visibleCourses = courses.filter((course) => shouldRenderCourse(category.id, course));
    const renderCourses = normalizedSearchQuery() ? visibleCourses : courses;
    const categoryMuted = renderCourses.length > 0 && renderCourses.every((course) => courseMuted(category.id, course));
    const categoryCountText = bucket?.loaded && !bucket?.hasMore ? String(renderCourses.length) : "?";
    const label = `${category.name} (${categoryCountText})`;
    const categoryLabel = makeRowChrome(document.createTextNode(label), {
      onMore: (anchor) => openTreeMoreMenu(anchor, { type: "category", category }),
    });
    const categoryRow = makeTreeRow({
      level: 0,
      label: categoryLabel,
      muted: categoryMuted,
      expandable: true,
      expanded: state.expandedCategories.has(category.id),
      onClick: () => toggleCategory(category.id),
    });
    root.appendChild(categoryRow);
    if (!state.expandedCategories.has(category.id)) continue;
    const children = document.createElement("div");
    children.className = "tree-children";
    if (!bucket?.loaded && categoryLoading) {
      const placeholder = document.createElement("div");
      placeholder.className = "tree-placeholder";
      placeholder.textContent = "加载课程中...";
      children.appendChild(placeholder);
    } else if (!bucket?.loaded) {
      const placeholder = document.createElement("div");
      placeholder.className = "tree-placeholder";
      placeholder.textContent = "展开后加载课程";
      children.appendChild(placeholder);
    } else {
      for (const course of renderCourses) {
        const courseKey = `${category.id}:${course.kchId}`;
        const labelText = courseSummary(category, course);
        if (isSelectedCourse(course)) {
          labelText.querySelector(".tree-table-main").textContent += " (已选)";
        }
        const courseRow = makeTreeRow({
          level: 1,
          label: labelText,
          selected: isSelectedCourse(course),
          muted: courseMuted(category.id, course),
          expandable: true,
          expanded: state.expandedCourses.has(courseKey),
          onClick: () => toggleCourse(category.id, course.kchId),
        });
        children.appendChild(courseRow);
        if (!state.expandedCourses.has(courseKey)) continue;
        const classChildren = document.createElement("div");
        classChildren.className = "tree-children";
        const classItems = state.courseClasses[courseKey];
        if (state.loadingCourses.has(courseKey)) {
          const placeholder = document.createElement("div");
          placeholder.className = "tree-placeholder";
          placeholder.textContent = "加载教学班中...";
          classChildren.appendChild(placeholder);
        } else if (!classItems) {
          const placeholder = document.createElement("div");
          placeholder.className = "tree-placeholder";
          placeholder.textContent = "展开后加载教学班";
          classChildren.appendChild(placeholder);
        } else if (!classItems.length) {
          const placeholder = document.createElement("div");
          placeholder.className = "tree-placeholder";
          placeholder.textContent = "无教学班";
          classChildren.appendChild(placeholder);
        } else {
          const renderClassItems = classItems.filter((item) => {
            if (!shouldRenderClass(item)) return false;
            if (!normalizedSearchQuery()) return true;
            return classMatchesSearch(item) || textMatchesSearch(course.courseName, course.kchId);
          });
          if (!renderClassItems.length) {
            const placeholder = document.createElement("div");
            placeholder.className = "tree-placeholder";
            placeholder.textContent = "无匹配教学班";
            classChildren.appendChild(placeholder);
          }
          for (const item of renderClassItems) {
            const row = makeTreeRow({
              level: 2,
              label: classSummary(category, course, item),
              selected: isSelectedClass(item),
              muted: classMuted(course, item) || classConflictMuted(item),
              onClick: () => openClassModal(category.id, course, item),
            });
            classChildren.appendChild(row);
          }
        }
        children.appendChild(classChildren);
      }
      if (categoryLoading) {
        const placeholder = document.createElement("div");
        placeholder.className = "tree-placeholder";
        placeholder.textContent = "加载更多课程中...";
        children.appendChild(placeholder);
      } else if (bucket?.hasMore) {
        const more = document.createElement("button");
        more.className = "tree-more";
        more.textContent = "加载更多...";
        more.addEventListener("click", () => loadCategoryCourses(category.id, bucket.nextPage).catch(showError));
        children.appendChild(more);
      }
    }
    root.appendChild(children);
  }
}

function entriesForCell(day, jieci) {
  const items = [];
  for (const entry of state.timetable.entries) {
    for (const [week, slotDay, slotJieci] of entry.slots || []) {
      if (slotDay === day && slotJieci === jieci) {
        items.push({ week, entry });
      }
    }
  }
  return items;
}

function renderTimetable() {
  const table = document.getElementById("timetable-table");
  table.innerHTML = "";
  document.getElementById("week-label").textContent = `第 ${state.displayWeek}/${maxWeek} 周`;
  document.getElementById("week-credit").textContent = `学分${(state.timetable.currentCredit || 0).toFixed(1)}/${state.timetable.maxCredit || 32}`;
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["节次", ...weekdayNames].forEach((name) => {
    const th = document.createElement("th");
    th.textContent = name;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  let count = 0;
  for (let jieci = 1; jieci <= maxJieci; jieci += 1) {
    const tr = document.createElement("tr");
    const label = document.createElement("th");
    label.textContent = String(jieci);
    tr.appendChild(label);
    for (let day = 1; day <= 7; day += 1) {
      const td = document.createElement("td");
      const currentWeekNames = new Set();
      const otherWeekNames = new Set();
      for (const { week, entry } of entriesForCell(day, jieci)) {
        if (week === state.displayWeek) currentWeekNames.add(entry.name);
        else otherWeekNames.add(entry.name);
      }
      if (currentWeekNames.size) {
        td.textContent = [...currentWeekNames].join("\n");
        count += currentWeekNames.size;
      } else if (otherWeekNames.size) {
        const dim = document.createElement("div");
        dim.className = "cell-dim";
        dim.textContent = [...otherWeekNames].slice(0, 2).join("、");
        td.appendChild(dim);
      }
      const active = state.selectedCell && state.selectedCell.day === day && state.selectedCell.jieci === jieci;
      td.classList.toggle("active-cell", Boolean(active));
      td.addEventListener("click", () => {
        if (state.selectedCell && state.selectedCell.day === day && state.selectedCell.jieci === jieci) {
          state.selectedCell = null;
          renderTimetable();
          renderTimetableDetailAll();
          return;
        }
        state.selectedCell = { day, jieci };
        renderTimetable();
        renderTimetableCellDetail(day, jieci);
      });
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  document.getElementById("week-info").textContent = `(${count} 节课)`;
}

function renderTimetableDetailAll() {
  const detail = document.getElementById("timetable-detail");
  if (!state.timetable.entries.length) {
    detail.innerHTML = "<div class=\"dim\">暂无已选课程</div>";
    return;
  }
  const rows = state.timetable.entries.map((entry, index) => `
    <tr>
      <td>${escapeHtml(entry.name)}<br><span class="dim">${escapeHtml([entry.kchId, entry.classNo].filter(Boolean).join("/"))}</span></td>
      <td>${escapeHtml(entry.creditText || "")}</td>
      <td>${escapeHtml(entry.teacherName || "")}<br><span class="dim">${escapeHtml(entry.teacherTitle || "")}</span></td>
      <td>${escapeHtml(entry.sksj || "")}</td>
      <td>${escapeHtml(entry.location || "")}</td>
      <td><button type="button" class="detail-more" data-entry-index="${index}">⋯</button></td>
    </tr>
  `).join("");
  detail.innerHTML = `
    <table class="detail-table">
      <thead><tr><th>名称</th><th>学分</th><th>教师</th><th>时间</th><th>地点</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  detail.querySelectorAll(".detail-more").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openSelectedCourseMenu(Number(button.dataset.entryIndex), button);
    });
  });
}

function renderTimetableCellDetail(day, jieci) {
  const detail = document.getElementById("timetable-detail");
  const grouped = new Map();
  const items = entriesForCell(day, jieci).sort((a, b) => a.week - b.week);
  for (const { week, entry } of items) {
    const key = JSON.stringify([entry.name, entry.creditText, entry.teacherName, entry.teacherTitle, entry.sksj, entry.location, entry.kchId, entry.classNo]);
    const current = grouped.get(key) || { weeks: [], entry };
    current.weeks.push(week);
    grouped.set(key, current);
  }
  const rows = [...grouped.values()].map(({ weeks, entry }) => `
    <tr>
      <td>${escapeHtml(entry.name)}<br><span class="dim">${escapeHtml([entry.kchId, entry.classNo].filter(Boolean).join("/"))}</span></td>
      <td>${escapeHtml(entry.creditText || "")}</td>
      <td>${escapeHtml(entry.teacherName || "")}<br><span class="dim">${escapeHtml(entry.teacherTitle || "")}</span></td>
      <td>${escapeHtml(formatWeekRanges(weeks))}</td>
      <td>${escapeHtml(entry.sksj || "")}</td>
      <td>${escapeHtml(entry.location || "")}</td>
    </tr>
  `).join("");
  detail.innerHTML = `
    <table class="detail-table">
      <thead><tr><th>名称</th><th>学分</th><th>教师</th><th>周次</th><th>时间</th><th>地点</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function formatWeekRanges(weeks) {
  const ordered = [...new Set(weeks)].sort((a, b) => a - b);
  const parts = [];
  let start = ordered[0];
  let end = ordered[0];
  for (const week of ordered.slice(1)) {
    if (week === end + 1) {
      end = week;
      continue;
    }
    parts.push(start === end ? `第${start}周` : `第${start}-${end}周`);
    start = week;
    end = week;
  }
  parts.push(start === end ? `第${start}周` : `第${start}-${end}周`);
  return parts.join(", ");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showCourseDetail(entry) {
  state.modalClass = { entry };
  document.getElementById("modal-title").textContent = `${entry.name} / ${entry.classNo || "-"}`;
  document.getElementById("modal-content").innerHTML = `
    <div class="class-meta"><div>课程</div><div>${escapeHtml(entry.name)}</div></div>
    <div class="class-meta"><div>课程号</div><div>${escapeHtml(entry.kchId || "-")}</div></div>
    <div class="class-meta"><div>教学班</div><div>${escapeHtml(entry.classNo || "-")}</div></div>
    <div class="class-meta"><div>学分</div><div>${escapeHtml(entry.creditText || "-")}</div></div>
    <div class="class-meta"><div>上课教师</div><div>${escapeHtml(entry.teacherName || "")} <span class="dim">${escapeHtml(entry.teacherTitle || "")}</span></div></div>
    <div class="class-meta"><div>上课时间</div><div>${escapeHtml(entry.sksj || "-")}</div></div>
    <div class="class-meta"><div>教学地点</div><div>${escapeHtml(entry.location || "-")}</div></div>
  `;
  document.getElementById("modal-action").textContent = "退课";
  document.getElementById("class-modal").classList.remove("hidden");
}

function openSelectedCourseMenu(index, anchor) {
  const entry = state.timetable.entries[index];
  if (!entry) return;
  const menu = document.createElement("div");
  menu.className = "floating-menu";
  menu.innerHTML = `
    <button type="button" data-action="detail">详细信息</button>
    <button type="button" data-action="withdraw">退课</button>
  `;
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.right - 132)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (action === "detail") showCourseDetail(entry);
    if (action === "withdraw") withdrawSelectedEntry(entry).catch(showError);
    close();
  });
  window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
}

const grabSymbols = [
  "course.id",
  "course.name",
  "course.credit",
  "course.categoryId",
  "class.id",
  "class.no",
  "class.teacher",
  "teachers",
  "class.time",
  "class.location",
  "class.capacityLeft",
  "class.capacity",
  "class.selected",
  "conflicts",
  "has_capacity",
];

const grabSymbolDocs = {
  "course.id": "string：课程号，例如 course.id == \"xxxxxxxxx\"。",
  "course.name": "string：课程名称。",
  "course.credit": "number|null：课程学分。",
  "course.categoryId": "string：大类 ID。",
  "class.id": "string：教学班操作 ID，通常对应 doJxbId。",
  "class.no": "string：教学班号。",
  "class.teacher": "string：教师姓名。",
  "teachers": "string[]：教师姓名和职称数组，可写 \"张\" in teachers。",
  "class.time": "string：上课时间文本。",
  "class.location": "string：上课地点。",
  "class.capacityLeft": "number：剩余容量。",
  "class.capacity": "number：容量。",
  "class.selected": "number：已选人数。",
  "conflicts": "boolean：是否与当前课表冲突。",
  "has_capacity": "boolean：是否有余量。",
};

function defaultGrabExpression(context) {
  if (context.type === "category") return `course.categoryId == ${JSON.stringify(String(context.category.id))} and has_capacity and not conflicts`;
  if (context.type === "course") return `course.id == ${JSON.stringify(context.course.kchId)} and has_capacity and not conflicts`;
  return `course.id == ${JSON.stringify(context.course.kchId)} and class.no == ${JSON.stringify(context.classItem.classNo)} and has_capacity`;
}

function translateGrabExpression(expression) {
  return expression
    .replace(/\bclass\./g, "classItem.")
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!")
    .replace(/("[^"]*"|'[^']*')\s+in\s+([A-Za-z_][\w.\[\]]*)/g, "$2.includes($1)");
}

function validateGrabExpression(expression) {
  const jsExpression = translateGrabExpression(expression);
  try {
    Function("course", "classItem", "teachers", "conflicts", "has_capacity", `return Boolean(${jsExpression});`);
    return { ok: true, jsExpression };
  } catch (error) {
    return { ok: false, error: error.message, jsExpression };
  }
}

function buildGrabContext(category, course, classItem = null) {
  const selected = Number(classItem?.selectedCount || 0);
  const capacity = Number(classItem?.capacity || 0);
  return {
    course: {
      id: String(course.kchId),
      name: course.courseName,
      credit: course.creditValue,
      categoryId: String(category.id),
      classCount: course.classCount,
    },
    classItem: classItem ? {
      id: String(classItem.doJxbId || classItem.jxbId || ""),
      no: classItem.classNo,
      teacher: classItem.teacherName,
      time: classItem.sksj,
      location: classItem.location,
      selected,
      capacity,
      capacityLeft: Math.max(0, capacity - selected),
    } : null,
    teachers: [classItem?.teacherName, classItem?.teacherTitle].filter(Boolean),
    conflicts: classItem ? classConflicts(classItem) : false,
    has_capacity: classItem ? capacity > selected : true,
  };
}

function evalGrabExpression(expression, context) {
  const validation = validateGrabExpression(expression);
  if (!validation.ok) return false;
  try {
    const fn = Function("course", "classItem", "teachers", "conflicts", "has_capacity", `return Boolean(${validation.jsExpression});`);
    return fn(context.course, context.classItem, context.teachers, context.conflicts, context.has_capacity);
  } catch {
    return false;
  }
}

function openTreeMoreMenu(anchor, context) {
  const menu = document.createElement("div");
  menu.className = "floating-menu";
  menu.innerHTML = `<button type="button" data-action="grab">添加抢课任务</button>`;
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.right - 160)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.addEventListener("click", (event) => {
    if (event.target.dataset.action === "grab") openGrabModal(context);
    close();
  });
  window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
}

function openGrabModal(context) {
  state.grabDraft = context;
  document.getElementById("grab-title").textContent = `添加抢课任务 / ${context.type}`;
  setGrabExpressionValue(defaultGrabExpression(context));
  document.getElementById("grab-hints").textContent = `可用字段: ${grabSymbols.join(", ")}`;
  document.getElementById("grab-modal").classList.remove("hidden");
  if (state.grabEditor) state.grabEditor.layout();
  refreshGrabPreview().catch(showError);
}

function grabContextPayload(context) {
  return {
    type: context.type,
    categoryId: context.category?.id,
    kchId: context.course?.kchId,
    classNo: context.classItem?.classNo,
  };
}

function renderGrabPreviewTree(data) {
  const sections = [];
  const missingCourseLoads = data.missing.courseLoads || [];
  const missingClassLoads = data.missing.classLoads || [];
  if (missingCourseLoads.length || missingClassLoads.length) {
    sections.push('<div class="grab-preview-section">缺失数据</div>');
    for (const item of missingCourseLoads) {
      sections.push(`
        <div class="grab-preview-tree-row level-0 is-missing"><span class="tree-arrow">▸</span><span>大类 ${escapeHtml(item.name)}</span></div>
        <div class="grab-preview-tree-row level-1 is-missing"><span class="tree-arrow">·</span><span>需要加载全部课程分页</span></div>
      `);
    }
    const byCategory = new Map();
    for (const item of missingClassLoads) {
      const key = `${item.categoryId}`;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(item);
    }
    for (const [categoryId, items] of byCategory.entries()) {
      sections.push(`<div class="grab-preview-tree-row level-0 is-missing"><span class="tree-arrow">▾</span><span>大类 ${escapeHtml(categoryId)}</span></div>`);
      for (const item of items) {
        sections.push(`<div class="grab-preview-tree-row level-1 is-missing"><span class="tree-arrow">·</span><span>${escapeHtml(item.courseName)} <span class="dim">${escapeHtml(item.kchId)}</span> 需要加载教学班</span></div>`);
      }
    }
  }
  if (data.matches.length) {
    sections.push('<div class="grab-preview-section">匹配结果</div>');
    const byCategory = new Map();
    for (const item of data.matches) {
      const categoryId = String(item.category.id);
      if (!byCategory.has(categoryId)) byCategory.set(categoryId, { category: item.category, courses: new Map() });
      const categoryBucket = byCategory.get(categoryId);
      const courseId = String(item.course.kchId);
      if (!categoryBucket.courses.has(courseId)) categoryBucket.courses.set(courseId, { course: item.course, classes: [] });
      categoryBucket.courses.get(courseId).classes.push(item.classItem);
    }
    for (const categoryBucket of byCategory.values()) {
      sections.push(`<div class="grab-preview-tree-row level-0"><span class="tree-arrow">▾</span><span>${escapeHtml(categoryBucket.category.name)}</span></div>`);
      for (const courseBucket of categoryBucket.courses.values()) {
        sections.push(`<div class="grab-preview-tree-row level-1"><span class="tree-arrow">▾</span><span>${escapeHtml(courseBucket.course.courseName)} <span class="dim">${escapeHtml(courseBucket.course.kchId)}</span></span></div>`);
        for (const classItem of courseBucket.classes) {
          if (!classItem) {
            sections.push('<div class="grab-preview-tree-row level-2"><span class="tree-arrow">·</span><span class="dim">待加载教学班</span></div>');
            continue;
          }
          sections.push(`<div class="grab-preview-tree-row level-2"><span class="tree-arrow">·</span><span>${escapeHtml(classItem.classNo)} <span class="dim">${escapeHtml(classItem.teacherName || "-")} · ${escapeHtml(classItem.location || "-")} · ${escapeHtml(`${classItem.selectedCount}/${classItem.capacity}`)}</span></span></div>`);
        }
      }
    }
  }
  return sections.join("") || '<div class="dim grab-preview-empty">没有匹配项。</div>';
}

function closeGrabModal() {
  state.grabDraft = null;
  document.getElementById("grab-modal").classList.add("hidden");
}

function collectGrabPreviewCandidates(context) {
  const categories = context.type === "category" ? [context.category] : [context.category];
  const candidates = [];
  for (const category of categories) {
    const courses = context.type === "category" ? (state.categoryCourses[category.id]?.courses || []) : [context.course];
    for (const course of courses) {
      const key = `${category.id}:${course.kchId}`;
      const classes = context.type === "class" ? [context.classItem] : (state.courseClasses[key] || []);
      if (!classes.length) candidates.push({ category, course, classItem: null });
      for (const classItem of classes) candidates.push({ category, course, classItem });
    }
  }
  return candidates;
}

async function refreshGrabPreview() {
  const expression = getGrabExpressionValue().trim();
  const status = document.getElementById("grab-status");
  const preview = document.getElementById("grab-preview-list");
  const validation = validateGrabExpression(expression || "true");
  if (!validation.ok) {
    status.textContent = `语法错误: ${validation.error}`;
    status.className = "grab-status is-error";
    preview.innerHTML = "";
    return;
  }
  const data = await apiPost("/api/grab/preview", { context: grabContextPayload(state.grabDraft), expression: expression || "True" });
  const candidateCourseText = data.ready ? String(data.candidateCourseCount || 0) : "?";
  const candidateClassText = data.ready ? String(data.candidateClassCount || 0) : "?";
  const requestText = data.ready ? String(data.estimatedRequestsPerTick || 0) : "?";
  status.textContent = `语法正确，匹配 ${data.matches.length} 项，候选课程 ${candidateCourseText} 门，候选教学班 ${candidateClassText} 个，预计每轮扫描 ${requestText} 个请求`;
  status.className = "grab-status is-ok";
  const loadButton = data.ready ? "" : '<button type="button" id="grab-load-missing" class="grab-load-missing">加载缺失数据</button>';
  preview.innerHTML = `${loadButton}${renderGrabPreviewTree(data)}`;
  const button = document.getElementById("grab-load-missing");
  if (button) {
    button.addEventListener("click", () => loadGrabMissing(data.missing).catch(showError));
  }
}

async function loadGrabMissing(missing) {
  upsertActivity("grab-preview-load", { name: "加载抢课预览缺失数据", status: "运行中", progress: "加载中" });
  const result = await apiPost("/api/grab/load-missing", { missing });
  applyTreeState(result.tree);
  renderTree();
  upsertActivity("grab-preview-load", { name: "加载抢课预览缺失数据", status: "完成", progress: "已同步课程树" });
  await refreshGrabPreview();
}

async function confirmGrabExpression() {
  await refreshGrabPreview();
  const startMode = document.getElementById("grab-start-mode").value;
  const startAtValue = document.getElementById("grab-start-at").value;
  const result = await apiPost("/api/grab/tasks", {
    context: grabContextPayload(state.grabDraft),
    expression: getGrabExpressionValue().trim() || "True",
    startMode,
    startAt: startMode === "scheduled" && startAtValue ? new Date(startAtValue).toISOString() : null,
    tickInterval: Number(document.getElementById("grab-tick-interval").value || 3),
    timeoutSeconds: Number(document.getElementById("grab-timeout").value || 600),
    stopOnFirstSuccess: document.getElementById("grab-stop-success").checked,
    errorPolicy: document.getElementById("grab-error-policy").value,
  });
  const task = result.task;
  upsertActivity(task.id, {
    name: task.name,
    status: task.status,
    progress: `${task.progress} / ${task.candidateCourseCount}门课程 ${task.candidateClassCount}个教学班`,
  });
  closeGrabModal();
}

async function pollGrabTasks() {
  try {
    const data = await apiGet("/api/grab/tasks");
    const hasActiveTask = (data.items || []).some((task) => task.status === "running");
    for (const task of data.items || []) {
      state.grabTasks[task.id] = task;
      upsertActivity(task.id, {
        name: task.name,
        status: task.status,
        progress: `${task.progress} / tick ${task.tickCount} / 成功 ${task.successCount}`,
      });
    }
    if (hasActiveTask) await syncTreeState();
  } catch (error) {
    console.error(error);
  } finally {
    window.setTimeout(pollGrabTasks, 2000);
  }
}

function openActivityTaskMenu(taskId, anchor) {
  const task = state.grabTasks[taskId];
  if (!task) return;
  const menu = document.createElement("div");
  menu.className = "floating-menu";
  menu.innerHTML = `
    <button type="button" data-action="detail">详情</button>
    <button type="button" data-action="start">启动</button>
    <button type="button" data-action="stop">停止</button>
  `;
  const rect = anchor.getBoundingClientRect();
  menu.style.left = `${Math.max(8, rect.right - 132)}px`;
  menu.style.top = `${rect.bottom + 4}px`;
  document.body.appendChild(menu);
  const close = () => menu.remove();
  menu.addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (action === "detail") showGrabTaskDetail(task);
    if (action === "start") apiPost("/api/grab/tasks/start", { id: taskId }).then(pollGrabTasks).catch(showError);
    if (action === "stop") apiPost("/api/grab/tasks/stop", { id: taskId }).then(pollGrabTasks).catch(showError);
    close();
  });
  window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
}

function showGrabTaskDetail(task) {
  document.getElementById("task-title").textContent = `${task.name} / ${task.id}`;
  document.getElementById("task-content").innerHTML = `
    <div class="class-meta"><div>状态</div><div>${escapeHtml(task.status)}</div></div>
    <div class="class-meta"><div>进度</div><div>${escapeHtml(task.progress)}</div></div>
    <div class="class-meta"><div>表达式</div><div><code>${escapeHtml(task.expression || "")}</code></div></div>
    <div class="class-meta"><div>启动</div><div>${escapeHtml(task.startMode || "")} ${task.startAt ? new Date(task.startAt * 1000).toLocaleString() : ""}</div></div>
    <div class="class-meta"><div>Tick/Timeout</div><div>${escapeHtml(task.tickInterval)}s / ${escapeHtml(task.timeoutSeconds)}s</div></div>
    <div class="class-meta"><div>错误处理</div><div>${escapeHtml(task.errorPolicy || "")}</div></div>
    <div class="class-meta"><div>停止条件</div><div>${task.stopOnFirstSuccess ? "成功选到课程后停止" : "不自动停止"}</div></div>
    <div class="class-meta"><div>候选</div><div>${escapeHtml(task.candidateCourseCount)} 门课程 / ${escapeHtml(task.candidateClassCount)} 个教学班</div></div>
    <div class="class-meta"><div>最近错误</div><div>${escapeHtml(task.lastError || "-")}</div></div>
    <div class="class-meta"><div>最近结果</div><div>${escapeHtml(task.lastResult || "-")}</div></div>
    <div class="class-meta"><div>事件</div><div>${(task.events || []).map((item) => `${escapeHtml(item.time)} ${escapeHtml(item.message)}`).join("<br>") || "-"}</div></div>
  `;
  document.getElementById("task-modal").classList.remove("hidden");
}

async function withdrawSelectedEntry(entry) {
  const result = await apiPost("/api/withdraw", { kchId: entry.kchId, doJxbId: entry.doJxbId });
  state.timetable = result.timetable;
  renderTimetable();
  renderTimetableDetailAll();
  renderTree();
}

function openClassModal(categoryId, course, item) {
  state.modalClass = { categoryId, course, item };
  document.getElementById("modal-title").textContent = `${course.courseName} / ${item.classNo}`;
  document.getElementById("modal-content").innerHTML = `
    <div class="class-meta"><div>教学班</div><div>${escapeHtml(item.classNo)}</div></div>
    <div class="class-meta"><div>上课教师</div><div>${escapeHtml(item.teacherName || "")} <span class="dim">${escapeHtml(item.teacherTitle || "")}</span></div></div>
    <div class="class-meta"><div>上课时间</div><div>${escapeHtml(item.sksj || "")}</div></div>
    <div class="class-meta"><div>教学地点</div><div>${escapeHtml(item.location || "")}</div></div>
    <div class="class-meta"><div>开课学院</div><div>${escapeHtml(item.academy || "-")}</div></div>
    <div class="class-meta"><div>选课备注</div><div>${escapeHtml(item.remark || "-")}</div></div>
    <div class="class-meta"><div>课程性质</div><div>${escapeHtml(item.courseProperty || "-")}</div></div>
    <div class="class-meta"><div>已选/容量</div><div>${escapeHtml(`${item.selectedCount}/${item.capacity}`)}</div></div>
  `;
  document.getElementById("modal-action").textContent = isSelectedClass(item) ? "退课" : "选课";
  document.getElementById("class-modal").classList.remove("hidden");
}

function closeClassModal() {
  state.modalClass = null;
  document.getElementById("class-modal").classList.add("hidden");
}

async function executeModalAction() {
  if (!state.modalClass) return;
  if (state.modalClass.entry) {
    await withdrawSelectedEntry(state.modalClass.entry);
    closeClassModal();
    return;
  }
  const { categoryId, course, item } = state.modalClass;
  try {
    const payload = isSelectedClass(item)
      ? { kchId: item.kchId, doJxbId: item.doJxbId }
      : { categoryId, kchId: item.kchId, doJxbId: item.doJxbId, courseName: course.courseName };
    const result = await apiPost(isSelectedClass(item) ? "/api/withdraw" : "/api/choose", payload);
    state.timetable = result.timetable;
    renderTimetable();
    renderTimetableDetailAll();
    renderTree();
    closeClassModal();
  } catch (error) {
    showError(error);
  }
}

function renderLogs(items) {
  const list = document.getElementById("log-list");
  const shouldStickToBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  for (const item of items) {
    const line = document.createElement("div");
    line.className = "log-line";
    const timestamp = document.createElement("span");
    timestamp.className = "log-time";
    timestamp.textContent = `[${item.timestamp}]`;
    const message = document.createElement("span");
    message.className = "log-message";
    message.textContent = item.message;
    line.append(timestamp, message);
    list.appendChild(line);
    state.logSince = Math.max(state.logSince, item.id);
  }
  if (shouldStickToBottom || items.length) {
    list.scrollTop = list.scrollHeight;
  }
}

async function pollLogs() {
  try {
    const data = await apiGet(`/api/logs?since=${state.logSince}`);
    renderLogs(data.items || []);
  } catch (error) {
    console.error(error);
  } finally {
    window.setTimeout(pollLogs, 1500);
  }
}

function showError(error) {
  console.error(error);
  alert(error.message || String(error));
}

function bindEvents() {
  document.getElementById("login-button").addEventListener("click", () => doLogin().catch(showError));
  document.getElementById("saved-login-button").addEventListener("click", () => doLogin(true).catch(showError));
  document.getElementById("base-url").addEventListener("change", syncCustomAddressInput);
  document.getElementById("test-addresses").addEventListener("click", () => testLoginAddresses().catch(showError));
  document.getElementById("disable-ssl-verify").addEventListener("change", () => updateSslVerifySetting().catch(showError));
  document.getElementById("speed-close").addEventListener("click", () => {
    document.getElementById("speed-modal").classList.add("hidden");
  });
  document.getElementById("display-menu-button").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("display-menu");
  });
  document.getElementById("feature-menu-button").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu("feature-menu");
  });
  document.getElementById("display-menu").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    runDisplayAction(action);
    closeMenus();
  });
  document.getElementById("feature-menu").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    runFeatureAction(action);
    closeMenus();
  });
  document.addEventListener("click", closeMenus);
  document.getElementById("toggle-sidebar").textContent = state.sidebarCollapsed ? "⇥" : "⇤";
  document.getElementById("toggle-sidebar").addEventListener("click", toggleSidebar);
  document.getElementById("course-search").addEventListener("input", () => {
    state.search.query = document.getElementById("course-search").value;
  });
  document.getElementById("course-search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") applyLocalSearch();
  });
  document.getElementById("search-scope").addEventListener("change", applyLocalSearch);
  document.getElementById("local-search").addEventListener("click", applyLocalSearch);
  document.getElementById("remote-search").addEventListener("click", () => {
    applyLocalSearch();
    const categoryIds = state.search.scope === "all" ? state.categories.map((item) => item.id) : [state.search.scope];
    for (const categoryId of categoryIds) {
      if (!state.categoryCourses[categoryId]?.loaded) {
        state.expandedCategories.add(categoryId);
        loadCategoryCourses(categoryId, 1).catch(showError);
      }
    }
  });
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });
  document.getElementById("week-prev").addEventListener("click", () => {
    state.displayWeek = Math.max(1, state.displayWeek - 1);
    renderTimetable();
  });
  document.getElementById("week-next").addEventListener("click", () => {
    state.displayWeek = Math.min(maxWeek, state.displayWeek + 1);
    renderTimetable();
  });
  document.getElementById("week-refresh").addEventListener("click", () => refreshTimetable().catch(showError));
  document.getElementById("modal-close").addEventListener("click", closeClassModal);
  document.getElementById("modal-action").addEventListener("click", () => executeModalAction().catch(showError));
  document.getElementById("grab-close").addEventListener("click", closeGrabModal);
  document.getElementById("grab-expression").addEventListener("input", () => refreshGrabPreview().catch(showError));
  document.getElementById("grab-preview-refresh").addEventListener("click", () => refreshGrabPreview().catch(showError));
  document.getElementById("grab-confirm").addEventListener("click", () => confirmGrabExpression().catch(showError));
  document.getElementById("grab-start-mode").addEventListener("change", (event) => {
    document.getElementById("grab-start-at").disabled = event.target.value !== "scheduled";
  });
  document.getElementById("task-close").addEventListener("click", () => {
    document.getElementById("task-modal").classList.add("hidden");
  });
  document.getElementById("workspace-base-url").addEventListener("change", (event) => {
    document.getElementById("base-url").value = event.target.value;
    if (state.bootstrap) {
      state.bootstrap.baseUrl = event.target.value;
    }
  });
  document.getElementById("account-action").addEventListener("change", (event) => {
    const action = event.target.value;
    event.target.value = "";
    if (action === "show-login") {
      setLoginBaseUrl(document.getElementById("workspace-base-url").value);
      document.getElementById("login-overlay").classList.remove("hidden");
      return;
    }
    if (action === "refresh-categories") {
      refreshCategories(true).catch(showError);
      return;
    }
    if (action === "refresh-timetable") {
      refreshTimetable().catch(showError);
    }
  });
  document.getElementById("clear-logs").addEventListener("click", () => {
    apiPostEmpty("/api/logs/clear")
      .then(() => {
        document.getElementById("log-list").innerHTML = "";
        state.logSince = 0;
      })
      .catch(showError);
  });
}

async function main() {
  mountSolidRoot();
  applyStoredLayout();
  bindEvents();
  bindSplitters();
  initGrabMonaco();
  setFilterStatus();
  renderActivities();
  await loadBootstrap();
  updateAuthStatus();
  constrainLayoutVars();
  pollLogs();
  pollGrabTasks();
}

main().catch(showError);
