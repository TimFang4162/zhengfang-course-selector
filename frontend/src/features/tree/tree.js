import { apiGet, apiPost } from "../../api/client.js";
import { SIDEBAR_COLLAPSED_KEY } from "../../shared/constants.js";
import { downloadJson } from "../../shared/utils.js";
import { courseMatchesSearch } from "./search.js";
import { createTreeRenderer } from "./render.js";

export function createTreeFeature({ state, getApp, helpers }) {
  const emptyBucket = { courseIds: [], courses: [], hasMore: false, nextPage: 1, loaded: false };
  const COURSE_TABS_KEY = "jwxt:course-tabs:v1";

  function selectionStateValue(value) {
    return value === "include" || value === "exclude" ? value : "inherit";
  }

  function courseSelectionKey(categoryId, kchId) {
    return `${categoryId}:${kchId}`;
  }

  function classSelectionKey(categoryId, kchId, classItem) {
    const classNo = String(classItem?.classNo || classItem?.jxbId || classItem?.doJxbId || "");
    return `${categoryId}:${kchId}:${classNo}`;
  }

  function selectionCycle(current) {
    if (current === "include") return "exclude";
    if (current === "exclude") return "inherit";
    return "include";
  }

  function selectionState(type, categoryId, kchId, classItem) {
    if (type === "category") return "inherit";
    if (type === "course") return selectionStateValue(state.treeSelection.courses[courseSelectionKey(categoryId, kchId)]);
    return selectionStateValue(state.treeSelection.classes[classSelectionKey(categoryId, kchId, classItem)]);
  }

  function effectiveSelection(type, categoryId, kchId, classItem) {
    const current = selectionState(type, categoryId, kchId, classItem);
    if (current === "include") return true;
    if (current === "exclude") return false;
    if (type === "category") return false;
    if (type === "course") return false;
    return effectiveSelection("course", categoryId, kchId);
  }

  function selectionVisualState(type, categoryId, kchId, classItem) {
    const current = selectionState(type, categoryId, kchId, classItem);
    if (current === "include") return "include";
    if (current === "exclude") return "exclude";
    return effectiveSelection(type, categoryId, kchId, classItem) ? "inherited" : "inherit";
  }

  function setSelectionState(type, categoryId, kchId, classItem, value) {
    const normalized = selectionStateValue(value);
    if (type === "category") return;
    if (type === "course") {
      const key = courseSelectionKey(categoryId, kchId);
      if (normalized === "inherit") delete state.treeSelection.courses[key];
      else state.treeSelection.courses[key] = normalized;
      return;
    }
    const key = classSelectionKey(categoryId, kchId, classItem);
    if (normalized === "inherit") delete state.treeSelection.classes[key];
    else state.treeSelection.classes[key] = normalized;
  }

  function toggleCategorySelection(categoryId) {
    const courses = tabBucket(categoryId).courses || [];
    if (!courses.length) {
      renderTree();
      return;
    }
    const states = courses.map((course) => selectionState("course", categoryId, course.kchId));
    const allInclude = states.every((state) => state === "include");
    const allExclude = states.every((state) => state === "exclude");
    const next = allInclude ? "exclude" : allExclude ? "inherit" : "include";
    for (const course of courses) setSelectionState("course", categoryId, course.kchId, null, next);
    renderTree();
  }

  function toggleCourseSelection(categoryId, kchId) {
    const next = selectionCycle(selectionState("course", categoryId, kchId));
    setSelectionState("course", categoryId, kchId, null, next);
    renderTree();
  }

  function toggleClassSelection(categoryId, kchId, classItem) {
    const next = selectionCycle(selectionState("class", categoryId, kchId, classItem));
    setSelectionState("class", categoryId, kchId, classItem, next);
    renderTree();
  }

  function clearTreeSelection() {
    state.treeSelection.courses = {};
    state.treeSelection.classes = {};
    renderTree();
  }

  function hasExplicitClassSelection(categoryId, kchId) {
    const prefix = `${categoryId}:${kchId}:`;
    return Object.keys(state.treeSelection.classes).some((key) => key.startsWith(prefix));
  }

  function hasExplicitCourseSelection(categoryId) {
    const coursePrefix = `${categoryId}:`;
    if (Object.keys(state.treeSelection.courses).some((key) => key.startsWith(coursePrefix))) return true;
    return Object.keys(state.treeSelection.classes).some((key) => key.startsWith(coursePrefix));
  }

  function categorySelectionDisplayState(categoryId) {
    const courses = tabBucket(categoryId).courses || [];
    if (!courses.length) return hasExplicitCourseSelection(categoryId) ? "partial" : "inherit";
    const states = courses.map((course) => selectionState("course", categoryId, course.kchId));
    const allInclude = states.length > 0 && states.every((state) => state === "include");
    const allExclude = states.length > 0 && states.every((state) => state === "exclude");
    const anyExplicit = states.some((state) => state !== "inherit") || hasExplicitCourseSelection(categoryId);
    if (allInclude) return "include";
    if (allExclude) return "exclude";
    return anyExplicit ? "partial" : "inherit";
  }

  function selectionDisplayState(type, categoryId, kchId, classItem) {
    if (type === "category") return categorySelectionDisplayState(categoryId);
    const current = selectionState(type, categoryId, kchId, classItem);
    if (current === "include") return "include";
    if (current === "exclude") return "exclude";
    if (type === "course" && hasExplicitClassSelection(categoryId, kchId)) return "partial";
    return selectionVisualState(type, categoryId, kchId, classItem);
  }

  function selectionStats() {
    const categoryCount = 0;
    const courseCount = Object.keys(state.treeSelection.courses).length;
    const classCount = Object.keys(state.treeSelection.classes).length;
    const includeCount = [
      ...Object.values(state.treeSelection.courses),
      ...Object.values(state.treeSelection.classes),
    ].filter((value) => value === "include").length;
    const excludeCount = [
      ...Object.values(state.treeSelection.courses),
      ...Object.values(state.treeSelection.classes),
    ].filter((value) => value === "exclude").length;
    return { categoryCount, courseCount, classCount, includeCount, excludeCount, total: categoryCount + courseCount + classCount };
  }

  function nearestAncestorExplicitState(type, categoryId, kchId) {
    if (type === "category" || type === "course") return null;
    const courseState = selectionState("course", categoryId, kchId);
    if (courseState !== "inherit") return courseState;
    return null;
  }

  function buildSelectionRule() {
    const includes = [];
    const excludes = [];
    for (const [key, value] of Object.entries(state.treeSelection.courses)) {
      const [categoryId, kchId] = key.split(":");
      const ancestorState = nearestAncestorExplicitState("course", categoryId, kchId);
      if (value === "include") {
        if (ancestorState !== "include") includes.push({ type: "course", categoryId, kchId });
      } else if (value === "exclude" && ancestorState === "include") {
        excludes.push({ type: "course", categoryId, kchId });
      }
    }
    for (const [key, value] of Object.entries(state.treeSelection.classes)) {
      const [categoryId, kchId, classNo] = key.split(":");
      const ancestorState = nearestAncestorExplicitState("class", categoryId, kchId);
      if (value === "include") {
        if (ancestorState !== "include") includes.push({ type: "class", categoryId, kchId, classNo });
      } else if (value === "exclude" && ancestorState === "include") {
        excludes.push({ type: "class", categoryId, kchId, classNo });
      }
    }
    return { includes, excludes };
  }

  function defaultSearchFilters(keyword = "") {
    return {
      keyword,
      collegeIds: [],
      majorIds: [],
      teachingCollegeIds: [],
      gradeIds: [],
      courseCategoryIds: [],
      courseNatureIds: [],
      courseOwnershipIds: [],
      teachingModeIds: [],
      weekdayIds: [],
      periodIds: [],
      credits: [],
      classNames: [],
      recommended: [],
      hasCapacity: [],
      timeConflict: [],
      retake: [],
    };
  }

  function cloneSearchFilters(filters) {
    const cloned = defaultSearchFilters(filters?.keyword || "");
    for (const key of Object.keys(cloned)) {
      if (key === "keyword") continue;
      cloned[key] = [...(filters?.[key] || [])];
    }
    return cloned;
  }

  function filterSubmitValue(item) {
    return item && typeof item === "object" ? item.value : item;
  }

  function filtersForSubmit(filters) {
    const normalized = defaultSearchFilters(filters?.keyword || "");
    for (const key of Object.keys(normalized)) {
      if (key === "keyword") continue;
      normalized[key] = (filters?.[key] || []).map(filterSubmitValue).filter(Boolean);
    }
    return normalized;
  }

  function serializeTab(tab) {
    return {
      id: tab.id,
      title: tab.title,
      query: tab.query || "",
      localFilter: tab.localFilter || "",
      queryPanelOpen: Boolean(tab.queryPanelOpen),
      draftFilters: cloneSearchFilters(tab.draftFilters || defaultSearchFilters("")),
      appliedFilters: cloneSearchFilters(tab.appliedFilters || tab.draftFilters || defaultSearchFilters("")),
      appliedScope: tab.appliedScope || "all",
    };
  }

  function hydrateTab(raw) {
    const base = queryTabDefaults(raw?.id || `search-${state.nextCourseTabId++}`, {
      title: raw?.title || "查询",
      query: typeof raw?.query === "string" ? raw.query : "",
      localFilter: typeof raw?.localFilter === "string" ? raw.localFilter : "",
      queryPanelOpen: typeof raw?.queryPanelOpen === "boolean" ? raw.queryPanelOpen : true,
      draftFilters: cloneSearchFilters(raw?.draftFilters || defaultSearchFilters("")),
      appliedFilters: cloneSearchFilters(raw?.appliedFilters || raw?.draftFilters || defaultSearchFilters("")),
      appliedScope: raw?.appliedScope || "all",
    });
    if (base.id === "default") base.title = "默认查询";
    return base;
  }

  function saveTabsState() {
    const payload = {
      activeCourseTabId: state.activeCourseTabId,
      nextCourseTabId: state.nextCourseTabId,
      courseTabs: state.courseTabs.map(serializeTab),
    };
    window.localStorage.setItem(COURSE_TABS_KEY, JSON.stringify(payload));
  }

  function restoreSavedTabs() {
    const raw = window.localStorage.getItem(COURSE_TABS_KEY);
    if (!raw) {
      ensureDefaultTab();
      return;
    }
    try {
      const payload = JSON.parse(raw);
      const tabs = Array.isArray(payload?.courseTabs) ? payload.courseTabs.map(hydrateTab) : [];
      state.courseTabs = tabs.length ? tabs : state.courseTabs;
      ensureDefaultTab();
      state.activeCourseTabId = state.courseTabs.some((tab) => tab.id === payload?.activeCourseTabId)
        ? payload.activeCourseTabId
        : "default";
      const numericIds = state.courseTabs
        .map((tab) => String(tab.id).match(/^search-(\d+)$/)?.[1])
        .filter(Boolean)
        .map((value) => Number(value));
      const inferredNextId = numericIds.length ? Math.max(...numericIds) + 1 : 1;
      state.nextCourseTabId = Math.max(Number(payload?.nextCourseTabId) || 1, inferredNextId);
    } catch {
      ensureDefaultTab();
    }
  }

  function ensureDefaultTab() {
    let tab = state.courseTabs.find((item) => item.id === "default");
    if (!tab) {
      const filters = defaultSearchFilters("");
      const majorId = state.categories.find((category) => category.zyhId)?.zyhId;
      if (majorId) filters.majorIds = [{ value: majorId, label: `专业 ${majorId}` }];
      tab = {
        id: "default",
        type: "query",
        title: "默认查询",
        localFilter: "",
        queryPanelOpen: true,
        draftFilters: cloneSearchFilters(filters),
        appliedFilters: cloneSearchFilters(filters),
        results: {},
        expandedCategories: new Set(),
        expandedCourses: new Set(),
        loadingCategories: new Set(),
        loadingCourses: new Set(),
      };
      state.courseTabs.unshift(tab);
    }
    if (!tab.results) tab.results = {};
    if (!tab.draftFilters) {
      const filters = defaultSearchFilters("");
      const majorId = state.categories.find((category) => category.zyhId)?.zyhId;
      if (majorId) filters.majorIds = [{ value: majorId, label: `专业 ${majorId}` }];
      tab.draftFilters = cloneSearchFilters(filters);
    }
    if (!tab.appliedFilters) tab.appliedFilters = cloneSearchFilters(tab.draftFilters);
    if (!tab.expandedCategories) tab.expandedCategories = new Set();
    if (!tab.expandedCourses) tab.expandedCourses = new Set();
    if (!tab.loadingCategories) tab.loadingCategories = new Set();
    if (!tab.loadingCourses) tab.loadingCourses = new Set();
    if (typeof tab.localFilter !== "string") tab.localFilter = "";
    if (typeof tab.queryPanelOpen !== "boolean") tab.queryPanelOpen = true;
    if (tab.id === "default") {
      const majorId = state.categories.find((category) => category.zyhId)?.zyhId;
      if (majorId && !tab.draftFilters.majorIds.length) {
        tab.draftFilters.majorIds = [{ value: majorId, label: `专业 ${majorId}` }];
      }
      if (majorId && !tab.appliedFilters.majorIds.length) {
        tab.appliedFilters.majorIds = [{ value: majorId, label: `专业 ${majorId}` }];
      }
    }
    tab.type = "query";
    tab.title = "默认查询";
    return tab;
  }

  function activeCourseTab() {
    ensureDefaultTab();
    return state.courseTabs.find((tab) => tab.id === state.activeCourseTabId) || state.courseTabs[0];
  }

  function queryTabDefaults(id, overrides = {}) {
    const filters = defaultSearchFilters(state.search.query);
    return {
      id,
      type: "query",
      title: "查询",
      query: state.search.query,
      scope: "all",
      localFilter: "",
      queryPanelOpen: true,
      draftFilters: cloneSearchFilters(filters),
      appliedFilters: cloneSearchFilters(filters),
      appliedScope: "all",
      results: {},
      expandedCategories: new Set(),
      expandedCourses: new Set(),
      loadingCategories: new Set(),
      loadingCourses: new Set(),
      ...overrides,
    };
  }

  function categoryEntity(categoryId) {
    return state.courseEntities.categories[categoryId];
  }

  function courseStore(categoryId) {
    if (!state.courseEntities.courses[categoryId]) state.courseEntities.courses[categoryId] = {};
    return state.courseEntities.courses[categoryId];
  }

  function classStore(categoryId) {
    if (!state.courseEntities.classes[categoryId]) state.courseEntities.classes[categoryId] = {};
    return state.courseEntities.classes[categoryId];
  }

  function classKeyFor(courseNo, item) {
    const classNo = String(item.classNo || item.jxbh || item.jxbId || item.doJxbId || "");
    return `${courseNo}:${classNo || "unknown"}`;
  }

  function upsertCourse(categoryId, course, queryKey = "default") {
    const courseNo = String(course.courseNo || course.kchId || "");
    if (!courseNo) return null;
    const store = courseStore(categoryId);
    const existing = store[courseNo] || { categoryId, courseNo, kchId: courseNo, classIds: [], classesLoaded: false, sources: {} };
    store[courseNo] = {
      ...existing,
      ...course,
      categoryId,
      courseNo,
      kchId: courseNo,
      classIds: existing.classIds || [],
      classesLoaded: Boolean(existing.classesLoaded || course.classesLoaded),
      sources: {
        ...(existing.sources || {}),
        [queryKey]: { classCount: course.classCount, raw: course.raw || null },
      },
    };
    return store[courseNo];
  }

  function mergeCourses(categoryId, courses, queryKey = "default") {
    const ids = [];
    for (const course of courses || []) {
      const entity = upsertCourse(categoryId, course, queryKey);
      if (!entity) continue;
      if (entity && !ids.includes(entity.courseNo)) ids.push(entity.courseNo);
      if (course?.classesLoaded) mergeClasses(categoryId, entity.courseNo, course.classes || []);
    }
    return ids;
  }

  function mergeClasses(categoryId, courseNo, classes) {
    const store = classStore(categoryId);
    const course = courseStore(categoryId)[courseNo];
    const classIds = [];
    for (const item of classes || []) {
      const key = item.classKey || classKeyFor(courseNo, item);
      const classNo = String(item.classNo || key.split(":").slice(1).join(":") || "");
      store[key] = { ...store[key], ...item, categoryId, courseNo, classNo, classKey: key };
      classIds.push(key);
    }
    if (course) {
      course.classIds = classIds;
      course.classesLoaded = true;
    }
    return classIds.map((key) => store[key]).filter(Boolean);
  }

  function classEntities(categoryId, courseNo) {
    const course = courseStore(categoryId)[courseNo];
    const store = classStore(categoryId);
    return (course?.classIds || []).map((key) => store[key]).filter(Boolean);
  }

  function tabBucket(categoryId, tab = activeCourseTab()) {
    const bucket = tab?.results?.[categoryId] || emptyBucket;
    const courses = (bucket.courseIds || []).map((id) => courseStore(categoryId)[id]).filter(Boolean);
    return { ...bucket, courses };
  }

  function expandedCategories(tab = activeCourseTab()) {
    return tab.expandedCategories;
  }

  function expandedCourses(tab = activeCourseTab()) {
    return tab.expandedCourses;
  }

  function loadingCategories(tab = activeCourseTab()) {
    return tab.loadingCategories;
  }

  function loadingCourses(tab = activeCourseTab()) {
    return tab.loadingCourses;
  }

  function classBucket(categoryId, kchId) {
    const course = courseStore(categoryId)[kchId];
    if (!course?.classesLoaded) return undefined;
    return classEntities(categoryId, kchId);
  }

  function syncSearchScopeOptions() {
    for (const tab of state.courseTabs) {
      if (tab.type === "query") tab.scope = "all";
    }
  }

  function shouldRenderCourse(categoryId, course) {
    if (state.filters.credit && helpers.courseExceedsCredit(course)) return false;
    return courseMatchesSearch(state, categoryId, course);
  }

  const renderTree = createTreeRenderer({ state, getApp, shouldRenderCourse });

  function applyLocalSearch() {
    renderTree();
  }

  function createSearchTab() {
    const current = activeCourseTab();
    const number = state.nextCourseTabId++;
    const id = `search-${number}`;
    const tab = queryTabDefaults(id, {
      title: `查询${number}`,
      draftFilters: cloneSearchFilters(current?.draftFilters || current?.appliedFilters || defaultSearchFilters(state.search.query)),
      appliedFilters: cloneSearchFilters(current?.appliedFilters || defaultSearchFilters(state.search.query)),
      scope: "all",
      appliedScope: "all",
    });
    state.courseTabs.push(tab);
    state.activeCourseTabId = id;
    saveTabsState();
    renderTree();
  }

  function closeCourseTab(tabId) {
    const tab = state.courseTabs.find((item) => item.id === tabId);
    if (!tab) return;
    const index = state.courseTabs.findIndex((item) => item.id === tabId);
    if (index < 0) return;
    state.courseTabs.splice(index, 1);
    if (state.activeCourseTabId === tabId) state.activeCourseTabId = "default";
    if (!state.courseTabs.length) ensureDefaultTab();
    saveTabsState();
    renderTree();
  }

  function activateCourseTab(tabId) {
    state.activeCourseTabId = tabId;
    saveTabsState();
    renderTree();
  }

  function updateSearchTabTitle(tab) {
    if (tab.id === "default") {
      tab.title = "默认查询";
      return;
    }
    const query = (tab.appliedFilters.keyword || "").trim();
    const firstFilter = Object.values(tab.appliedFilters).flat().find((item) => item && typeof item === "object" && item.label);
    tab.title = query || firstFilter?.label || "查询";
  }

  async function runSearchTab(tab = activeCourseTab(), reset = true) {
    if (!tab || tab.type !== "query") return;
    tab.draftFilters.keyword = tab.query;
    tab.appliedFilters = cloneSearchFilters(tab.draftFilters);
    tab.scope = "all";
    tab.appliedScope = "all";
    updateSearchTabTitle(tab);
    if (reset) {
      tab.results = {};
      tab.expandedCategories.clear();
      tab.expandedCourses.clear();
    }
    saveTabsState();
    renderTree();
  }

  async function loadSearchCategoryCourses(tab, categoryId, page = 1) {
    tab.loadingCategories.add(categoryId);
    renderTree();
    const data = await apiPost("/api/courses/search", { categoryId, page, filters: filtersForSubmit(tab.appliedFilters) });
    const bucket = tab.results[categoryId] || { courseIds: [], hasMore: false, nextPage: 2, loaded: false, loadedPages: [] };
    const queryKey = data.filterKey || JSON.stringify(filtersForSubmit(tab.appliedFilters));
    const newIds = mergeCourses(categoryId, data.courses || [], queryKey);
    const courseIds = [...bucket.courseIds];
    for (const id of newIds) if (!courseIds.includes(id)) courseIds.push(id);
    tab.results[categoryId] = {
      queryKey,
      courseIds,
      hasMore: data.hasMore,
      nextPage: data.nextPage,
      loaded: true,
      loadedPages: [...new Set([...(bucket.loadedPages || []), page])],
      count: data.count,
    };
    tab.loadingCategories.delete(categoryId);
    renderTree();
  }

  async function loadFilterOptions(type, parent = {}, page = 1, query = "") {
    const parentKey = parent.collegeId ? `:${parent.collegeId}` : "";
    const queryKey = query ? `:${query}` : "";
    const key = `${type}${parentKey}${queryKey}`;
    if (page === 1 && state.filterOptions[key]?.loaded) return;
    if (state.loadingFilterOptions.has(key)) return;
    state.loadingFilterOptions.add(key);
    renderTree();
    const params = new URLSearchParams({ type, page: String(page) });
    if (parent.collegeId) params.set("college_id", parent.collegeId);
    if (query) params.set("q", query);
    const data = await apiGet(`/api/course-filter-options?${params.toString()}`);
    const existing = page > 1 ? state.filterOptions[key]?.items || [] : [];
    state.filterOptions[key] = { items: [...existing, ...(data.items || [])], loaded: true, page, hasMore: Boolean(data.hasMore) };
    state.loadingFilterOptions.delete(key);
    renderTree();
  }

  function setFilterStatus() {
    return state.filters;
  }

  function runDisplayAction(action) {
    if (action === "toggle-conflict") state.filters.conflict = !state.filters.conflict;
    if (action === "toggle-credit") state.filters.credit = !state.filters.credit;
    if (action === "toggle-no-capacity") state.filters.noCapacity = !state.filters.noCapacity;
    if (action === "toggle-highlight-capacity") state.filters.highlightCapacity = !state.filters.highlightCapacity;
    if (action === "toggle-completed") {
      if (!state.academicStatus) {
        window.alert("请先加载学业情况，再淡化已修读课程。");
        return;
      }
      state.filters.completed = !state.filters.completed;
    }
    if (action) {
      setFilterStatus();
      renderTree();
    }
  }

  function runFeatureAction(action) {
    if (action === "export-courses") exportAllCourses().catch(getApp().showError);
    if (action === "refresh-categories") refreshCategories(true).catch(getApp().showError);
  }

  async function refreshCategoryCourses(categoryId) {
    const tab = activeCourseTab();
    tab.results[categoryId] = { courseIds: [], hasMore: false, nextPage: 1, loaded: false, loadedPages: [] };
    tab.expandedCourses.forEach((key) => {
      if (String(key).startsWith(`${categoryId}:`)) tab.expandedCourses.delete(key);
    });
    await loadSearchCategoryCourses(tab, categoryId, 1);
  }

  function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, state.sidebarCollapsed ? "1" : "0");
  }

  function switchTab(tab) {
    const app = getApp();
    state.activeTab = tab;
    if (tab === "academic" && !state.academicStatus && !state.academicLoading) app.academic.refreshAcademicStatus(false).catch(app.showError);
  }

  async function refreshCategories(force = false) {
    const data = await apiGet(`/api/categories${force ? "?refresh=1" : ""}`);
    state.categories = data.items;
    for (const category of data.items || []) state.courseEntities.categories[category.id] = category;
    syncSearchScopeOptions();
    if (force) {
      state.courseEntities.courses = {};
      state.courseEntities.classes = {};
      for (const tab of state.courseTabs) {
        tab.results = {};
        tab.expandedCategories.clear();
        tab.expandedCourses.clear();
        tab.loadingCategories.clear();
        tab.loadingCourses.clear();
      }
    }
    renderTree();
  }

  function applyTreeState(tree) {
    if (!tree?.items) return;
    state.categories = tree.items.map((item) => ({ id: item.id, name: item.name, kklxdm: item.kklxdm, xkkzId: item.xkkzId, grade: item.grade, zyhId: item.zyhId }));
    const defaultTab = ensureDefaultTab();
    syncSearchScopeOptions();
    for (const category of tree.items) {
      state.courseEntities.categories[category.id] = { id: category.id, name: category.name, kklxdm: category.kklxdm, xkkzId: category.xkkzId, grade: category.grade, zyhId: category.zyhId };
      const ids = mergeCourses(category.id, category.courses || [], "tree-state");
      defaultTab.results[category.id] = { courseIds: ids, hasMore: Boolean(category.hasMore), nextPage: category.nextPage || 1, loaded: Boolean(category.coursesLoaded), loadedPages: category.loadedPages || [] };
    }
  }

  async function syncTreeState() {
    const tree = await apiGet("/api/tree/state");
    applyTreeState(tree);
    renderTree();
  }

  async function refreshTimetable(refresh = true) {
    const app = getApp();
    state.timetable = await apiGet(`/api/timetable${refresh ? "?refresh=1" : ""}`);
    setFilterStatus();
    app.timetable.renderTimetable();
    app.timetable.renderTimetableDetailAll();
    renderTree();
  }

  async function fetchAllCategoryCourses(categoryId) {
    const courses = [];
    let page = 1;
    let hasMore = true;
    let nextPage = 1;
    while (hasMore) {
      const data = await apiPost("/api/courses/search", { categoryId, page, filters: {} });
      mergeCourses(categoryId, data.courses || [], "export");
      for (const course of data.courses || []) {
        const idx = courses.findIndex((item) => item.kchId === course.kchId);
        if (idx >= 0) courses[idx] = course;
        else courses.push(course);
      }
      hasMore = Boolean(data.hasMore);
      nextPage = data.nextPage || page + 1;
      page = nextPage;
    }
    return courses;
  }

  async function fetchCourseClassesForExport(categoryId, course) {
    const cached = classBucket(categoryId, course.kchId);
    if (cached) return cached;
    const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(course.kchId)}`);
    return mergeClasses(categoryId, course.kchId, data.classes || []);
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
      downloadJson(`jwxt-courses-${exportedAt.replaceAll(":", "-")}.json`, { exportedAt, baseUrl: state.bootstrap?.baseUrl || "", categoryCount: categories.length, courseCount: categories.reduce((total, category) => total + category.courses.length, 0), classCount: categories.reduce((total, category) => total + category.courses.reduce((sum, course) => sum + course.classes.length, 0), 0), categories });
      app.activity.upsertActivity("export-courses", { status: "完成", progress: `${categories.length}大类 ${categories.reduce((total, category) => total + category.courses.length, 0)}课程` });
    } catch (error) {
      app.activity.upsertActivity("export-courses", { status: "失败", progress: error.message || String(error) });
      throw error;
    } finally {
      action.disabled = false;
      renderTree();
    }
  }

  async function loadCourseClasses(categoryId, kchId, force = false) {
    const tab = activeCourseTab();
    const key = `${categoryId}:${kchId}`;
    tab.loadingCourses.add(key);
    renderTree();
    const refresh = force ? "&refresh=1" : "";
    const data = await apiGet(`/api/classes?category_id=${categoryId}&kch_id=${encodeURIComponent(kchId)}${refresh}`);
    mergeClasses(categoryId, kchId, data.classes || []);
    tab.loadingCourses.delete(key);
    renderTree();
  }

  function toggleCategory(categoryId) {
    const app = getApp();
    const tab = activeCourseTab();
    const expanded = expandedCategories(tab);
    if (expanded.has(categoryId)) {
      expanded.delete(categoryId);
      renderTree();
      return;
    }
    expanded.add(categoryId);
    if (!tabBucket(categoryId, tab).loaded) {
      loadSearchCategoryCourses(tab, categoryId, 1).catch(app.showError);
    } else renderTree();
  }

  function toggleCourse(categoryId, kchId) {
    const app = getApp();
    const tab = activeCourseTab();
    const key = `${categoryId}:${kchId}`;
    const expanded = expandedCourses(tab);
    if (expanded.has(key)) {
      expanded.delete(key);
      renderTree();
      return;
    }
    expanded.add(key);
    if (!classBucket(categoryId, kchId)) loadCourseClasses(categoryId, kchId).catch(app.showError);
    else renderTree();
  }

  function refreshCourseClasses(categoryId, kchId) {
    return loadCourseClasses(categoryId, kchId, true);
  }

  return {
    syncSearchScopeOptions,
    activeCourseTab,
    categoryBucket: tabBucket,
    visibleCourses: (tab, categoryId) => tabBucket(categoryId, tab).courses,
    categoryEntity,
    expandedCategories,
    expandedCourses,
    loadingCategories,
    loadingCourses,
    classBucket,
    applyLocalSearch,
    createSearchTab,
    closeCourseTab,
    activateCourseTab,
    runSearchTab,
    loadSearchCategoryCourses,
    loadFilterOptions,
    setFilterStatus,
    runDisplayAction,
    runFeatureAction,
    toggleSidebar,
    switchTab,
    refreshCategories,
    applyTreeState,
    saveTabsState,
    restoreSavedTabs,
    syncTreeState,
    refreshTimetable,
    loadCourseClasses,
    refreshCourseClasses,
    refreshCategoryCourses,
    renderTree,
    toggleCategory,
    toggleCourse,
    toggleCategorySelection,
    toggleCourseSelection,
    toggleClassSelection,
    selectionState,
    selectionDisplayState,
    effectiveSelection,
    clearTreeSelection,
    selectionStats,
    buildSelectionRule,
  };
}
