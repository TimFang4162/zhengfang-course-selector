import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { apiGet, apiPost } from "../../api/client.js";
import { openFloatingMenu } from "../../components/FloatingMenu.jsx";
import { defaultGrabExpression, grabSymbolDocs, grabSymbols, validateGrabExpression } from "./expression.js";
import { grabContextPayload } from "./preview.js";

export function createGrabFeature({ state, getApp }) {
  function getGrabExpressionValue() {
    if (state.grabEditor) return state.grabEditor.getValue();
    return state.grabExpression;
  }

  function setGrabExpressionValue(value) {
    state.grabExpression = value;
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
    state.grabEditor.onDidChangeModelContent(() => {
      state.grabExpression = state.grabEditor.getValue();
      refreshGrabPreview().catch(getApp().showError);
    });
    textarea.classList.add("monaco-enabled");
  }

  function closeGrabModal() {
    state.grabDraft = null;
  }

  function openTreeMoreMenu(anchor, context) {
    openFloatingMenu(anchor, [{ label: "添加抢课任务", action: () => openGrabModal(context) }], 160);
  }

  function openGrabModal(context) {
    state.grabDraft = context;
    setGrabExpressionValue(defaultGrabExpression(context));
    state.grabPreviewData = null;
    state.grabStatusText = "";
    state.grabStatusClass = "grab-status";
    if (state.grabEditor) state.grabEditor.layout();
    refreshGrabPreview().catch(getApp().showError);
  }

  async function refreshGrabPreview() {
    const expression = getGrabExpressionValue().trim();
    const validation = validateGrabExpression(expression || "true");
    if (!validation.ok) {
      state.grabStatusText = `语法错误: ${validation.error}`;
      state.grabStatusClass = "grab-status is-error";
      state.grabPreviewData = null;
      return;
    }
    const data = await apiPost("/api/grab/preview", { context: grabContextPayload(state.grabDraft), expression: expression || "True" });
    const candidateCourseText = data.ready ? String(data.candidateCourseCount || 0) : "?";
    const candidateClassText = data.ready ? String(data.candidateClassCount || 0) : "?";
    const requestText = data.ready ? String(data.estimatedRequestsPerTick || 0) : "?";
    state.grabStatusText = `语法正确，匹配 ${data.matches.length} 项，候选课程 ${candidateCourseText} 门，候选教学班 ${candidateClassText} 个，预计每轮扫描 ${requestText} 个请求`;
    state.grabStatusClass = "grab-status is-ok";
    state.grabPreviewData = data;
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
    const result = await apiPost("/api/grab/tasks", {
      context: grabContextPayload(state.grabDraft),
      expression: getGrabExpressionValue().trim() || "True",
      startMode: state.grabStartMode,
      startAt: state.grabStartMode === "scheduled" && state.grabStartAt ? new Date(state.grabStartAt).toISOString() : null,
      tickInterval: Number(state.grabTickInterval || 3),
      timeoutSeconds: Number(state.grabTimeout || 600),
      stopOnFirstSuccess: state.grabStopSuccess,
      errorPolicy: state.grabErrorPolicy,
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
    const items = [
      { label: "启动", action: () => apiPost("/api/grab/tasks/start", { id: taskId }).then(pollGrabTasks).catch(app.showError) },
      { label: "停止", action: () => apiPost("/api/grab/tasks/stop", { id: taskId }).then(pollGrabTasks).catch(app.showError) },
    ];
    if (task) items.unshift({ label: "详情", action: () => showGrabTaskDetail(task) });
    openFloatingMenu(anchor, items);
  }

  function showGrabTaskDetail(task) {
    state.grabTaskDetail = task;
  }

  function closeGrabTaskDetail() {
    state.grabTaskDetail = null;
  }

  return {
    initGrabMonaco,
    openTreeMoreMenu,
    openGrabModal,
    closeGrabModal,
    refreshGrabPreview,
    loadGrabMissing,
    confirmGrabExpression,
    pollGrabTasks,
    openActivityTaskMenu,
    showGrabTaskDetail,
    closeGrabTaskDetail,
  };
}
