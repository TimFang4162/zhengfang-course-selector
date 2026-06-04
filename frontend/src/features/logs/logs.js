import { apiPostEmpty } from "../../api/client.js";

export function createLogsFeature({ state }) {
function renderLogs(items) {
  for (const item of items) {
    upsertLogEntry(item);
    state.logSince = Math.max(state.logSince, item.id);
  }
}

function logEntryKey(item) {
  return item.requestId || `log-${item.id}`;
}

function describeLogEntry(item) {
  if (item.type === "request") {
    if (item.phase === "start") return `${item.method || "HTTP"} ${item.path || ""} (...)`;
    const status = item.status ?? "ERR";
    const cost = item.ms ?? 0;
    return `${item.method || "HTTP"} ${item.path || ""} (${status}, ${cost}ms)`;
  }
  return item.message;
}

function upsertLogEntry(item) {
  const key = logEntryKey(item);
  const existing = state.logEntries.get(key) || {};
  const merged = { ...existing, ...item, id: item.id ?? existing.id };
  state.logEntries.set(key, merged);
  const index = state.logItems.findIndex((entry) => logEntryKey(entry) === key);
  if (index >= 0) {
    state.logItems[index] = merged;
  } else {
    state.logItems.push(merged);
    if (state.logItems.length > 600) {
      const removed = state.logItems.shift();
      if (removed) state.logEntries.delete(logEntryKey(removed));
    }
  }
}

function formatLogDetailBlock(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function openLogDetail(logKey) {
  const entry = state.logEntries.get(logKey);
  if (!entry) return;
  state.logDetailKey = logKey;
}

function closeLogDetail() {
  state.logDetailKey = null;
}

function connectLogStream() {
  if (state.logSource) state.logSource.close();
  const source = new EventSource("/api/logs/stream");
  source.addEventListener("log", (event) => {
    try {
      renderLogs([JSON.parse(event.data)]);
    } catch (error) {
      console.error(error);
    }
  });
  source.addEventListener("error", () => {
    source.close();
    if (state.logSource === source) {
      state.logSource = null;
      window.setTimeout(connectLogStream, 1000);
    }
  });
  state.logSource = source;
}

function clearLogs() {
  return apiPostEmpty("/api/logs/clear").then(() => {
    state.logSince = 0;
    state.logItems = [];
    state.logEntries.clear();
    state.logDomByKey.clear();
  });
}

return { renderLogs, openLogDetail, closeLogDetail, connectLogStream, clearLogs, describeLogEntry, formatLogDetailBlock, logEntryKey };
}
