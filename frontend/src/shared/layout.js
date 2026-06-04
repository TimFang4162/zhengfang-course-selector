import { state } from "../app/state.js";
import { ACTIVITY_HEIGHT_KEY, DETAIL_HEIGHT_KEY, LEFT_WIDTH_KEY, SIDEBAR_COLLAPSED_KEY } from "./constants.js";
import { clamp } from "./utils.js";

export function applyStoredLayout() {
  const storedLeftWidth = Number(window.localStorage.getItem(LEFT_WIDTH_KEY) || 0);
  const storedDetailHeight = Number(window.localStorage.getItem(DETAIL_HEIGHT_KEY) || 0);
  const storedActivityHeight = Number(window.localStorage.getItem(ACTIVITY_HEIGHT_KEY) || 0);
  if (storedLeftWidth > 0) {
    document.documentElement.style.setProperty("--left-pane-width", `${storedLeftWidth}px`);
  }
  if (storedDetailHeight > 0) {
    document.documentElement.style.setProperty("--detail-height", `${storedDetailHeight}px`);
  }
  if (storedActivityHeight > 0) {
    document.documentElement.style.setProperty("--activity-height", `${storedActivityHeight}px`);
  }
  state.sidebarCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
}

export function constrainLayoutVars() {
  const mainLayout = document.querySelector(".main-layout");
  const timetablePanel = document.getElementById("tab-timetable");
  const rightPane = document.querySelector(".right-pane");
  if (mainLayout && window.innerWidth > 960) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--left-pane-width")) || mainLayout.clientWidth * 0.65;
    const next = clamp(current, 360, Math.max(420, mainLayout.clientWidth - 280 - 6));
    document.documentElement.style.setProperty("--left-pane-width", `${next}px`);
  }
  if (timetablePanel) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--detail-height")) || 150;
    const next = clamp(current, 110, Math.max(110, Math.min(window.innerHeight * 0.5, timetablePanel.clientHeight - 120)));
    document.documentElement.style.setProperty("--detail-height", `${next}px`);
  }
  if (rightPane) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--activity-height")) || 220;
    const next = clamp(current, 120, Math.max(120, rightPane.clientHeight - 120));
    document.documentElement.style.setProperty("--activity-height", `${next}px`);
  }
}

export function bindSplitters() {
  const mainSplitter = document.getElementById("main-splitter");
  const detailSplitter = document.getElementById("detail-splitter");
  const activitySplitter = document.getElementById("activity-splitter");

  if (mainSplitter) {
    mainSplitter.addEventListener("pointerdown", (event) => {
      if (window.innerWidth <= 960) return;
      event.preventDefault();
      mainSplitter.classList.add("is-dragging");
      const onMove = (moveEvent) => {
        const maxWidth = Math.max(420, window.innerWidth - 280 - 6);
        const next = clamp(moveEvent.clientX, 360, maxWidth);
        document.documentElement.style.setProperty("--left-pane-width", `${next}px`);
        window.localStorage.setItem(LEFT_WIDTH_KEY, String(next));
      };
      const onUp = () => {
        mainSplitter.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  if (detailSplitter) {
    detailSplitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      detailSplitter.classList.add("is-dragging");
      const panel = document.getElementById("tab-timetable");
      const onMove = (moveEvent) => {
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const next = clamp(rect.bottom - moveEvent.clientY, 110, Math.max(110, Math.min(window.innerHeight * 0.5, panel.clientHeight - 120)));
        document.documentElement.style.setProperty("--detail-height", `${next}px`);
        window.localStorage.setItem(DETAIL_HEIGHT_KEY, String(next));
      };
      const onUp = () => {
        detailSplitter.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  if (activitySplitter) {
    activitySplitter.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      activitySplitter.classList.add("is-dragging");
      const pane = document.querySelector(".right-pane");
      const onMove = (moveEvent) => {
        if (!pane) return;
        const rect = pane.getBoundingClientRect();
        const next = clamp(rect.bottom - moveEvent.clientY, 120, Math.max(120, pane.clientHeight - 120));
        document.documentElement.style.setProperty("--activity-height", `${next}px`);
        window.localStorage.setItem(ACTIVITY_HEIGHT_KEY, String(next));
      };
      const onUp = () => {
        activitySplitter.classList.remove("is-dragging");
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }

  window.addEventListener("resize", constrainLayoutVars);
}
