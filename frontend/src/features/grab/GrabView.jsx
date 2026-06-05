import { For, Show } from "solid-js";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { formatDebugJson } from "../../shared/utils.js";
import { grabSymbols } from "./expression.js";

function groupMatches(matches) {
  const byCategory = new Map();
  for (const item of matches || []) {
    const categoryId = String(item.category.id);
    if (!byCategory.has(categoryId)) byCategory.set(categoryId, { category: item.category, courses: [] });
    const categoryBucket = byCategory.get(categoryId);
    let courseBucket = categoryBucket.courses.find((bucket) => String(bucket.course.kchId) === String(item.course.kchId));
    if (!courseBucket) {
      courseBucket = { course: item.course, classes: [] };
      categoryBucket.courses.push(courseBucket);
    }
    courseBucket.classes.push(item.classItem);
  }
  return [...byCategory.values()];
}

function groupMissingClasses(items) {
  const byCategory = new Map();
  for (const item of items || []) {
    const key = String(item.categoryId);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(item);
  }
  return [...byCategory.entries()].map(([categoryId, rows]) => ({ categoryId, rows }));
}

export function GrabPreview() {
  const app = useAppContext();
  const data = () => state.grabPreviewData;
  const missingCourseLoads = () => data()?.missing?.courseLoads || [];
  const missingClassGroups = () => groupMissingClasses(data()?.missing?.classLoads || []);
  const matchGroups = () => groupMatches(data()?.matches || []);

  return (
    <div id="grab-preview-list" class="grab-preview-list">
      <Show when={data()} fallback={<div class="dim grab-preview-empty">没有匹配项。</div>} keyed>
        {(preview) => (
        <>
        <Show when={!preview.ready}>
          <button type="button" id="grab-load-missing" class="grab-load-missing" onClick={() => app.grab.loadGrabMissing(preview.missing).catch(app.showError)}>加载缺失数据</button>
        </Show>
        <Show when={missingCourseLoads().length || missingClassGroups().length}>
          <div class="grab-preview-section">缺失数据</div>
          <For each={missingCourseLoads()}>
            {(item) => (
              <>
                <div class="grab-preview-tree-row level-0 is-missing"><span class="tree-arrow">▸</span><span>大类 {item.name}</span></div>
                <div class="grab-preview-tree-row level-1 is-missing"><span class="tree-arrow">·</span><span>需要加载全部课程分页</span></div>
              </>
            )}
          </For>
          <For each={missingClassGroups()}>
            {(group) => (
              <>
                <div class="grab-preview-tree-row level-0 is-missing"><span class="tree-arrow">▾</span><span>大类 {group.categoryId}</span></div>
                <For each={group.rows}>
                  {(item) => <div class="grab-preview-tree-row level-1 is-missing"><span class="tree-arrow">·</span><span>{item.courseName} <span class="dim">{item.kchId}</span> 需要加载教学班</span></div>}
                </For>
              </>
            )}
          </For>
        </Show>
        <Show when={matchGroups().length} fallback={<Show when={!missingCourseLoads().length && !missingClassGroups().length}><div class="dim grab-preview-empty">没有匹配项。</div></Show>}>
          <div class="grab-preview-section">匹配结果</div>
          <For each={matchGroups()}>
            {(categoryBucket) => (
              <>
                <div class="grab-preview-tree-row level-0"><span class="tree-arrow">▾</span><span>{categoryBucket.category.name}</span></div>
                <For each={categoryBucket.courses}>
                  {(courseBucket) => (
                    <>
                      <div class="grab-preview-tree-row level-1"><span class="tree-arrow">▾</span><span>{courseBucket.course.courseName} <span class="dim">{courseBucket.course.kchId}</span></span></div>
                      <For each={courseBucket.classes}>
                        {(classItem) => (
                          <Show when={classItem} fallback={<div class="grab-preview-tree-row level-2"><span class="tree-arrow">·</span><span class="dim">待加载教学班</span></div>}>
                            <div class="grab-preview-tree-row level-2"><span class="tree-arrow">·</span><span>{classItem.classNo} <span class="dim">{classItem.teacherName || "-"} · {classItem.location || "-"} · {classItem.selectedCount}/{classItem.capacity}</span></span></div>
                          </Show>
                        )}
                      </For>
                    </>
                  )}
                </For>
              </>
            )}
          </For>
        </Show>
        </>
        )}
      </Show>
    </div>
  );
}

