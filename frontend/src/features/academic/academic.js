import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { apiGet } from "../../api/client.js";
import { downloadJson, escapeHtml } from "../../shared/utils.js";

export function createAcademicFeature({ state }) {
  function initRawContentMonaco() {
    const root = document.getElementById("academic-raw-content");
    if (!root || state.rawContentEditor) return;
    state.rawContentEditor = monaco.editor.create(root, {
      value: "",
      language: "html",
      theme: "vs-dark",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      readOnly: true,
      fontSize: 13,
      wordWrap: "on",
    });
  }

  function setRawContentValue(value, language) {
    initRawContentMonaco();
    if (!state.rawContentEditor) return;
    const model = state.rawContentEditor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
      state.rawContentEditor.setValue(value || "");
    }
    state.rawContentMode = language;
  }

  function academicCreditSummary(nodes) {
    const root = (nodes || [])[0];
    if (!root) return { plan: "暂无学业情况", earned: "0.0", required: "-", remaining: "-" };
    const earned = root.earnedCredit || "0.0";
    const required = root.requiredCredit || "-";
    const remaining = Number.isFinite(Number(required)) && Number.isFinite(Number(earned)) ? Math.max(0, Number(required) - Number(earned)).toFixed(1) : "-";
    return { plan: root.name || "-", earned, required, remaining };
  }

  function filteredAcademicCourses(courses) {
    const { suggestedTerm, statusType, courseNature } = state.academicFilters;
    return (courses || []).filter((course) => {
      const termKey = [course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ");
      if (suggestedTerm !== "all" && termKey !== suggestedTerm) return false;
      if (statusType !== "all" && String(course.statusType || "") !== statusType) return false;
      if (courseNature !== "all" && String(course.courseNature || "").trim() !== courseNature) return false;
      return true;
    });
  }

  function academicFilterTerms(nodes) {
    const terms = new Set();
    const walk = (items) => {
      for (const item of items || []) {
        for (const course of item.courses || []) {
          const value = [course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ");
          if (value) terms.add(value);
        }
        walk(item.children || []);
      }
    };
    walk(nodes || []);
    return [...terms].filter(Boolean).sort();
  }

  function academicFilterNatures(nodes) {
    const natures = new Set();
    const walk = (items) => {
      for (const item of items || []) {
        for (const course of item.courses || []) {
          if (course.courseNature) natures.add(String(course.courseNature).trim());
        }
        walk(item.children || []);
      }
    };
    walk(nodes || []);
    return [...natures].filter(Boolean).sort();
  }

  function syncAcademicFilterOptions(nodes) {
    const select = document.getElementById("academic-filter-term");
    const natureSelect = document.getElementById("academic-filter-nature");
    if (!select || !natureSelect) return;
    const terms = academicFilterTerms(nodes);
    const previous = state.academicFilters.suggestedTerm;
    select.innerHTML = '<option value="all">全部时间</option>';
    for (const term of terms) {
      const option = document.createElement("option");
      option.value = term;
      option.textContent = term;
      select.appendChild(option);
    }
    select.value = [...select.options].some((option) => option.value === previous) ? previous : "all";
    state.academicFilters.suggestedTerm = select.value;

    const natures = academicFilterNatures(nodes);
    const previousNature = state.academicFilters.courseNature;
    natureSelect.innerHTML = '<option value="all">全部性质</option>';
    for (const nature of natures) {
      const option = document.createElement("option");
      option.value = nature;
      option.textContent = nature;
      natureSelect.appendChild(option);
    }
    natureSelect.value = [...natureSelect.options].some((option) => option.value === previousNature) ? previousNature : "all";
    state.academicFilters.courseNature = natureSelect.value;
  }

  function academicNodeMatchesStatus(node) {
    return state.academicFilters.nodeStatus === "all" || String(node.creditStatus || "") === state.academicFilters.nodeStatus;
  }

  function updateAcademicFilterButton() {
    const button = document.getElementById("academic-filter-button");
    if (!button) return;
    let count = 0;
    if (state.academicFilters.suggestedTerm !== "all") count += 1;
    if (state.academicFilters.statusType !== "all") count += 1;
    if (state.academicFilters.courseNature !== "all") count += 1;
    if (state.academicFilters.nodeStatus !== "all") count += 1;
    button.textContent = count > 0 ? `筛选(${count})` : "筛选";
  }

  function academicNodeHasVisibleContent(node) {
    if (!academicNodeMatchesStatus(node)) return false;
    const visibleCourses = filteredAcademicCourses(node.courses || []);
    if (visibleCourses.length) return true;
    return (node.children || []).some((child) => academicNodeHasVisibleContent(child));
  }

  function academicBadgeClass(type) {
    return `academic-badge is-${type || "unknown"}`;
  }

  function renderAcademicCourseStatus(course) {
    return `<span class="${academicBadgeClass(course.statusType)}">${escapeHtml(course.status || "-")}</span>`;
  }

  function renderAcademicNodeBadges(node) {
    const badges = [`<span class="${academicBadgeClass(node.creditStatus)}">${escapeHtml(node.creditStatusText || "未知")}</span>`];
    if (node.substituteStatus && node.substituteStatus !== "none") {
      badges.push(`<span class="${academicBadgeClass("substitute")}">${escapeHtml(node.substituteStatusText || "课程替代")}</span>`);
    }
    return badges.join("");
  }

  function renderAcademicCourses(courses) {
    const filtered = filteredAcademicCourses(courses);
    if (!filtered.length) return '<div class="academic-empty dim">当前筛选下暂无课程明细</div>';
    return `
      <table class="academic-course-table">
        <thead><tr><th>课程</th><th>学分</th><th>状态</th><th>成绩</th><th>学时</th><th>课程性质</th><th>建议修读</th><th>课程类别</th></tr></thead>
        <tbody>
          ${filtered.map((course) => `
            <tr class=" is-${course.statusType || "unknown"}">
              <td>${escapeHtml(course.name)}<br><span class="dim">${escapeHtml(course.kch || course.kchId)}</span></td>
              <td>${escapeHtml(course.creditText || "-")}</td>
              <td>${renderAcademicCourseStatus(course)}</td>
              <td>${escapeHtml(course.score || course.maxScore || "-")}</td>
              <td>${escapeHtml(course.hoursText || "-")}</td>
              <td>${escapeHtml(course.courseNature || "-")}</td>
              <td>${escapeHtml([course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ") || "-")}</td>
              <td>${escapeHtml(course.courseCategory || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderAcademicNode(node, level = 0) {
    const children = (node.children || []).filter((child) => academicNodeHasVisibleContent(child));
    const courses = filteredAcademicCourses(node.courses || []);
    if (!children.length && !courses.length) return "";
    const courseCount = courses.length;
    const passedCount = courses.filter((course) => course.statusType === "passed" || course.statusType === "substituted").length;
    const required = Number(node.requiredCredit);
    const earned = Number(node.earnedCredit || 0);
    const width = Number.isFinite(required) && required > 0 ? Math.min(100, (earned / required) * 100) : 0;
    const open = level <= 1 ? "open" : "";
    return `
      <details class="academic-node level-${level}" ${open}>
        <summary>
          <span class="tree-arrow">▸</span>
          <span class="academic-node-title">${escapeHtml(node.name)}</span>
          <span class="academic-node-credit">${escapeHtml(node.earnedCredit || "0.0")}/${escapeHtml(node.requiredCredit || "-")} 学分</span>
          <span class="academic-node-state">${renderAcademicNodeBadges(node)}</span>
          <span class="academic-node-count">${children.length ? `${children.length} 子项` : `${passedCount}/${courseCount || "-"} 课程`}</span>
        </summary>
        <div class="academic-progress is-${node.creditStatus || "unknown"}"><span style="width:${width}%"></span></div>
        <div class="academic-children">
          ${children.map((child) => renderAcademicNode(child, level + 1)).join("")}
          ${children.length ? "" : renderAcademicCourses(courses)}
        </div>
      </details>
    `;
  }

  function renderAcademicStatus() {
    const root = document.getElementById("academic-status");
    if (!root) return;
    updateAcademicFilterButton();
    if (state.academicLoading) {
      root.innerHTML = '<div class="academic-empty dim">正在拉取学业情况和课程明细...</div>';
      return;
    }
    const nodes = state.academicStatus?.nodes || [];
    syncAcademicFilterOptions(nodes);
    if (!nodes.length) {
      root.innerHTML = '<div class="academic-empty dim">暂无学业情况数据，点击刷新重新获取。</div>';
      return;
    }
    const summary = academicCreditSummary(nodes);
    const visibleNodes = nodes.filter((node) => academicNodeHasVisibleContent(node));
    const serverGpa = state.academicStatus?.summary?.serverGpa || "-";
    const serverSummary = state.academicStatus?.summary || {};
    root.innerHTML = `
      <div class="academic-overview">
        <div><span class="dim">方案</span><strong>${escapeHtml(summary.plan)}</strong></div>
        <div><span class="dim">学分</span><strong>${escapeHtml(summary.earned)}/${escapeHtml(summary.required)}</strong></div>
        <div><span class="dim">未获</span><strong>${escapeHtml(summary.remaining)}</strong></div>
        <div><span class="dim">GPA</span><strong>${escapeHtml(serverGpa)}</strong></div>
        <div><span class="dim">计划课程</span><strong>${escapeHtml(serverSummary.planPassedCourses ?? 0)}/${escapeHtml(serverSummary.planTotalCourses ?? 0)}</strong></div>
        <div><span class="dim">未修/在读</span><strong>${escapeHtml(serverSummary.planUnstartedCourses ?? 0)}/${escapeHtml(serverSummary.planStudyingCourses ?? 0)}</strong></div>
      </div>
      <div class="academic-tree">
        <div class="academic-tree-head">
          <span></span><span>学分要求节点</span><span>学分</span><span>状态</span><span>明细</span>
        </div>
        ${visibleNodes.map((node) => renderAcademicNode(node)).join("") || '<div class="academic-empty dim">当前筛选下没有匹配课程。</div>'}
      </div>
    `;
  }

  async function refreshAcademicStatus(force = false) {
    state.academicLoading = true;
    renderAcademicStatus();
    try {
      state.academicStatus = await apiGet(`/api/academic-status${force ? "?refresh=1" : ""}`);
    } finally {
      state.academicLoading = false;
    }
    renderAcademicStatus();
  }

  function showAcademicRawPage() {
    const raw = state.academicStatus?.rawHtml || "";
    document.getElementById("academic-raw-title").textContent = "教务原始网页";
    document.querySelector('[data-raw-tab="preview"]').classList.remove("hidden");
    document.getElementById("academic-raw-preview").srcdoc = raw || "<div>暂无原始网页内容</div>";
    setRawContentValue(raw || "暂无原始网页内容", "html");
    switchAcademicRawTab("preview");
    document.getElementById("academic-raw-modal").classList.remove("hidden");
  }

  function showAcademicDetailJson() {
    const raw = state.academicStatus?.rawDetailJson || [];
    document.getElementById("academic-raw-title").textContent = "学业明细原始 JSON";
    document.querySelector('[data-raw-tab="preview"]').classList.add("hidden");
    setRawContentValue(JSON.stringify(raw, null, 2) || "[]", "json");
    switchAcademicRawTab("source");
    document.getElementById("academic-raw-modal").classList.remove("hidden");
  }

  function exportAcademicDataJson() {
    downloadJson(`academic-status-${new Date().toISOString().replaceAll(":", "-")}.json`, state.academicStatus || {});
  }

  function switchAcademicRawTab(tab) {
    document.querySelectorAll("[data-raw-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.rawTab === tab);
    });
    document.getElementById("academic-raw-preview").classList.toggle("hidden", tab !== "preview");
    document.getElementById("academic-raw-content").classList.toggle("hidden", tab !== "source");
    if (state.rawContentEditor) state.rawContentEditor.layout();
  }

  return {
    renderAcademicStatus,
    refreshAcademicStatus,
    showAcademicRawPage,
    showAcademicDetailJson,
    exportAcademicDataJson,
    switchAcademicRawTab,
  };
}
