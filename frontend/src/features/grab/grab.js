import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { apiGet, apiPost } from "../../api/client.js";
import { escapeHtml } from "../../shared/utils.js";
import { defaultGrabExpression, grabSymbolDocs, grabSymbols, validateGrabExpression } from "./expression.js";
import { grabContextPayload, renderGrabPreviewTree } from "./preview.js";

export function createGrabFeature({ state, getApp }) {
  function getGrabExpressionValue() {
    if (state.grabEditor) return state.grabEditor.getValue();
    return document.getElementById("grab-expression").value;
  }

  function setGrabExpressionValue(value) {
    document.getElementById("grab-expression").value = value;
    if (state.grabEditor) state.grabEditor.setValue(value);
  }

  function initGrabMonaco() {
    const monacoRoot = document.getElementById("grab-monaco");
    const textarea = document.getElementById("grab-expression");
    if (!monacoRoot || state.grabEditor) return;
    monaco.languages.register({ id: "grabexpr" });
    monaco.languages.setMonarchTokensProvider("grabexpr", {
      tokenizer: {
        root: [
          [/\b(and|or|not|in)\b/, "keyword"],
          [/\b(course|class|teachers|conflicts|has_capacity)\b/, "variable"],
          [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/, "string"],
          [/\b\d+(\.\d+)?\b/, "number"],
          [/[=!<>]=?|[()]/, "operator"],
        ],
      },
    });
    monaco.languages.registerCompletionItemProvider("grabexpr", {
      provideCompletionItems: () => ({
        suggestions: grabSymbols.map((label) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Field,
          insertText: label,
          detail: grabSymbolDocs[label] || "抢课表达式字段",
        })).concat(["and", "or", "not", "in"].map((label) => ({
          label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: label,
        }))),
      }),
    });
    monaco.languages.registerHoverProvider("grabexpr", {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const line = model.getLineContent(position.lineNumber);
        const prefix = line.slice(0, word.startColumn - 1).match(/[A-Za-z_][\w.]*$/)?.[0] || "";
        const key = prefix ? `${prefix}.${word.word}` : word.word;
        const doc = grabSymbolDocs[key] || grabSymbolDocs[word.word];
        if (!doc) return null;
        return { contents: [{ value: `\`${key}\`` }, { value: doc }] };
      },
    });
    state.grabEditor = monaco.editor.create(monacoRoot, {
      value: textarea.value,
      language: "grabexpr",
      theme: "vs-dark",
      minimap: { enabled: false },
      lineNumbers: "off",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      automaticLayout: true,
      fontSize: 13,
      tabSize: 2,
    });
    state.grabEditor.onDidChangeModelContent(() => refreshGrabPreview().catch(getApp().showError));
    textarea.classList.add("monaco-enabled");
  }

  function closeGrabModal() {
    state.grabDraft = null;
    document.getElementById("grab-modal").classList.add("hidden");
  }

  function openTreeMoreMenu(anchor, context) {
    const menu = document.createElement("div");
    menu.className = "floating-menu";
    menu.innerHTML = '<button type="button" data-action="grab">添加抢课任务</button>';
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.right - 160)}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(menu);
    const close = () => menu.remove();
    menu.addEventListener("click", (event) => {
      if (event.target.dataset.action === "grab") openGrabModal(context);
      close();
    });
    window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
  }

  function openGrabModal(context) {
    state.grabDraft = context;
    document.getElementById("grab-title").textContent = `添加抢课任务 / ${context.type}`;
    setGrabExpressionValue(defaultGrabExpression(context));
    document.getElementById("grab-hints").textContent = `可用字段: ${grabSymbols.join(", ")}`;
    document.getElementById("grab-modal").classList.remove("hidden");
    if (state.grabEditor) state.grabEditor.layout();
    refreshGrabPreview().catch(getApp().showError);
  }

  async function refreshGrabPreview() {
    const expression = getGrabExpressionValue().trim();
    const status = document.getElementById("grab-status");
    const preview = document.getElementById("grab-preview-list");
    const validation = validateGrabExpression(expression || "true");
    if (!validation.ok) {
      status.textContent = `语法错误: ${validation.error}`;
      status.className = "grab-status is-error";
      preview.innerHTML = "";
      return;
    }
    const data = await apiPost("/api/grab/preview", { context: grabContextPayload(state.grabDraft), expression: expression || "True" });
    const candidateCourseText = data.ready ? String(data.candidateCourseCount || 0) : "?";
    const candidateClassText = data.ready ? String(data.candidateClassCount || 0) : "?";
    const requestText = data.ready ? String(data.estimatedRequestsPerTick || 0) : "?";
    status.textContent = `语法正确，匹配 ${data.matches.length} 项，候选课程 ${candidateCourseText} 门，候选教学班 ${candidateClassText} 个，预计每轮扫描 ${requestText} 个请求`;
    status.className = "grab-status is-ok";
    const loadButton = data.ready ? "" : '<button type="button" id="grab-load-missing" class="grab-load-missing">加载缺失数据</button>';
    preview.innerHTML = `${loadButton}${renderGrabPreviewTree(data)}`;
    const button = document.getElementById("grab-load-missing");
    if (button) button.addEventListener("click", () => loadGrabMissing(data.missing).catch(getApp().showError));
  }

  async function loadGrabMissing(missing) {
    const app = getApp();
    app.activity.upsertActivity("grab-preview-load", { name: "加载抢课预览缺失数据", status: "运行中", progress: "加载中" });
    const result = await apiPost("/api/grab/load-missing", { missing });
    app.tree.applyTreeState(result.tree);
    app.tree.renderTree();
    app.activity.upsertActivity("grab-preview-load", { name: "加载抢课预览缺失数据", status: "完成", progress: "已同步课程树" });
    await refreshGrabPreview();
  }

  async function confirmGrabExpression() {
    const app = getApp();
    await refreshGrabPreview();
    const startMode = document.getElementById("grab-start-mode").value;
    const startAtValue = document.getElementById("grab-start-at").value;
    const result = await apiPost("/api/grab/tasks", {
      context: grabContextPayload(state.grabDraft),
      expression: getGrabExpressionValue().trim() || "True",
      startMode,
      startAt: startMode === "scheduled" && startAtValue ? new Date(startAtValue).toISOString() : null,
      tickInterval: Number(document.getElementById("grab-tick-interval").value || 3),
      timeoutSeconds: Number(document.getElementById("grab-timeout").value || 600),
      stopOnFirstSuccess: document.getElementById("grab-stop-success").checked,
      errorPolicy: document.getElementById("grab-error-policy").value,
    });
    const task = result.task;
    app.activity.upsertActivity(task.id, {
      name: task.name,
      status: task.status,
      progress: `${task.progress} / ${task.candidateCourseCount}门课程 ${task.candidateClassCount}个教学班`,
    });
    closeGrabModal();
  }

  async function pollGrabTasks() {
    const app = getApp();
    try {
      const data = await apiGet("/api/grab/tasks");
      const hasActiveTask = (data.items || []).some((task) => task.status === "running");
      for (const task of data.items || []) {
        state.grabTasks[task.id] = task;
        app.activity.upsertActivity(task.id, {
          name: task.name,
          status: task.status,
          progress: `${task.progress} / tick ${task.tickCount} / 成功 ${task.successCount}`,
        });
      }
      if (hasActiveTask) await app.tree.syncTreeState();
    } catch (error) {
      console.error(error);
    } finally {
      window.setTimeout(pollGrabTasks, 2000);
    }
  }

  function openActivityTaskMenu(taskId, anchor) {
    const app = getApp();
    const task = state.grabTasks[taskId];
    if (!task) return;
    const menu = document.createElement("div");
    menu.className = "floating-menu";
    menu.innerHTML = `
      <button type="button" data-action="detail">详情</button>
      <button type="button" data-action="start">启动</button>
      <button type="button" data-action="stop">停止</button>
    `;
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.right - 132)}px`;
    menu.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(menu);
    const close = () => menu.remove();
    menu.addEventListener("click", (event) => {
      const action = event.target.dataset.action;
      if (action === "detail") showGrabTaskDetail(task);
      if (action === "start") apiPost("/api/grab/tasks/start", { id: taskId }).then(pollGrabTasks).catch(app.showError);
      if (action === "stop") apiPost("/api/grab/tasks/stop", { id: taskId }).then(pollGrabTasks).catch(app.showError);
      close();
    });
    window.setTimeout(() => document.addEventListener("click", close, { once: true }), 0);
  }

  function showGrabTaskDetail(task) {
    document.getElementById("task-title").textContent = `${task.name} / ${task.id}`;
    document.getElementById("task-content").innerHTML = `
      <div class="class-meta"><div>状态</div><div>${escapeHtml(task.status)}</div></div>
      <div class="class-meta"><div>进度</div><div>${escapeHtml(task.progress)}</div></div>
      <div class="class-meta"><div>表达式</div><div><code>${escapeHtml(task.expression || "")}</code></div></div>
      <div class="class-meta"><div>启动</div><div>${escapeHtml(task.startMode || "")} ${task.startAt ? new Date(task.startAt * 1000).toLocaleString() : ""}</div></div>
      <div class="class-meta"><div>Tick/Timeout</div><div>${escapeHtml(task.tickInterval)}s / ${escapeHtml(task.timeoutSeconds)}s</div></div>
      <div class="class-meta"><div>错误处理</div><div>${escapeHtml(task.errorPolicy || "")}</div></div>
      <div class="class-meta"><div>停止条件</div><div>${task.stopOnFirstSuccess ? "成功选到课程后停止" : "不自动停止"}</div></div>
      <div class="class-meta"><div>候选</div><div>${escapeHtml(task.candidateCourseCount)} 门课程 / ${escapeHtml(task.candidateClassCount)} 个教学班</div></div>
      <div class="class-meta"><div>最近错误</div><div>${escapeHtml(task.lastError || "-")}</div></div>
      <div class="class-meta"><div>最近结果</div><div>${escapeHtml(task.lastResult || "-")}</div></div>
      <div class="class-meta"><div>事件</div><div>${(task.events || []).map((item) => `${escapeHtml(item.time)} ${escapeHtml(item.message)}`).join("<br>") || "-"}</div></div>
    `;
    document.getElementById("task-modal").classList.remove("hidden");
  }

  return {
    initGrabMonaco,
    openTreeMoreMenu,
    openGrabModal,
    closeGrabModal,
    refreshGrabPreview,
    confirmGrabExpression,
    pollGrabTasks,
    openActivityTaskMenu,
    showGrabTaskDetail,
  };
}
