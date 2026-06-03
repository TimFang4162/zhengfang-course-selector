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
};

const weekdayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const maxWeek = 19;
const maxJieci = 13;
const LEFT_WIDTH_KEY = "jwxt.leftPaneWidth";
const DETAIL_HEIGHT_KEY = "jwxt.detailHeight";

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

function applyStoredLayout() {
  const storedLeftWidth = Number(window.localStorage.getItem(LEFT_WIDTH_KEY) || 0);
  const storedDetailHeight = Number(window.localStorage.getItem(DETAIL_HEIGHT_KEY) || 0);
  if (storedLeftWidth > 0) {
    document.documentElement.style.setProperty("--left-pane-width", `${storedLeftWidth}px`);
  }
  if (storedDetailHeight > 0) {
    document.documentElement.style.setProperty("--detail-height", `${storedDetailHeight}px`);
  }
}

function constrainLayoutVars() {
  const mainLayout = document.querySelector(".main-layout");
  const timetablePanel = document.getElementById("tab-timetable");
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
}

function bindSplitters() {
  const mainSplitter = document.getElementById("main-splitter");
  const detailSplitter = document.getElementById("detail-splitter");

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
  const parts = [];
  if (state.filters.conflict) parts.push("冲突过滤:开");
  if (state.filters.credit) parts.push(`学分过滤:开(${remainingCredit()})`);
  document.getElementById("filter-status").textContent = parts.join(" | ");
  document.getElementById("filter-conflict").textContent = `冲突筛选:${state.filters.conflict ? "开" : "关"}`;
  document.getElementById("filter-credit").textContent = `学分筛选:${state.filters.credit ? "开" : "关"}`;
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
  const savedHint = document.getElementById("saved-hint");
  savedHint.textContent = state.bootstrap.savedCredentials.available
    ? `已保存: ${state.bootstrap.savedCredentials.masked}`
    : "无已保存凭据";
  document.getElementById("student-number").value = state.bootstrap.savedCredentials.studentNumber || "";
  if (state.bootstrap.authenticated) {
    state.categories = state.bootstrap.categories?.items || [];
    state.timetable = state.bootstrap.timetable || state.timetable;
    document.getElementById("login-overlay").classList.add("hidden");
    setFilterStatus();
    renderTree();
    renderTimetable();
    renderTimetableDetailAll();
  }
}

async function doLogin() {
  setLoginStatus("登录中...");
  try {
    const payload = {
      baseUrl: document.getElementById("base-url").value,
      useSaved: document.getElementById("use-saved").checked,
      studentNumber: document.getElementById("student-number").value.trim(),
      password: document.getElementById("password").value,
      saveCredentials: document.getElementById("save-creds").checked,
    };
    const result = await apiPost("/api/login", payload);
    if (!result.ok) throw new Error(result.message || "登录失败");
    state.categories = result.categories.items;
    state.timetable = result.timetable;
    state.bootstrap.baseUrl = document.getElementById("base-url").value;
    document.getElementById("login-overlay").classList.add("hidden");
    updateAuthStatus();
    setFilterStatus();
    renderTree();
    renderTimetable();
    renderTimetableDetailAll();
    setLoginStatus("");
  } catch (error) {
    setLoginStatus(error.message);
  }
}

async function refreshCategories(force = false) {
  const data = await apiGet(`/api/categories${force ? "?refresh=1" : ""}`);
  state.categories = data.items;
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
  renderTree();
}

