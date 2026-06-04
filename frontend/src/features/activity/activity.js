export function createActivityFeature({ state, getApp }) {
  function renderActivities() {
    return state.activities;
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
