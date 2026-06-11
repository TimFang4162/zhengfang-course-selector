import { proxy } from "valtio";

export const state = proxy({
  bootstrap: null,
  auth: {
    loginVisible: true,
    loginStatus: "",
    loginTab: "",
    baseUrl: "",
    customBaseUrl: "",
    disableSslVerify: true,
    studentNumber: "",
    password: "",
    saveCredentials: false,
    cookieInput: "",
  },
  speedModalVisible: false,
  speedRows: [],
  floatingMenu: null,
  openMenu: null,
  categories: [],
  courseEntities: {
    categories: {},
    courses: {},
    classes: {},
  },
  filters: { conflict: true, credit: false, completed: true, noCapacity: false, highlightCapacity: true },
  search: { query: "", scope: "all" },
  courseTabs: [{ id: "default", type: "query", title: "默认查询", localFilter: "", draftFilters: null, appliedFilters: null, appliedScope: "all", results: {}, expandedCategories: new Set(), expandedCourses: new Set(), loadingCategories: new Set(), loadingCourses: new Set() }],
  activeCourseTabId: "default",
  nextCourseTabId: 1,
  filterOptions: {},
  loadingFilterOptions: new Set(),
  filterPicker: null,
  treeVersion: 0,
  treeSelection: {
    courses: {},
    classes: {},
  },
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
  timetableDisplay: {
    courseName: true,
    location: true,
    credit: false,
    teacher: false,
    weeks: false,
    time: false,
  },
  academicStatus: null,
  academicExpandedNodes: new Set(),
  academicCourseDetail: null,
  academicNodeCourses: {},
  academicLoading: false,
  academicVersion: 0,
  academicFilters: {
    suggestedTerm: "all",
    statusType: "all",
    courseNature: "all",
    nodeStatus: "all",
  },
  displayWeek: 1,
  timetableVersion: 0,
  activeTab: "tree",
  logSince: 0,
  selectedCell: null,
  modalClass: null,
  courseDetail: null,
  teacherDetail: null,
  grabDraft: null,
  grabDraftLabel: "",
  grabExpression: "",
  grabStatusText: "",
  grabStatusClass: "grab-status",
  grabPreviewData: null,
  grabStartMode: "now",
  grabStartAt: "",
  grabTickInterval: 3,
  grabTimeout: 600,
  grabStopSuccess: true,
  grabErrorPolicy: "retry_once",
  grabTaskDetail: null,
  grabEditor: null,
  rawContentEditor: null,
  rawContentMode: "html",
  rawModalVisible: false,
  rawModalTitle: "教务原始网页",
  rawPreviewVisible: true,
  rawTab: "preview",
  rawPreviewSrcdoc: "",
  logSource: null,
  eventSource: null,
  logFilterType: "all",
  logItems: [],
  logDetailKey: null,
  logEntries: new Map(),
  logDomByKey: new Map(),
});

export function selectedCourseIds() {
  return new Set(state.timetable.selectedCourseIds || []);
}

export function selectedClassIds() {
  return new Set(state.timetable.selectedClassIds || []);
}

export function selectedDoJxbIds() {
  return new Set(state.timetable.selectedDoJxbIds || []);
}

export function isSelectedCourse(course) {
  return selectedCourseIds().has(course.kchId);
}

export function isSelectedClass(item) {
  return selectedClassIds().has(item.jxbId) || selectedDoJxbIds().has(item.doJxbId);
}

export function remainingCredit() {
  return Math.max(0, (state.timetable.maxCredit || 0) - (state.timetable.currentCredit || 0));
}

export function occupiedSlotSet() {
  const set = new Set();
  for (const entry of state.timetable.entries) {
    for (const slot of entry.slots || []) {
      set.add(slot.join("-"));
    }
  }
  return set;
}

export function courseExceedsCredit(course) {
  return !isSelectedCourse(course) && course.creditValue !== null && course.creditValue > remainingCredit();
}

export function classConflicts(item) {
  const occupied = occupiedSlotSet();
  return (item.slots || []).some((slot) => occupied.has(slot.join("-")));
}

export function classHasCapacity(item) {
  return Number(item?.capacity || 0) > Number(item?.selectedCount || 0);
}

export function classMuted(course, item) {
  if (isSelectedClass(item)) return false;
  if (state.filters.completed && courseCompleted(course)) return true;
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (state.filters.conflict && classConflicts(item)) return true;
  if (state.filters.noCapacity && !classHasCapacity(item)) return true;
  return false;
}

export function classConflictMuted(item) {
  return state.filters.conflict && classConflicts(item) && !isSelectedClass(item);
}

export function courseMuted(categoryId, course) {
  if (isSelectedCourse(course)) return false;
  if (state.filters.completed && courseCompleted(course)) return true;
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (!state.filters.conflict) return false;
  const classStore = state.courseEntities.classes[categoryId] || {};
  const entity = state.courseEntities.courses[categoryId]?.[course.kchId];
  const classItems = (entity?.classIds || []).map((key) => classStore[key]).filter(Boolean);
  if (!classItems || !classItems.length) return false;
  return classItems.every((item) => classMuted(course, item));
}

export function completedCourseIds() {
  const ids = new Set();
  const visit = (node) => {
    const cached = state.academicNodeCourses[node.id];
    if (Array.isArray(cached)) {
      for (const course of cached) {
        if (course.statusType === "passed" || course.statusType === "substituted") {
          if (course.kchId) ids.add(String(course.kchId));
          if (course.kch) ids.add(String(course.kch));
        }
      }
    }
    for (const course of node?.courses || []) {
      if (course.statusType === "passed" || course.statusType === "substituted") {
        if (course.kchId) ids.add(String(course.kchId));
        if (course.kch) ids.add(String(course.kch));
      }
    }
    for (const child of node?.children || []) visit(child);
  };
  for (const node of state.academicStatus?.nodes || []) visit(node);
  return ids;
}

export function courseCompleted(course) {
  return completedCourseIds().has(String(course.kchId));
}
