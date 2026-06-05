import { apiGet, apiPost } from "../../api/client.js";
import { isSelectedClass } from "../../app/state.js";
import { openFloatingMenu } from "../../components/FloatingMenu.jsx";
import { maxWeek } from "../../shared/constants.js";

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
    state.timetableVersion += 1;
  }

  function renderTimetableDetailAll() {
    state.selectedCell = null;
    renderTimetable();
  }

  function renderTimetableCellDetail(day, jieci) {
    state.selectedCell = { day, jieci };
    renderTimetable();
  }

  function showCourseDetail(entry) {
    state.modalClass = { entry };
  }

  function openSelectedCourseMenu(index, anchor) {
    const app = getApp();
    const entry = state.timetable.entries[index];
    if (!entry) return;
    openFloatingMenu(anchor, [
      { label: "详细信息", action: () => showCourseDetail(entry) },
      { label: "退课", action: () => withdrawSelectedEntry(entry).catch(app.showError) },
    ]);
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

  async function chooseOrWithdrawClass(categoryId, course, item) {
    const app = getApp();
    const selected = isSelectedClass(item);
    const payload = selected
      ? { kchId: item.kchId, doJxbId: item.doJxbId }
      : { categoryId, kchId: item.kchId, doJxbId: item.doJxbId, courseName: course.courseName };
    const result = await apiPost(selected ? "/api/withdraw" : "/api/choose", payload);
    if (!result.ok) throw new Error(result.message || (selected ? "退课失败" : "选课失败"));
    state.timetable = result.timetable;
    renderTimetable();
    renderTimetableDetailAll();
    app.tree.renderTree();
  }

  function openClassModal(categoryId, course, item) {
    state.modalClass = { categoryId, course, item };
    state.courseDetail = null;
    state.teacherDetail = null;
  }

  function openCourseModal(categoryId, course) {
    state.modalClass = { categoryId, course };
    state.courseDetail = null;
    state.teacherDetail = null;
  }

  async function loadCourseDetail(kchId) {
    if (!kchId || state.courseDetail) return;
    state.courseDetail = { _loading: true };
    try {
      const res = await apiGet(`/api/course-detail?kch_id=${encodeURIComponent(kchId)}`);
      state.courseDetail = res.detail || {};
    } catch {
      state.courseDetail = {};
    }
  }

  async function loadTeacherDetail(jghId, kchId) {
    if (!jghId || !kchId || state.teacherDetail) return;
    state.teacherDetail = { _loading: true };
    try {
      const res = await apiGet(`/api/teacher-detail?jgh_id=${encodeURIComponent(jghId)}&kch_id=${encodeURIComponent(kchId)}`);
      state.teacherDetail = res.detail || {};
    } catch {
      state.teacherDetail = {};
    }
  }

  function closeClassModal() {
    state.modalClass = null;
    state.courseDetail = null;
    state.teacherDetail = null;
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
    if (!item) return;
    try {
      await chooseOrWithdrawClass(categoryId, course, item);
      closeClassModal();
    } catch (error) {
      app.showError(error);
    }
  }

  return {
    renderTimetable,
    renderTimetableDetailAll,
    renderTimetableCellDetail,
    entriesForCell,
    showCourseDetail,
    openSelectedCourseMenu,
    withdrawSelectedEntry,
    chooseOrWithdrawClass,
    openClassModal,
    openCourseModal,
    closeClassModal,
    executeModalAction,
    loadCourseDetail,
    loadTeacherDetail,
  };
}
