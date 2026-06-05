import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import { apiGet, apiPost } from "../../api/client.js";
import { openFloatingMenu } from "../../components/FloatingMenu.jsx";
import { defaultGrabExpression, grabSymbolDocs, grabSymbols, validateGrabExpression } from "./expression.js";
import { grabContextPayload } from "./preview.js";

export function createGrabFeature({ state, getApp }) {
  let previewTimer = null;

  function scheduleGrabPreview() {
    if (previewTimer) window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      previewTimer = null;
      refreshGrabPreview().catch(getApp().showError);
    }, 350);
  }

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
      scheduleGrabPreview();
    });
    textarea.classList.add("monaco-enabled");
  }

  function closeGrabModal() {
    state.grabDraft = null;
  }

  function openTreeMoreMenu(anchor, context) {
    const app = getApp();
    const items = [];
    if (context.type === "course") {
      items.push(
        { label: "显示详情", action: () => app.timetable.openCourseModal(context.category.id, context.course) },
        { label: "刷新教学班", action: () => app.tree.refreshCourseClasses(context.category.id, context.course.kchId).catch(app.showError) },
      );
    }
    if (context.type === "class") {
      items.push(
        { label: "显示详情", action: () => app.timetable.openClassModal(context.category.id, context.course, context.classItem) },
        { label: isClassSelected(context.classItem) ? "退选" : "选课", action: () => app.timetable.chooseOrWithdrawClass(context.category.id, context.course, context.classItem).catch(app.showError) },
      );
    }
    openFloatingMenu(anchor, items, 160);
  }

  function isClassSelected(item) {
    return (state.timetable.selectedClassIds || []).includes(item.jxbId) || (state.timetable.selectedDoJxbIds || []).includes(item.doJxbId);
  }

  function grabStatusLabel(status) {
    const labels = {
      waiting: "待启动",
      running: "运行中",
      stopped: "已停止",
      timeout: "已超时",
      failed: "失败",
      success: "成功",
    };
    return labels[status] || status || "未知";
  }

  function grabProgressText(task) {
    const debug = task.lastTickDebug || {};
    const base = `第 ${task.tickCount || 0} 轮，成功 ${task.successCount || 0} 次，候选 ${task.candidateCourseCount || 0} 门/${task.candidateClassCount || 0} 班`;
    if (task.status === "waiting") return `待启动，候选 ${task.candidateCourseCount || 0} 门/${task.candidateClassCount || 0} 班`;
    if (!task.tickCount) return `${base}，等待首次扫描`;
    if (task.status === "running") return `${base}，上轮检查 ${debug.checkedClassCount ?? 0} 班，提交 ${debug.attemptedCount ?? 0} 次`;
    return `${base}，${task.progress || grabStatusLabel(task.status)}`;
  }

  function openGrabModal(context) {
    if (context?.type !== "selection") throw new Error("抢课任务只能从课程树选择列表创建");
    state.grabDraft = context;
    setGrabExpressionValue(defaultGrabExpression(context));
    state.grabPreviewData = null;
    state.grabStatusText = "";
    state.grabStatusClass = "grab-status";
    if (state.grabEditor) state.grabEditor.layout();
    refreshGrabPreview().catch(getApp().showError);
  }

  function openGrabModalFromSelection() {
    const selection = getApp().tree.buildSelectionRule();
    if (!selection.includes.length) {
      window.alert("请先在课程树中至少显式选中一个大类、课程或教学班。");
      return;
    }
    openGrabModal({ type: "selection", selection });
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
    state.grabStatusText = `语法正确，扫描候选 ${data.matches.length} 项，候选课程 ${candidateCourseText} 门，候选教学班 ${candidateClassText} 个，预计每轮扫描 ${requestText} 个请求`;
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
      status: grabStatusLabel(task.status),
      progress: grabProgressText(task),
    });
    closeGrabModal();
  }

  function applyGrabTasksPayload(data) {
    const app = getApp();
    const items = data?.items || [];
    for (const task of items) {
      state.grabTasks[task.id] = task;
      app.activity.upsertActivity(task.id, {
        name: task.name,
        status: grabStatusLabel(task.status),
        progress: grabProgressText(task),
      });
    }
    if (data?.tree) {
      app.tree.applyTreeState(data.tree);
      app.tree.renderTree();
    }
    if (data?.timetable) {
      state.timetable = data.timetable;
      app.timetable.renderTimetable();
      app.timetable.renderTimetableDetailAll();
    }
  }

  async function pollGrabTasks() {
    try {
      const data = await apiGet("/api/grab/tasks");
      applyGrabTasksPayload(data);
    } catch (error) {
      console.error(error);
    }
  }

  function connectEventStream() {
    if (state.eventSource) state.eventSource.close();
    const source = new EventSource("/api/events");
    const applySnapshot = (payload) => {
      if (payload.grabTasks) applyGrabTasksPayload(payload.grabTasks);
      if (payload.tree) {
        getApp().tree.applyTreeState(payload.tree);
        getApp().tree.renderTree();
      }
      if (payload.timetable) {
        state.timetable = payload.timetable;
        getApp().timetable.renderTimetable();
        getApp().timetable.renderTimetableDetailAll();
      }
    };
    source.addEventListener("snapshot", (event) => {
      try {
        applySnapshot(JSON.parse(event.data));
      } catch (error) {
        console.error(error);
      }
    });
    source.addEventListener("grab.tasks", (event) => {
      try {
        applyGrabTasksPayload(JSON.parse(event.data));
      } catch (error) {
        console.error(error);
      }
    });
    source.addEventListener("error", () => {
      source.close();
      if (state.eventSource === source) {
        state.eventSource = null;
        window.setTimeout(connectEventStream, 1000);
      }
    });
    state.eventSource = source;
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
    openGrabModalFromSelection,
    closeGrabModal,
    refreshGrabPreview,
    scheduleGrabPreview,
    loadGrabMissing,
    confirmGrabExpression,
    pollGrabTasks,
    connectEventStream,
    openActivityTaskMenu,
    showGrabTaskDetail,
    closeGrabTaskDetail,
    grabStatusLabel,
    grabProgressText,
  };
}
