import { state } from "../../app/state.js";
import { escapeHtml } from "../../shared/utils.js";

export function createActivityFeature({ state, getApp }) {
  function renderActivities() {
    const tbody = document.getElementById("activity-list");
    if (!tbody) return;
    if (!state.activities.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="dim">暂无活动</td></tr>';
      return;
    }
    tbody.innerHTML = state.activities.map((item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.status)}</td>
        <td>${escapeHtml(item.progress)} <button type="button" class="activity-more" data-task-id="${escapeHtml(item.id)}">⋯</button></td>
      </tr>
    `).join("");
    tbody.querySelectorAll(".activity-more").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        getApp().grab.openActivityTaskMenu(button.dataset.taskId, button);
      });
    });
  }

  function upsertActivity(id, patch) {
    const now = new Date().toLocaleTimeString();
    const existing = state.activities.find((item) => item.id === id);
    if (existing) Object.assign(existing, patch, { updatedAt: now });
    else state.activities.unshift({ id, name: id, status: "等待", progress: "-", updatedAt: now, ...patch });
    renderActivities();
  }

  return { upsertActivity, renderActivities };
}