export function GrabModal() {
  const app = useAppContext();

  return (
    <div id="grab-modal" classList={{ modal: true, hidden: !state.grabDraft }}>
      <div class="modal-card surface grab-card">
        <div class="modal-header">
          <div>
            <div class="eyebrow">Grab Rule</div>
            <strong id="grab-title">添加抢课任务 / {state.grabDraftLabel || state.grabDraft?.type || "-"}</strong>
          </div>
          <button type="button" id="grab-close" onClick={app.grab.closeGrabModal}>关闭</button>
        </div>
        <div class="grab-editor">
          <label for="grab-expression">表达式</label>
          <div id="grab-monaco" class="grab-monaco"></div>
          <textarea id="grab-expression" classList={{ "monaco-enabled": Boolean(state.grabEditor) }} spellcheck="false" value={state.grabExpression} onInput={(event) => { state.grabExpression = event.currentTarget.value; app.grab.scheduleGrabPreview(); }}></textarea>
          <div class="grab-hints" id="grab-hints">可用字段: {grabSymbols.join(", ")}</div>
          <div class={state.grabStatusClass} id="grab-status">{state.grabStatusText}</div>
        </div>
        <div class="grab-preview">
          <div class="grab-preview-header">预览：将会查询/匹配的项目</div>
          <GrabPreview />
        </div>
        <div class="grab-settings form-card">
          <div class="form-section-title">任务配置</div>
          <div class="settings-grid">
            <div class="field-group span-2">
              <label for="grab-start-mode">启动时间</label>
              <div class="inline-fields">
                <select id="grab-start-mode" value={state.grabStartMode} onChange={(event) => { state.grabStartMode = event.currentTarget.value; }}>
                  <option value="now">立即开始</option>
                  <option value="scheduled">指定时间点</option>
                </select>
                <input id="grab-start-at" type="datetime-local" disabled={state.grabStartMode !== "scheduled"} value={state.grabStartAt} onInput={(event) => { state.grabStartAt = event.currentTarget.value; }} />
              </div>
              <div class="field-help">指定时间点按本机时间提交给后端调度。</div>
            </div>
            <div class="field-group">
              <div>停止条件</div>
              <label class="toggle-row"><input id="grab-stop-success" type="checkbox" checked={state.grabStopSuccess} onChange={(event) => { state.grabStopSuccess = event.currentTarget.checked; }} /> 成功选到课程后停止</label>
            </div>
            <div class="field-group">
              <label for="grab-error-policy">错误处理</label>
              <select id="grab-error-policy" value={state.grabErrorPolicy} onChange={(event) => { state.grabErrorPolicy = event.currentTarget.value; }}>
                <option value="retry_once">重试一次请求</option>
                <option value="skip">跳过</option>
                <option value="stop">立即停止</option>
              </select>
            </div>
            <div class="field-group">
              <label for="grab-tick-interval">Tick 间隔</label>
              <div class="input-with-unit"><input id="grab-tick-interval" type="number" min="1" value={state.grabTickInterval} onInput={(event) => { state.grabTickInterval = Number(event.currentTarget.value || 3); }} /><span>秒</span></div>
            </div>
            <div class="field-group">
              <label for="grab-timeout">超时时间</label>
              <div class="input-with-unit"><input id="grab-timeout" type="number" min="1" value={state.grabTimeout} onInput={(event) => { state.grabTimeout = Number(event.currentTarget.value || 600); }} /><span>秒</span></div>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" id="grab-preview-refresh" onClick={() => app.grab.refreshGrabPreview().catch(app.showError)}>刷新预览</button>
          <button type="button" id="grab-confirm" onClick={() => app.grab.confirmGrabExpression().catch(app.showError)}>确认添加</button>
        </div>
      </div>
    </div>
  );
}

