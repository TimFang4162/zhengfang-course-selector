import { apiGet } from "../../api/client.js";
import { state } from "../../app/state.js";
import { SIDEBAR_COLLAPSED_KEY } from "../../shared/constants.js";
import { downloadJson } from "../../shared/utils.js";
import { courseMatchesSearch } from "./search.js";
import { createTreeRenderer } from "./render.js";

export function createTreeFeature({ state, getApp, helpers }) {
  function syncSearchScopeOptions() {
    if (!state.categories.some((category) => category.id === state.search.scope)) state.search.scope = "all";
  }

  function shouldRenderCourse(categoryId, course) {
    if (state.filters.credit && helpers.courseExceedsCredit(course)) return false;
    return courseMatchesSearch(state, categoryId, course);
  }

  const renderTree = createTreeRenderer({ state, getApp, shouldRenderCourse });

  function applyLocalSearch() {
    renderTree();
  }

  function setFilterStatus() {
    return state.filters;
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
    if (action === "export-courses") exportAllCourses().catch(getApp().showError);
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, state.sidebarCollapsed ? "1" : "0");
  }

  function switchTab(tab) {
    const app = getApp();
    state.activeTab = tab;
    if (tab === "academic" && !state.academicStatus && !state.academicLoading) {
      app.academic.refreshAcademicStatus(false).catch(app.showError);
    }
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
        if (course.classesLoaded) state.courseClasses[`${category.id}:${course.kchId}`] = course.classes || [];
      }
    }
  }

  async function syncTreeState() {
    const tree = await apiGet("/api/tree/state");
    applyTreeState(tree);
    renderTree();
  }

  async function refreshTimetable() {
    const app = getApp();
    state.timetable = await apiGet("/api/timetable");
    setFilterStatus();
    app.timetable.renderTimetable();
    app.timetable.renderTimetableDetailAll();
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
    state.categoryCourses[categoryId] = { courses, hasMore: false, nextPage, loaded: true };
    return courses;
  }

  async function fetchCourseClassesForExport(categoryId, course) {
    const key = `${categoryId}:${course.kchId}`;
    if (state.courseClasses[key]) return state.courseClasses[key];
    const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(course.kchId)}`);
    state.courseClasses[key] = data.classes || [];
    return state.courseClasses[key];
  }

  async function exportAllCourses() {
    const app = getApp();
    const action = document.getElementById("feature-menu-button");
    action.disabled = true;
    app.activity.upsertActivity("export-courses", { name: "导出所有课程", status: "运行中", progress: "准备" });
    try {
      const exportedAt = new Date().toISOString();
      const categories = [];
      for (const [categoryIndex, category] of state.categories.entries()) {
        app.activity.upsertActivity("export-courses", { status: "拉取大类", progress: `${categoryIndex + 1}/${state.categories.length} ${category.name}` });
        const courses = await fetchAllCategoryCourses(category.id);
        const exportedCourses = [];
        for (const [courseIndex, course] of courses.entries()) {
          app.activity.upsertActivity("export-courses", { status: "拉取教学班", progress: `${categoryIndex + 1}/${state.categories.length} ${courseIndex + 1}/${courses.length}` });
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
      app.activity.upsertActivity("export-courses", { status: "完成", progress: `${categories.length}大类 ${categories.reduce((total, category) => total + category.courses.length, 0)}课程` });
    } catch (error) {
      app.activity.upsertActivity("export-courses", { status: "失败", progress: error.message || String(error) });
      throw error;
    } finally {
      action.disabled = false;
      renderTree();
    }
  }

  async function loadCourseClasses(categoryId, kchId) {
    state.loadingCourses.add(`${categoryId}:${kchId}`);
    renderTree();
    const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(kchId)}`);
    state.courseClasses[`${categoryId}:${kchId}`] = data.classes;
    state.loadingCourses.delete(`${categoryId}:${kchId}`);
    await syncTreeState();
    renderTree();
  }

  function toggleCategory(categoryId) {
    const app = getApp();
    if (state.expandedCategories.has(categoryId)) {
      state.expandedCategories.delete(categoryId);
      renderTree();
      return;
    }
    state.expandedCategories.add(categoryId);
    if (!state.categoryCourses[categoryId]?.loaded) loadCategoryCourses(categoryId, 1).catch(app.showError);
    else renderTree();
  }

  function toggleCourse(categoryId, kchId) {
    const app = getApp();
    const key = `${categoryId}:${kchId}`;
    if (state.expandedCourses.has(key)) {
      state.expandedCourses.delete(key);
      renderTree();
      return;
    }
    state.expandedCourses.add(key);
    if (!state.courseClasses[key]) loadCourseClasses(categoryId, kchId).catch(app.showError);
    else renderTree();
  }

  return {
    syncSearchScopeOptions,
    applyLocalSearch,
    setFilterStatus,
    runDisplayAction,
    runFeatureAction,
    toggleSidebar,
    switchTab,
    refreshCategories,
    applyTreeState,
    syncTreeState,
    refreshTimetable,
    loadCategoryCourses,
    renderTree,
    toggleCategory,
    toggleCourse,
  };
}
