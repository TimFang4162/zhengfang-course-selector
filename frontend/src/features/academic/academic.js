import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { ref } from "valtio";
import { apiGet } from "../../api/client.js";
import { downloadJson } from "../../shared/utils.js";
import { academicFilterNatures, academicFilterTerms } from "./filters.js";

export function createAcademicFeature({ state }) {
  function initRawContentMonaco() {
    const root = document.getElementById("academic-raw-content");
    if (!root || state.rawContentEditor) return;
    state.rawContentEditor = ref(monaco.editor.create(root, {
      value: "",
      language: "html",
      theme: "vs-dark",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      readOnly: true,
      fontSize: 13,
      wordWrap: "on",
    }));
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

  function renderAcademicStatus() {
    state.academicVersion += 1;
  }

  function syncAcademicFilterOptions() {
    const nodes = state.academicStatus?.nodes || [];
    const nc = state.academicNodeCourses;
    if (state.academicFilters.suggestedTerm !== "all" && !academicFilterTerms(nodes, nc).includes(state.academicFilters.suggestedTerm)) {
      state.academicFilters.suggestedTerm = "all";
    }
    if (state.academicFilters.courseNature !== "all" && !academicFilterNatures(nodes, nc).includes(state.academicFilters.courseNature)) {
      state.academicFilters.courseNature = "all";
    }
  }

  function collectLeafCourses(nodes) {
    const map = {};
    (function walk(list) {
      for (const n of list) {
        if (n.courses && n.courses.length) map[n.id] = n.courses;
        if (n.children) walk(n.children);
      }
    })(nodes || []);
    return map;
  }

  async function refreshAcademicStatus(force = false, full = false) {
    state.academicLoading = true;
    state.academicNodeCourses = {};
    renderAcademicStatus();
    try {
      const q = force ? "?refresh=1" : "";
      const treeOnly = full ? "&tree_only=0" : "";
      state.academicStatus = await apiGet(`/api/academic-status${q}${treeOnly}`);
      state.academicNodeCourses = collectLeafCourses(state.academicStatus?.nodes);
      syncAcademicFilterOptions();
    } finally {
      state.academicLoading = false;
    }
    renderAcademicStatus();
  }

  async function loadAcademicNodeCourses(nodeId, force = false) {
    if (!force && state.academicNodeCourses[nodeId]?.__loading) return;
    state.academicNodeCourses[nodeId] = { __loading: true };
    renderAcademicStatus();
    try {
      const refresh = force ? "&refresh=1" : "";
      const courses = await apiGet(`/api/academic-node-courses?node_id=${encodeURIComponent(nodeId)}${refresh}`);
      state.academicNodeCourses[nodeId] = courses;
    } catch {
      state.academicNodeCourses[nodeId] = { __error: true };
    }
    renderAcademicStatus();
  }

  function showAcademicRawPage() {
    const raw = state.academicStatus?.rawHtml || "";
    state.rawModalTitle = "教务原始网页";
    state.rawPreviewVisible = true;
    state.rawPreviewSrcdoc = raw || "<div>暂无原始网页内容</div>";
    setRawContentValue(raw || "暂无原始网页内容", "html");
    switchAcademicRawTab("preview");
    state.rawModalVisible = true;
  }

  function showAcademicDetailJson() {
    const raw = state.academicStatus?.rawDetailJson || [];
    state.rawModalTitle = "学业明细原始 JSON";
    state.rawPreviewVisible = false;
    state.rawPreviewSrcdoc = "";
    setRawContentValue(JSON.stringify(raw, null, 2) || "[]", "json");
    switchAcademicRawTab("source");
    state.rawModalVisible = true;
  }

  function exportAcademicDataJson() {
    downloadJson(`academic-status-${new Date().toISOString().replaceAll(":", "-")}.json`, state.academicStatus || {});
  }

  function switchAcademicRawTab(tab) {
    state.rawTab = tab;
    if (state.rawContentEditor) state.rawContentEditor.layout();
  }

  function closeAcademicRawModal() {
    state.rawModalVisible = false;
  }

  async function loadAcademicCourseDetail(kchId) {
    if (!kchId) return;
    state.academicCourseDetail = { _loading: true };
    try {
      const res = await apiGet(`/api/academic-course-detail?kch_id=${encodeURIComponent(kchId)}`);
      state.academicCourseDetail = res;
    } catch {
      state.academicCourseDetail = { _error: true };
    }
  }

  function closeAcademicCourseDetail() {
    state.academicCourseDetail = null;
  }

  async function reloadAcademicNodeCourses(nodeId) {
    delete state.academicNodeCourses[nodeId];
    renderAcademicStatus();
    await loadAcademicNodeCourses(nodeId, true);
  }

  function toggleAcademicNode(nodeId) {
    if (state.academicExpandedNodes.has(nodeId)) {
      state.academicExpandedNodes.delete(nodeId);
    } else {
      state.academicExpandedNodes.add(nodeId);
    }
    renderAcademicStatus();
  }

  return {
    renderAcademicStatus,
    toggleAcademicNode,
    refreshAcademicStatus,
    loadAcademicNodeCourses,
    reloadAcademicNodeCourses,
    showAcademicRawPage,
    showAcademicDetailJson,
    exportAcademicDataJson,
    switchAcademicRawTab,
    closeAcademicRawModal,
    loadAcademicCourseDetail,
    closeAcademicCourseDetail,
  };
}
