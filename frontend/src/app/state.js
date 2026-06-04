export const state = {
  bootstrap: null,
  categories: [],
  categoryCourses: {},
  courseClasses: {},
  expandedCategories: new Set(),
  expandedCourses: new Set(),
  loadingCategories: new Set(),
  loadingCourses: new Set(),
  filters: { conflict: false, credit: false },
  search: { query: "", scope: "all" },
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
  academicFilters: {
    suggestedTerm: "all",
    statusType: "all",
    courseNature: "all",
    nodeStatus: "all",
  },
  displayWeek: 1,
  activeTab: "tree",
  logSince: 0,
  selectedCell: null,
  modalClass: null,
  grabDraft: null,
  grabEditor: null,
  rawContentEditor: null,
  rawContentMode: "html",
  logSource: null,
  logEntries: new Map(),
  logDomByKey: new Map(),
};

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
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (state.filters.conflict && classConflicts(item)) return true;
  return false;
}

export function classConflictMuted(item) {
  return state.filters.conflict && classConflicts(item) && !isSelectedClass(item);
}

export function courseMuted(categoryId, course) {
  if (isSelectedCourse(course)) return false;
  if (state.filters.credit && courseExceedsCredit(course)) return true;
  if (!state.filters.conflict) return false;
  const classItems = state.courseClasses[`${categoryId}:${course.kchId}`];
  if (!classItems || !classItems.length) return false;
  return classItems.every((item) => classMuted(course, item));
}
