import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { apiGet } from "../../api/client.js";
import { downloadJson } from "../../shared/utils.js";
import { academicFilterNatures, academicFilterTerms } from "./filters.js";

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

  function renderAcademicStatus() {
    state.academicVersion += 1;
  }

  function syncAcademicFilterOptions() {
    const nodes = state.academicStatus?.nodes || [];
    if (state.academicFilters.suggestedTerm !== "all" && !academicFilterTerms(nodes).includes(state.academicFilters.suggestedTerm)) {
      state.academicFilters.suggestedTerm = "all";
    }
    if (state.academicFilters.courseNature !== "all" && !academicFilterNatures(nodes).includes(state.academicFilters.courseNature)) {
      state.academicFilters.courseNature = "all";
    }
  }

  async function refreshAcademicStatus(force = false) {
    state.academicLoading = true;
    renderAcademicStatus();
    try {
      state.academicStatus = await apiGet(`/api/academic-status${force ? "?refresh=1" : ""}`);
      syncAcademicFilterOptions();
    } finally {
      state.academicLoading = false;
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

  return {
    renderAcademicStatus,
    refreshAcademicStatus,
    showAcademicRawPage,
    showAcademicDetailJson,
    exportAcademicDataJson,
    switchAcademicRawTab,
    closeAcademicRawModal,
  };
}