async function loadCourseClasses(categoryId, kchId) {
  const loadingKey = `${categoryId}:${kchId}`;
  state.loadingCourses.add(loadingKey);
  renderTree();
  const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(kchId)}`);
  state.courseClasses[`${categoryId}:${kchId}`] = data.classes;
  state.loadingCourses.delete(loadingKey);
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
  text.textContent = label;
  row.append(arrow, text);
  row.addEventListener("click", onClick);
  return row;
}

function classSummary(item) {
  const teacher = item.teacherTitle ? `${item.teacherName}/${item.teacherTitle}` : item.teacherName || "未标注教师";
  const timeLoc = item.location ? `${item.sksj} @ ${item.location}` : item.sksj;
  const countText = `${item.selectedCount}/${item.capacity}`;
  return `${item.index}. ${item.classNo} | ${teacher} | ${timeLoc} | ${item.courseProperty} | ${countText}`;
}

function renderTree() {
  const root = document.getElementById("course-tree");
  root.innerHTML = "";
  for (const category of state.categories) {
    const bucket = state.categoryCourses[category.id];
    const courses = bucket?.courses || [];
    const categoryLoading = state.loadingCategories.has(category.id);
    const categoryMuted = courses.length > 0 && courses.every((course) => courseMuted(category.id, course));
    const label = `${category.name} (${courses.length}${bucket?.hasMore ? "+" : ""})`;
    const categoryRow = makeTreeRow({
      level: 0,
      label,
      muted: categoryMuted,
      expandable: true,
      expanded: state.expandedCategories.has(category.id),
      onClick: () => toggleCategory(category.id),
    });
    root.appendChild(categoryRow);
    if (!state.expandedCategories.has(category.id)) continue;
    const children = document.createElement("div");
    children.className = "tree-children";
    if (categoryLoading) {
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
      for (const course of courses) {
        const courseKey = `${category.id}:${course.kchId}`;
        const labelText = `${course.courseName} [${course.kchId}]${course.creditText ? ` ${course.creditText}学分` : ""} ${course.classCount}教学班`;
        const courseRow = makeTreeRow({
          level: 1,
          label: isSelectedCourse(course) ? `${labelText} (已选)` : labelText,
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
          for (const item of classItems) {
            const row = makeTreeRow({
              level: 2,
              label: classSummary(item),
              selected: isSelectedClass(item),
              muted: classMuted(course, item),
              onClick: () => openClassModal(category.id, course, item),
            });
            classChildren.appendChild(row);
          }
        }
        children.appendChild(classChildren);
      }
      if (bucket?.hasMore) {
        const more = document.createElement("button");
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
      const currentWeekNames = [];
      const otherWeekNames = [];
      for (const { week, entry } of entriesForCell(day, jieci)) {
        if (week === state.displayWeek) currentWeekNames.push(entry.name);
        else otherWeekNames.push(entry.name);
      }
      if (currentWeekNames.length) {
        td.textContent = currentWeekNames.join("\n");
        count += currentWeekNames.length;
      } else if (otherWeekNames.length) {
        const dim = document.createElement("div");
        dim.className = "cell-dim";
        dim.textContent = otherWeekNames.slice(0, 2).join("、");
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
  const rows = state.timetable.entries.map((entry) => `
    <tr>
      <td>${escapeHtml(entry.name)}<br><span class="dim">${escapeHtml([entry.kchId, entry.classNo].filter(Boolean).join("/"))}</span></td>
      <td>${escapeHtml(entry.creditText || "")}</td>
      <td>${escapeHtml(entry.teacherName || "")}<br><span class="dim">${escapeHtml(entry.teacherTitle || "")}</span></td>
      <td>${escapeHtml(entry.sksj || "")}</td>
      <td>${escapeHtml(entry.location || "")}</td>
    </tr>
  `).join("");
  detail.innerHTML = `
    <table class="detail-table">
      <thead><tr><th>名称</th><th>学分</th><th>教师</th><th>时间</th><th>地点</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
    line.textContent = `[${item.timestamp}] ${item.message}`;
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
  document.getElementById("filter-conflict").addEventListener("click", () => {
    state.filters.conflict = !state.filters.conflict;
    setFilterStatus();
    renderTree();
  });
  document.getElementById("filter-credit").addEventListener("click", () => {
    state.filters.credit = !state.filters.credit;
    setFilterStatus();
    renderTree();
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
      document.getElementById("base-url").value = document.getElementById("workspace-base-url").value;
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
  applyStoredLayout();
  bindEvents();
  bindSplitters();
  setFilterStatus();
  await loadBootstrap();
  updateAuthStatus();
  constrainLayoutVars();
  pollLogs();
}

main().catch(showError);
