import { apiPost } from "../../api/client.js";
import { isSelectedClass } from "../../app/state.js";
import { maxJieci, maxWeek, weekdayNames } from "../../shared/constants.js";
import { escapeHtml, formatWeekRanges } from "../../shared/utils.js";

export function createTimetableFeature({ state, getApp }) {
  function entriesForCell(day, jieci) {
    const items = [];
    for (const entry of state.timetable.entries) {
      for (const [week, slotDay, slotJieci] of entry.slots || []) {
        if (slotDay === day && slotJieci === jieci) items.push({ week, entry });
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
      detail.innerHTML = '<div class="dim">暂无已选课程</div>';
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
    const app = getApp();
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
      if (action === "withdraw") withdrawSelectedEntry(entry).catch(app.showError);
      close();
    });
    window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
  }

  async function withdrawSelectedEntry(entry) {
    const app = getApp();
    const result = await apiPost("/api/withdraw", { kchId: entry.kchId, doJxbId: entry.doJxbId });
    if (!result.ok) throw new Error(result.message || "退课失败");
    state.timetable = result.timetable;
    renderTimetable();
    renderTimetableDetailAll();
    app.tree.renderTree();
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
    const app = getApp();
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
      if (!result.ok) throw new Error(result.message || (isSelectedClass(item) ? "退课失败" : "选课失败"));
      state.timetable = result.timetable;
      renderTimetable();
      renderTimetableDetailAll();
      app.tree.renderTree();
      closeClassModal();
    } catch (error) {
      app.showError(error);
    }
  }

  return {
    renderTimetable,
    renderTimetableDetailAll,
    renderTimetableCellDetail,
    openSelectedCourseMenu,
    withdrawSelectedEntry,
    openClassModal,
    closeClassModal,
    executeModalAction,
  };
}
