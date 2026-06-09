export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function cx(...args) {
  let result = "";
  for (const arg of args) {
    if (typeof arg === "string") {
      if (arg) { if (result) result += " "; result += arg; }
    } else if (arg) {
      for (const [cls, cond] of Object.entries(arg)) {
        if (cond) { if (result) result += " "; result += cls; }
      }
    }
  }
  return result;
}

export function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatWeekRanges(weeks) {
  const ordered = [...new Set(weeks)].sort((a, b) => a - b);
  const parts = [];
  let start = ordered[0];
  let end = ordered[0];
  for (const week of ordered.slice(1)) {
    if (week === end + 1) {
      end = week;
      continue;
    }
    parts.push(start === end ? `第${start}周` : `第${start}-${end}周`);
    start = week;
    end = week;
  }
  parts.push(start === end ? `第${start}周` : `第${start}-${end}周`);
  return parts.join(", ");
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function formatDebugJson(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch (error) {
    return String(data ?? "");
  }
}
