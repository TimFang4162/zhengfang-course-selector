import { createMutable } from "solid-js/store";

export const state = createMutable({
  bootstrap: null,
  auth: {
    loginVisible: true,
    loginStatus: "",
    baseUrl: "",
    customBaseUrl: "",
    disableSslVerify: true,
    useSaved: false,
    studentNumber: "",
    password: "",
    saveCredentials: false,
  },
  speedModalVisible: false,
  speedRows: [],
  floatingMenu: null,
  openMenu: null,
  categories: [],
  categoryCourses: {},
  courseClasses: {},
  expandedCategories: new Set(),
  expandedCourses: new Set(),
  loadingCategories: new Set(),
  loadingCourses: new Set(),
  filters: { conflict: false, credit: false, completed: false },
  search: { query: "", scope: "all" },
  treeVersion: 0,
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
  academicStatus: null,
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
  grabDraft: null,
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

export function classMuted(course, item) {
  if (isSelectedClass(item)) return false;
  if (state.filters.completed && courseCompleted(course)) return true;
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (state.filters.conflict && classConflicts(item)) return true;
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
  const classItems = state.courseClasses[`${categoryId}:${course.kchId}`];
  if (!classItems || !classItems.length) return false;
  return classItems.every((item) => classMuted(course, item));
}

export function completedCourseIds() {
  const ids = new Set();
  const visit = (node) => {
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
