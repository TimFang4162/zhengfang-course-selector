import { useCallback } from "react";
import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { state } from "../../app/state.js";
import { formatDebugJson, cx } from "../../shared/utils.js";
import { grabSymbols } from "./expression.js";
import { useComposingInput } from "../../hooks/use-composing-input.js";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogPanel, DialogFooter } from "../../components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../../components/ui/select";
import { Accordion, AccordionItem, AccordionTrigger, AccordionPanel } from "../../components/ui/accordion";
import { Label } from "../../components/ui/label";

function groupMatches(matches) {
  const byCategory = new Map();
  for (const item of matches || []) {
    const categoryId = String(item.category.id);
    if (!byCategory.has(categoryId)) byCategory.set(categoryId, { category: item.category, courses: [] });
    const categoryBucket = byCategory.get(categoryId);
    let courseBucket = categoryBucket.courses.find((b) => String(b.course.kchId) === String(item.course.kchId));
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
  const snap = useSnapshot(state);
  const data = snap.grabPreviewData;
  const missingCourseLoads = data?.missing?.courseLoads || [];
  const missingClassGroups = groupMissingClasses(data?.missing?.classLoads || []);
  const matchGroups = groupMatches(data?.matches || []);

  if (!data)     return <div id="grab-preview-list" className="grab-preview-list max-h-[260px] overflow-auto"><div className="dim grab-preview-empty p-2">没有匹配项。</div></div>;

  return (
    <div id="grab-preview-list" className="grab-preview-list max-h-[260px] overflow-auto">
      {!data.ready && (
        <Button variant="outline" size="sm" id="grab-load-missing" onClick={() => app.grab.loadGrabMissing(data.missing).catch(app.showError)}>加载缺失数据</Button>
      )}
      {(missingCourseLoads.length > 0 || missingClassGroups.length > 0) && (
        <>
          <div className="grab-preview-section pt-1.5 px-2 pb-1 text-muted-foreground text-xs uppercase">缺失数据</div>
          {missingCourseLoads.map((item) => (
            <div key={item.name || item.categoryId}>
              <div className="grab-preview-tree-row level-0 is-missing"><span className="tree-arrow">▸</span><span>大类 {item.name}</span></div>
              <div className="grab-preview-tree-row level-1 is-missing"><span className="tree-arrow">·</span><span>需要加载全部课程分页</span></div>
            </div>
          ))}
          {missingClassGroups.map((group) => (
            <div key={group.categoryId}>
              <div className="grab-preview-tree-row level-0 is-missing"><span className="tree-arrow">▾</span><span>大类 {group.categoryId}</span></div>
              {group.rows.map((item) => <div key={item.kchId} className="grab-preview-tree-row level-1 is-missing"><span className="tree-arrow">·</span><span>{item.courseName} <span className="text-muted-foreground">{item.kchId}</span> 需要加载教学班</span></div>)}
            </div>
          ))}
        </>
      )}
      {matchGroups.length > 0 ? (
        <>
          <div className="grab-preview-section pt-1.5 px-2 pb-1 text-muted-foreground text-xs uppercase">匹配结果</div>
          {matchGroups.map((categoryBucket) => (
            <div key={categoryBucket.category.id}>
              <div className="grab-preview-tree-row level-0"><span className="tree-arrow">▾</span><span>{categoryBucket.category.name}</span></div>
              {categoryBucket.courses.map((courseBucket) => (
                <div key={courseBucket.course.kchId}>
                  <div className="grab-preview-tree-row level-1"><span className="tree-arrow">▾</span><span>{courseBucket.course.courseName} <span className="text-muted-foreground">{courseBucket.course.kchId}</span></span></div>
                  {courseBucket.classes.map((classItem) => (
                    <div key={classItem.classKey || classItem.doJxbId} className="grab-preview-tree-row level-2">
                      <span className="tree-arrow">·</span>
                      <span>{classItem.classNo} <span className="text-muted-foreground">{classItem.teacherName || "-"} · {classItem.location || "-"} · {classItem.selectedCount}/{classItem.capacity}</span></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </>
      ) : (!missingCourseLoads.length && !missingClassGroups.length) && (
        <div className="dim grab-preview-empty p-2">没有匹配项。</div>
      )}
    </div>
  );
}

export function GrabModal() {
  const app = useAppContext();
  const snap = useSnapshot(state);

  const expressionField = useComposingInput(snap.grabExpression, useCallback((v) => {
    state.grabExpression = v;
    app.grab.scheduleGrabPreview();
  }, [app]));
  const startAtField = useComposingInput(snap.grabStartAt, useCallback((v) => { state.grabStartAt = v; }, []));
  const tickIntervalField = useComposingInput(snap.grabTickInterval, useCallback((v) => { state.grabTickInterval = Number(v || 3); }, []));
  const timeoutField = useComposingInput(snap.grabTimeout, useCallback((v) => { state.grabTimeout = Number(v || 600); }, []));

  return (
    <Dialog open={!!snap.grabDraft} onOpenChange={(open) => { if (!open) app.grab.closeGrabModal(); }}>
      <DialogPopup className="grab-card">
        <DialogHeader>
          <div className="eyebrow">Grab Rule</div>
          <DialogTitle>添加抢课任务 / {snap.grabDraftLabel || snap.grabDraft?.type || "-"}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="grab-editor">
            <Label htmlFor="grab-expression">表达式</Label>
            <div id="grab-monaco" className="grab-monaco"></div>
            <Textarea id="grab-expression" className={cx({ "monaco-enabled": Boolean(snap.grabEditor) })} spellCheck="false" {...expressionField}></Textarea>
            <div className="grab-hints text-muted-foreground text-xs" id="grab-hints">可用字段: {grabSymbols.join(", ")}</div>
            <div className={snap.grabStatusClass + " min-h-5 text-xs"} id="grab-status">{snap.grabStatusText}</div>
          </div>
          <div className="grab-preview mt-2.5 border border-border bg-background">
            <div className="grab-preview-header py-1.5 px-2 border-b border-border-subtle text-muted-foreground text-xs">预览：将会查询/匹配的项目</div>
            <GrabPreview />
          </div>
          <div className="grab-settings form-card mt-2.5 p-2.5 border border-border bg-background">
            <div className="form-section-title mb-2 text-muted-foreground text-[11px] tracking-[0.08em] uppercase">任务配置</div>
            <div className="grab-settings-form">
              <div className="grab-form-row max-lg:grid-cols-1 max-lg:gap-1.5">
                <label className="grab-form-label min-h-6 pt-1 max-lg:pt-0 text-muted-foreground text-xs" htmlFor="grab-start-mode">启动时间</label>
                <div className="grab-form-control">
                  <Select id="grab-start-mode" value={snap.grabStartMode} onValueChange={(v) => { state.grabStartMode = v; }}>
                    <SelectTrigger id="grab-start-mode"><SelectValue /></SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="now">立即开始</SelectItem>
                      <SelectItem value="manual">手动启动</SelectItem>
                      <SelectItem value="scheduled">指定时间点</SelectItem>
                    </SelectPopup>
                  </Select>
                  {snap.grabStartMode === "scheduled" && (
                    <Input id="grab-start-at" type="datetime-local" {...startAtField} />
                  )}
                  <div className="field-help text-muted-foreground text-xs">立即开始会在创建后直接运行；手动启动会先进入待启动状态；指定时间点按本机时间提交给后端调度。</div>
                </div>
              </div>

              <div className="grab-form-row max-lg:grid-cols-1 max-lg:gap-1.5">
                <label className="grab-form-label min-h-6 pt-1 max-lg:pt-0 text-muted-foreground text-xs" htmlFor="grab-stop-mode">停止条件</label>
                <div className="grab-form-control">
                  <Select id="grab-stop-mode" value={snap.grabStopSuccess ? "success" : "manual"} onValueChange={(v) => { state.grabStopSuccess = v === "success"; }}>
                    <SelectTrigger id="grab-stop-mode"><SelectValue /></SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="success">成功选到课程后停止</SelectItem>
                      <SelectItem value="manual">持续运行，直到手动停止或超时</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
              </div>

              <div className="grab-form-row max-lg:grid-cols-1 max-lg:gap-1.5">
                <label className="grab-form-label min-h-6 pt-1 max-lg:pt-0 text-muted-foreground text-xs" htmlFor="grab-error-policy">错误处理</label>
                <div className="grab-form-control">
                  <Select id="grab-error-policy" value={snap.grabErrorPolicy} onValueChange={(v) => { state.grabErrorPolicy = v; }}>
                    <SelectTrigger id="grab-error-policy"><SelectValue /></SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="retry_once">重试一次请求</SelectItem>
                      <SelectItem value="skip">跳过</SelectItem>
                      <SelectItem value="stop">立即停止</SelectItem>
                    </SelectPopup>
                  </Select>
                </div>
              </div>

              <div className="grab-form-row max-lg:grid-cols-1 max-lg:gap-1.5">
                <label className="grab-form-label min-h-6 pt-1 max-lg:pt-0 text-muted-foreground text-xs" htmlFor="grab-tick-interval">Tick 间隔</label>
                <div className="grab-form-control">
                  <div className="flex items-center gap-1.5"><Input id="grab-tick-interval" className="min-w-0 flex-1" type="number" min="1" {...tickIntervalField} /><span className="text-muted-foreground text-xs">秒</span></div>
                </div>
              </div>

              <div className="grab-form-row max-lg:grid-cols-1 max-lg:gap-1.5">
                <label className="grab-form-label min-h-6 pt-1 max-lg:pt-0 text-muted-foreground text-xs" htmlFor="grab-timeout">超时时间</label>
                <div className="grab-form-control">
                  <div className="flex items-center gap-1.5"><Input id="grab-timeout" className="min-w-0 flex-1" type="number" min="1" {...timeoutField} /><span className="text-muted-foreground text-xs">秒</span></div>
                </div>
              </div>
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" id="grab-preview-refresh" onClick={() => app.grab.refreshGrabPreview().catch(app.showError)}>刷新预览</Button>
          <Button id="grab-confirm" onClick={() => app.grab.confirmGrabExpression().catch(app.showError)}>确认添加</Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function GrabTaskModal() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const task = snap.grabTaskDetail;
  const formatTime = (value) => value ? new Date(value * 1000).toLocaleString() : "-";

  return (
    <Dialog open={!!task} onOpenChange={(open) => { if (!open) app.grab.closeGrabTaskDetail(); }}>
      <DialogPopup>
        <DialogHeader>
          <div className="eyebrow">Grab Task</div>
          <DialogTitle>{task ? `${task.name} / ${task.id}` : "任务详情"}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div id="task-content">
            {task && (
              <>
                <div className="class-meta"><div>状态</div><div>{app.grab.grabStatusLabel(task.status)}</div></div>
                <div className="class-meta"><div>进度</div><div>{app.grab.grabProgressText(task)}</div></div>
                <div className="class-meta"><div>表达式</div><div><code>{task.expression || ""}</code></div></div>
                <div className="class-meta"><div>启动</div><div>{task.startMode || ""} {task.startAt ? new Date(task.startAt * 1000).toLocaleString() : ""}</div></div>
                <div className="class-meta"><div>Tick/Timeout</div><div>{task.tickInterval}s / {task.timeoutSeconds}s</div></div>
                <div className="class-meta"><div>错误处理</div><div>{task.errorPolicy || ""}</div></div>
                <div className="class-meta"><div>停止条件</div><div>{task.stopOnFirstSuccess ? "成功选到课程后停止" : "不自动停止"}</div></div>
                <div className="class-meta"><div>候选</div><div>{task.candidateCourseCount} 门课程 / {task.candidateClassCount} 个教学班</div></div>
                <div className="class-meta"><div>最近错误</div><div>{task.lastError || "-"}</div></div>
                <div className="class-meta"><div>最近结果</div><div>{task.lastResult || "-"}</div></div>
                <Accordion>
                  <AccordionItem value="tick-debug">
                    <AccordionTrigger>最近 Tick 调试</AccordionTrigger>
                    <AccordionPanel>
                    <div className="debug-grid">
                      <div>检查教学班</div><div>{task.lastTickDebug?.checkedClassCount ?? 0}</div>
                      <div>ID 命中</div><div>{task.lastTickDebug?.matchedIdentityCount ?? 0}</div>
                      <div>尝试提交</div><div>{task.lastTickDebug?.attemptedCount ?? 0}</div>
                      <div>ID 跳过</div><div>{task.lastTickDebug?.skippedIdCount ?? 0}</div>
                      <div>表达式跳过</div><div>{task.lastTickDebug?.skippedExpressionCount ?? 0}</div>
                      <div>容量跳过</div><div>{task.lastTickDebug?.skippedCapacityCount ?? 0}</div>
                      <div>最近 tick</div><div>{formatTime(task.lastTickAt)}</div>
                    </div>
                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem value="candidate-classes">
                    <AccordionTrigger>候选课程 / 教学班号</AccordionTrigger>
                    <AccordionPanel>
                    {(task.candidateCourses || []).length ? (task.candidateCourses || []).map((course) => (
                       <div key={course.kchId} className="mt-2 text-xs">
                        <div><strong>{course.courseName || course.kchId}</strong> <span className="text-muted-foreground">category={course.categoryId} kch={course.kchId}</span></div>
                         <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(course.classIds || [])}</pre>
                      </div>
                     )) : <div className="dim mt-2">无候选</div>}
                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem value="raw-task-data">
                    <AccordionTrigger>任务原始数据</AccordionTrigger>
                    <AccordionPanel>
                     <pre className="max-h-[260px] mt-2 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-[1.45] text-foreground">{formatDebugJson(task)}</pre>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
                <div className="class-meta"><div>事件</div><div>{(task.events || []).length ? task.events.map((ev, i) => <div key={i}>{ev.time} {ev.message}</div>) : "-"}</div></div>
              </>
            )}
          </div>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
