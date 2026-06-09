import { createSignal, For, Show } from "solid-js";
import { state } from "../../app/state.js";
import { useAppContext } from "../../app/app-context.jsx";
import { academicFilterNatures, academicFilterTerms } from "./filters.js";

export function academicCreditSummary(nodes) {
  const root = (nodes || [])[0];
  if (!root) return { plan: "暂无学业情况", earned: "0.0", required: "-", remaining: "-" };
  const earned = root.earnedCredit || "0.0";
  const required = root.requiredCredit || "-";
  const remaining = Number.isFinite(Number(required)) && Number.isFinite(Number(earned)) ? Math.max(0, Number(required) - Number(earned)).toFixed(1) : "-";
  return { plan: root.name || "-", earned, required, remaining };
}

export function activeAcademicFilterCount() {
  let count = 0;
  if (state.academicFilters.suggestedTerm !== "all") count += 1;
  if (state.academicFilters.statusType !== "all") count += 1;
  if (state.academicFilters.courseNature !== "all") count += 1;
  if (state.academicFilters.nodeStatus !== "all") count += 1;
  return count;
}

function filteredAcademicCourses(courses) {
  const { suggestedTerm, statusType, courseNature } = state.academicFilters;
  return (courses || []).filter((course) => {
    const termKey = [course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ");
    if (suggestedTerm !== "all" && termKey !== suggestedTerm) return false;
    if (statusType !== "all" && String(course.statusType || "") !== statusType) return false;
    if (courseNature !== "all" && String(course.courseNature || "").trim() !== courseNature) return false;
    return true;
  });
}

function academicNodeMatchesStatus(node) {
  return state.academicFilters.nodeStatus === "all" || String(node.creditStatus || "") === state.academicFilters.nodeStatus;
}

function academicNodeCourses(node) {
  const cached = state.academicNodeCourses[node.id];
  return Array.isArray(cached) ? cached : (node.courses || []);
}

function academicNodeIsUnloadedLeaf(node) {
  return node.isLeaf && !(node.id in state.academicNodeCourses);
}

function academicNodeHasVisibleContent(node) {
  if (!academicNodeMatchesStatus(node)) return false;
  const cached = state.academicNodeCourses[node.id];
  // Loaded leaf nodes are always visible; filter only applies to the inner course table
  if (Array.isArray(cached)) return node.isLeaf || (node.children || []).some((child) => academicNodeHasVisibleContent(child));
  const visibleCourses = filteredAcademicCourses(academicNodeCourses(node));
  if (visibleCourses.length) return true;
  // Keep visible during loading, on error, or before first load
  if (cached != null && !Array.isArray(cached) || academicNodeIsUnloadedLeaf(node)) return true;
  return (node.children || []).some((child) => academicNodeHasVisibleContent(child));
}

function AcademicBadge(props) {
  return <span class={`academic-badge is-${props.type || "unknown"}`}>{props.children || "未知"}</span>;
}

function AcademicCourses(props) {
  const courses = () => filteredAcademicCourses(props.courses || []);
  const app = useAppContext();

  return (
    <Show when={courses().length} fallback={<div class="academic-empty dim">当前筛选下暂无课程明细</div>}>
      <table class="academic-course-table">
        <thead><tr><th>课程</th><th>学分</th><th>状态</th><th>成绩</th><th>学时</th><th>课程性质</th><th>建议修读</th><th>课程类别</th></tr></thead>
        <tbody>
          <For each={courses()}>
            {(course) => (
              <tr class={` is-${course.statusType || "unknown"}`}>
                <td>
                  <button type="button" class="link-button" onClick={() => app.academic.loadAcademicCourseDetail(course.kchId)}>{course.name}</button>
                  <br /><span class="dim">{course.kch || course.kchId}</span>
                </td>
                <td>{course.creditText || "-"}</td>
                <td><AcademicBadge type={course.statusType}>{course.status || "-"}</AcademicBadge></td>
                <td>{course.score || course.maxScore || "-"}</td>
                <td>{course.hoursText || "-"}</td>
                <td>{course.courseNature || "-"}</td>
                <td>{[course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ") || "-"}</td>
                <td>{course.courseCategory || "-"}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </Show>
  );
}

function AcademicNode(props) {
  const app = useAppContext();
  const [isOpen, setIsOpen] = createSignal(props.level <= 1);
  const children = () => (props.node.children || []).filter((child) => academicNodeHasVisibleContent(child));
  const nodeCourses = () => academicNodeCourses(props.node);
  const courses = () => filteredAcademicCourses(nodeCourses());
  const courseCount = () => courses().length;
  const passedCount = () => courses().filter((course) => course.statusType === "passed" || course.statusType === "substituted").length;
  const progressWidth = () => {
    const required = Number(props.node.requiredCredit);
    const earned = Number(props.node.earnedCredit || 0);
    return Number.isFinite(required) && required > 0 ? Math.min(100, (earned / required) * 100) : 0;
  };
  const nodeLoading = () => state.academicNodeCourses[props.node.id]?.__loading;
  const nodeError = () => state.academicNodeCourses[props.node.id]?.__error;

  function handleToggle(event) {
    setIsOpen(event.target.open);
    if (!event.target.open) return;
    if (!academicNodeIsUnloadedLeaf(props.node)) return;
    if (nodeLoading()) return;
    app.academic.loadAcademicNodeCourses(props.node.id);
  }

  return (
    <details class={`academic-node level-${props.level}`} open={isOpen()} onToggle={handleToggle}>
      <summary>
        <span class="tree-arrow">▸</span>
        <span class="academic-node-title">{props.node.name}</span>
        <span class="academic-node-credit">{props.node.earnedCredit || "0.0"}/{props.node.requiredCredit || "-"} 学分</span>
        <span class="academic-node-state">
          <AcademicBadge type={props.node.creditStatus}>{props.node.creditStatusText || "未知"}</AcademicBadge>
          <Show when={props.node.substituteStatus && props.node.substituteStatus !== "none"}>
            <AcademicBadge type="substitute">{props.node.substituteStatusText || "课程替代"}</AcademicBadge>
          </Show>
        </span>
        <span class="academic-node-count">
          {children().length ? `${children().length} 子项` : (nodeLoading() ? "加载中..." : nodeError() ? "加载失败" : `${passedCount()}/${courseCount() || "-"} 课程`)}
        </span>
      </summary>
      <div class={`academic-progress is-${props.node.creditStatus || "unknown"}`}><span style={{ width: `${progressWidth()}%` }}></span></div>
      <div class="academic-children">
        <For each={children()}>{(child) => <AcademicNode node={child} level={props.level + 1} />}</For>
        <Show when={!children().length}>
          <Show when={nodeLoading()} fallback={
            <Show when={!nodeError()} fallback={<div class="academic-empty dim">加载失败，点击刷新按钮重新获取。</div>}>
              <AcademicCourses courses={courses()} />
            </Show>
          }>
            <div class="academic-empty dim">加载课程明细中...</div>
          </Show>
        </Show>
      </div>
    </details>
  );
}

export function AcademicStatusView() {
  const nodes = () => {
    state.academicVersion;
    return state.academicStatus?.nodes || [];
  };
  const visibleNodes = () => nodes().filter((node) => academicNodeHasVisibleContent(node));
  const summary = () => academicCreditSummary(nodes());
  const serverSummary = () => state.academicStatus?.summary || {};

  return (
    <div id="academic-status" class="academic-view">
      <Show when={!state.academicLoading} fallback={<div class="academic-empty dim">正在拉取学业情况和课程明细...</div>}>
        <Show when={nodes().length} fallback={<div class="academic-empty dim">暂无学业情况数据，点击刷新重新获取。</div>}>
          <div class="academic-overview">
            <div><span class="dim">方案</span><strong>{summary().plan}</strong></div>
            <div><span class="dim">学分</span><strong>{summary().earned}/{summary().required}</strong></div>
            <div><span class="dim">未获</span><strong>{summary().remaining}</strong></div>
            <div><span class="dim">GPA</span><strong>{serverSummary().serverGpa || "-"}</strong></div>
            <div><span class="dim">计划课程</span><strong>{serverSummary().planPassedCourses ?? 0}/{serverSummary().planTotalCourses ?? 0}</strong></div>
            <div><span class="dim">未修/在读</span><strong>{serverSummary().planUnstartedCourses ?? 0}/{serverSummary().planStudyingCourses ?? 0}</strong></div>
          </div>
          <div class="academic-tree">
            <div class="academic-tree-head">
              <span></span><span>学分要求节点</span><span>学分</span><span>状态</span><span>明细</span>
            </div>
            <Show when={visibleNodes().length} fallback={<div class="academic-empty dim">当前筛选下没有匹配课程。</div>}>
              <For each={visibleNodes()}>{(node) => <AcademicNode node={node} level={0} />}</For>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
