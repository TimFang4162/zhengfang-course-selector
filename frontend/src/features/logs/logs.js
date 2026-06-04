import { apiPostEmpty } from "../../api/client.js";
import { escapeHtml } from "../../shared/utils.js";

export function createLogsFeature({ state }) {
function renderLogs(items) {
  const list = document.getElementById("log-list");
  const shouldStickToBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
  for (const item of items) {
    upsertLogEntry(item, list);
    state.logSince = Math.max(state.logSince, item.id);
  }
  while (list.children.length > 600) {
    const first = list.firstElementChild;
    if (!first) break;
    state.logDomByKey.delete(first.dataset.logKey);
    list.removeChild(first);
  }
  if (shouldStickToBottom || items.length) list.scrollTop = list.scrollHeight;
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

function upsertLogEntry(item, list = document.getElementById("log-list")) {
  const key = logEntryKey(item);
  const existing = state.logEntries.get(key) || {};
  const merged = { ...existing, ...item, id: item.id ?? existing.id };
  state.logEntries.set(key, merged);

  let line = state.logDomByKey.get(key);
  if (!line) {
    line = document.createElement("div");
    line.dataset.logKey = key;
    const timestamp = document.createElement("span");
    timestamp.className = "log-time";
    const message = document.createElement("span");
    message.className = "log-message";
    line.append(timestamp, message);
    line.addEventListener("click", () => openLogDetail(key));
    list.appendChild(line);
    state.logDomByKey.set(key, line);
  }

  line.className = `log-line${merged.type === "request" ? " is-request" : ""}${merged.detail || merged.type === "request" ? " is-clickable" : ""}${merged.phase === "start" ? " is-pending" : ""}`;
  line.querySelector(".log-time").textContent = `[${merged.timestamp}]`;
  line.querySelector(".log-message").textContent = describeLogEntry(merged);
}

function formatLogDetailBlock(value) {
  return escapeHtml(typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function openLogDetail(logKey) {
  const entry = state.logEntries.get(logKey);
  if (!entry) return;
  document.getElementById("log-detail-title").textContent = entry.type === "request"
    ? `${entry.method || "HTTP"} ${entry.path || ""}`
    : `日志 #${entry.id}`;
  if (entry.type === "request") {
    const detail = entry.detail || {};
    document.getElementById("log-detail-content").innerHTML = `
      <div class="class-meta"><div>时间</div><div>${escapeHtml(entry.timestamp)}</div></div>
      <div class="class-meta"><div>状态</div><div>${escapeHtml(String(entry.status ?? "ERROR"))}</div></div>
      <div class="class-meta"><div>耗时</div><div>${escapeHtml(String(entry.ms ?? 0))}ms</div></div>
      <div class="class-meta"><div>URL</div><div>${escapeHtml(detail.url || "")}</div></div>
      <div class="class-meta"><div>请求头</div><div><pre class="log-detail-pre">${formatLogDetailBlock(detail.requestHeaders || {})}</pre></div></div>
      <div class="class-meta"><div>请求体</div><div><pre class="log-detail-pre">${formatLogDetailBlock(detail.requestBody || "")}</pre></div></div>
      <div class="class-meta"><div>响应头</div><div><pre class="log-detail-pre">${formatLogDetailBlock(detail.responseHeaders || {})}</pre></div></div>
      <div class="class-meta"><div>响应体</div><div><pre class="log-detail-pre">${formatLogDetailBlock(detail.responseBody || detail.error || "")}</pre></div></div>
    `;
  } else {
    document.getElementById("log-detail-content").innerHTML = `
      <div class="class-meta"><div>时间</div><div>${escapeHtml(entry.timestamp)}</div></div>
      <div class="class-meta"><div>消息</div><div><pre class="log-detail-pre">${formatLogDetailBlock(entry.message || "")}</pre></div></div>
    `;
  }
  document.getElementById("log-detail-modal").classList.remove("hidden");
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
    document.getElementById("log-list").innerHTML = "";
    state.logSince = 0;
    state.logEntries.clear();
    state.logDomByKey.clear();
  });
}

return { renderLogs, openLogDetail, connectLogStream, clearLogs };
}
