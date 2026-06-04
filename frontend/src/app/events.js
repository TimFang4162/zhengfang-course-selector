import { state } from "./state.js";
import { maxWeek } from "../shared/constants.js";
import { closeMenus, toggleMenu } from "../shared/menu.js";

export function bindEvents(app) {
  document.getElementById("login-button").addEventListener("click", () => app.auth.doLogin().catch(app.showError));
  document.getElementById("saved-login-button").addEventListener("click", () => app.auth.doLogin(true).catch(app.showError));
  document.getElementById("base-url").addEventListener("change", app.auth.syncCustomAddressInput);
  document.getElementById("test-addresses").addEventListener("click", () => app.auth.testLoginAddresses().catch(app.showError));
  document.getElementById("disable-ssl-verify").addEventListener("change", () => app.auth.updateSslVerifySetting().catch(app.showError));
  document.getElementById("speed-close").addEventListener("click", () => document.getElementById("speed-modal").classList.add("hidden"));
  document.getElementById("display-menu-button").addEventListener("click", (event) => { event.stopPropagation(); toggleMenu("display-menu"); });
  document.getElementById("feature-menu-button").addEventListener("click", (event) => { event.stopPropagation(); toggleMenu("feature-menu"); });
  document.getElementById("academic-filter-button").addEventListener("click", (event) => { event.stopPropagation(); toggleMenu("academic-filter-menu"); });
  document.getElementById("academic-more-button").addEventListener("click", (event) => { event.stopPropagation(); toggleMenu("academic-more-menu"); });
  document.getElementById("display-menu").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    app.tree.runDisplayAction(action);
    closeMenus();
  });
  document.getElementById("feature-menu").addEventListener("click", (event) => {
    const action = event.target.dataset.action;
    if (!action) return;
    app.tree.runFeatureAction(action);
    closeMenus();
  });
  document.getElementById("academic-filter-menu").addEventListener("click", (event) => event.stopPropagation());
  document.getElementById("academic-more-menu").addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", closeMenus);
  document.getElementById("toggle-sidebar").textContent = state.sidebarCollapsed ? "⇥" : "⇤";
  document.getElementById("toggle-sidebar").addEventListener("click", app.tree.toggleSidebar);
  document.getElementById("course-search").addEventListener("input", () => { state.search.query = document.getElementById("course-search").value; });
  document.getElementById("course-search").addEventListener("keydown", (event) => { if (event.key === "Enter") app.tree.applyLocalSearch(); });
  document.getElementById("search-scope").addEventListener("change", app.tree.applyLocalSearch);
  document.getElementById("local-search").addEventListener("click", app.tree.applyLocalSearch);
  document.getElementById("remote-search").addEventListener("click", () => {
    app.tree.applyLocalSearch();
    const categoryIds = state.search.scope === "all" ? state.categories.map((item) => item.id) : [state.search.scope];
    for (const categoryId of categoryIds) {
      if (!state.categoryCourses[categoryId]?.loaded) {
        state.expandedCategories.add(categoryId);
        app.tree.loadCategoryCourses(categoryId, 1).catch(app.showError);
      }
    }
  });
  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => app.tree.switchTab(button.dataset.tab));
  });
  document.getElementById("week-prev").addEventListener("click", () => { state.displayWeek = Math.max(1, state.displayWeek - 1); app.timetable.renderTimetable(); });
  document.getElementById("week-next").addEventListener("click", () => { state.displayWeek = Math.min(maxWeek, state.displayWeek + 1); app.timetable.renderTimetable(); });
  document.getElementById("week-refresh").addEventListener("click", () => app.tree.refreshTimetable().catch(app.showError));
  document.getElementById("academic-show-raw").addEventListener("click", () => { closeMenus(); app.academic.showAcademicRawPage(); });
  document.getElementById("academic-show-detail-json").addEventListener("click", () => { closeMenus(); app.academic.showAcademicDetailJson(); });
  document.getElementById("academic-export-json").addEventListener("click", () => { closeMenus(); app.academic.exportAcademicDataJson(); });
  document.getElementById("academic-refresh").addEventListener("click", () => app.academic.refreshAcademicStatus(true).catch(app.showError));
  document.getElementById("academic-filter-term").addEventListener("change", (event) => { state.academicFilters.suggestedTerm = event.target.value; app.academic.renderAcademicStatus(); });
  document.getElementById("academic-filter-status").addEventListener("change", (event) => { state.academicFilters.statusType = event.target.value; app.academic.renderAcademicStatus(); });
  document.getElementById("academic-filter-nature").addEventListener("change", (event) => { state.academicFilters.courseNature = event.target.value; app.academic.renderAcademicStatus(); });
  document.getElementById("academic-filter-node-status").addEventListener("change", (event) => { state.academicFilters.nodeStatus = event.target.value; app.academic.renderAcademicStatus(); });
  document.getElementById("academic-filter-reset").addEventListener("click", () => {
    state.academicFilters.suggestedTerm = "all";
    state.academicFilters.statusType = "all";
    state.academicFilters.courseNature = "all";
    state.academicFilters.nodeStatus = "all";
    document.getElementById("academic-filter-term").value = "all";
    document.getElementById("academic-filter-status").value = "all";
    document.getElementById("academic-filter-nature").value = "all";
    document.getElementById("academic-filter-node-status").value = "all";
    app.academic.renderAcademicStatus();
  });
  document.getElementById("modal-close").addEventListener("click", app.timetable.closeClassModal);
  document.getElementById("modal-action").addEventListener("click", () => app.timetable.executeModalAction().catch(app.showError));
  document.getElementById("grab-close").addEventListener("click", app.grab.closeGrabModal);
  document.getElementById("grab-expression").addEventListener("input", () => app.grab.refreshGrabPreview().catch(app.showError));
  document.getElementById("grab-preview-refresh").addEventListener("click", () => app.grab.refreshGrabPreview().catch(app.showError));
  document.getElementById("grab-confirm").addEventListener("click", () => app.grab.confirmGrabExpression().catch(app.showError));
  document.getElementById("grab-start-mode").addEventListener("change", (event) => { document.getElementById("grab-start-at").disabled = event.target.value !== "scheduled"; });
  document.getElementById("task-close").addEventListener("click", () => document.getElementById("task-modal").classList.add("hidden"));
  document.getElementById("log-detail-close").addEventListener("click", () => document.getElementById("log-detail-modal").classList.add("hidden"));
  document.getElementById("academic-raw-close").addEventListener("click", () => document.getElementById("academic-raw-modal").classList.add("hidden"));
  document.querySelectorAll("[data-raw-tab]").forEach((button) => {
    button.addEventListener("click", () => app.academic.switchAcademicRawTab(button.dataset.rawTab));
  });
  document.getElementById("workspace-base-url").addEventListener("change", (event) => {
    document.getElementById("base-url").value = event.target.value;
    if (state.bootstrap) state.bootstrap.baseUrl = event.target.value;
  });
  document.getElementById("account-action").addEventListener("change", (event) => {
    const action = event.target.value;
    event.target.value = "";
    if (action === "show-login") {
      app.auth.setLoginBaseUrl(document.getElementById("workspace-base-url").value);
      document.getElementById("login-overlay").classList.remove("hidden");
      return;
    }
    if (action === "refresh-categories") return void app.tree.refreshCategories(true).catch(app.showError);
    if (action === "refresh-timetable") return void app.tree.refreshTimetable().catch(app.showError);
    if (action === "refresh-academic") app.academic.refreshAcademicStatus(true).catch(app.showError);
  });
  document.getElementById("clear-logs").addEventListener("click", () => app.logs.clearLogs().catch(app.showError));
}