export function GrabTaskModal() {
  const app = useAppContext();
  const task = () => state.grabTaskDetail;
  const formatTime = (value) => value ? new Date(value * 1000).toLocaleString() : "-";

  return (
    <div id="task-modal" classList={{ modal: true, hidden: !task() }}>
      <div class="modal-card surface">
        <div class="modal-header">
          <div>
            <div class="eyebrow">Grab Task</div>
            <strong id="task-title">{task() ? `${task().name} / ${task().id}` : "任务详情"}</strong>
          </div>
          <button type="button" id="task-close" onClick={app.grab.closeGrabTaskDetail}>关闭</button>
        </div>
        <div id="task-content" class="modal-content">
          <Show when={task()} keyed>
            {(item) => (
              <>
                <div class="class-meta"><div>状态</div><div>{app.grab.grabStatusLabel(item.status)}</div></div>
                <div class="class-meta"><div>进度</div><div>{app.grab.grabProgressText(item)}</div></div>
                <div class="class-meta"><div>表达式</div><div><code>{item.expression || ""}</code></div></div>
                <div class="class-meta"><div>启动</div><div>{item.startMode || ""} {item.startAt ? new Date(item.startAt * 1000).toLocaleString() : ""}</div></div>
                <div class="class-meta"><div>Tick/Timeout</div><div>{item.tickInterval}s / {item.timeoutSeconds}s</div></div>
                <div class="class-meta"><div>错误处理</div><div>{item.errorPolicy || ""}</div></div>
                <div class="class-meta"><div>停止条件</div><div>{item.stopOnFirstSuccess ? "成功选到课程后停止" : "不自动停止"}</div></div>
                <div class="class-meta"><div>候选</div><div>{item.candidateCourseCount} 门课程 / {item.candidateClassCount} 个教学班</div></div>
                <div class="class-meta"><div>最近错误</div><div>{item.lastError || "-"}</div></div>
                <div class="class-meta"><div>最近结果</div><div>{item.lastResult || "-"}</div></div>
                <details class="debug-details">
                  <summary>最近 Tick 调试</summary>
                  <div class="debug-grid">
                    <div>检查教学班</div><div>{item.lastTickDebug?.checkedClassCount ?? 0}</div>
                    <div>ID 命中</div><div>{item.lastTickDebug?.matchedIdentityCount ?? 0}</div>
                    <div>尝试提交</div><div>{item.lastTickDebug?.attemptedCount ?? 0}</div>
                    <div>ID 跳过</div><div>{item.lastTickDebug?.skippedIdCount ?? 0}</div>
                    <div>表达式跳过</div><div>{item.lastTickDebug?.skippedExpressionCount ?? 0}</div>
                    <div>容量跳过</div><div>{item.lastTickDebug?.skippedCapacityCount ?? 0}</div>
                    <div>最近 tick</div><div>{formatTime(item.lastTickAt)}</div>
                  </div>
                </details>
                <details class="debug-details">
                  <summary>候选课程 / 教学班号</summary>
                  <For each={item.candidateCourses || []} fallback={<div class="dim debug-empty">无候选</div>}>
                    {(course) => (
                      <div class="debug-course">
                        <div><strong>{course.courseName || course.kchId}</strong> <span class="dim">category={course.categoryId} kch={course.kchId}</span></div>
                        <pre class="debug-pre">{formatDebugJson(course.classIds || [])}</pre>
                      </div>
                    )}
                  </For>
                </details>
                <details class="debug-details">
                  <summary>任务原始数据</summary>
                  <pre class="debug-pre">{formatDebugJson(item)}</pre>
                </details>
                <div class="class-meta"><div>事件</div><div><For each={item.events || []} fallback="-">{(event) => <div>{event.time} {event.message}</div>}</For></div></div>
              </>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
}
