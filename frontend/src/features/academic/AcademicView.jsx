import { useState } from "react";
import { useSnapshot } from "valtio";
import { state } from "../../app/state.js";
import { useAppContext } from "../../app/app-context.jsx";
import { openFloatingMenu } from "../../components/FloatingMenu.jsx";
import { academicFilterNatures, academicFilterTerms } from "./filters.js";
import { cx } from "../../shared/utils.js";

export function academicCreditSummary(nodes) {
  const root = (nodes || [])[0];
  if (!root) return { plan: "暂无学业情况", earned: "0.0", required: "-", remaining: "-" };
  const earned = root.earnedCredit || "0.0";
  const required = root.requiredCredit || "-";
  const remaining = Number.isFinite(Number(required)) && Number.isFinite(Number(earned)) ? Math.max(0, Number(required) - Number(earned)).toFixed(1) : "-";
  return { plan: root.name || "-", earned, required, remaining };
}

export function activeAcademicFilterCount(snap) {
  let count = 0;
  if (snap.academicFilters.suggestedTerm !== "all") count += 1;
  if (snap.academicFilters.statusType !== "all") count += 1;
  if (snap.academicFilters.courseNature !== "all") count += 1;
  if (snap.academicFilters.nodeStatus !== "all") count += 1;
  return count;
}

function filteredAcademicCourses(courses, filters) {
  const { suggestedTerm, statusType, courseNature } = filters;
  return (courses || []).filter((course) => {
    const termKey = [course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ");
    if (suggestedTerm !== "all" && termKey !== suggestedTerm) return false;
    if (statusType !== "all" && String(course.statusType || "") !== statusType) return false;
    if (courseNature !== "all" && String(course.courseNature || "").trim() !== courseNature) return false;
    return true;
  });
}

function academicNodeMatchesStatus(node, filters) {
  return filters.nodeStatus === "all" || String(node.creditStatus || "") === filters.nodeStatus;
}

function academicNodeCourses(node, nodeCoursesMap) {
  const cached = nodeCoursesMap[node.id];
  return Array.isArray(cached) ? cached : (node.courses || []);
}

function academicNodeIsUnloadedLeaf(node, nodeCoursesMap) {
  return node.isLeaf && !(node.id in nodeCoursesMap);
}

function academicNodeHasVisibleContent(node, filters, nodeCoursesMap) {
  if (!academicNodeMatchesStatus(node, filters)) return false;
  const cached = nodeCoursesMap[node.id];
  if (Array.isArray(cached)) return node.isLeaf || (node.children || []).some((child) => academicNodeHasVisibleContent(child, filters, nodeCoursesMap));
  const visibleCourses = filteredAcademicCourses(academicNodeCourses(node, nodeCoursesMap), filters);
  if (visibleCourses.length) return true;
  if (cached != null && !Array.isArray(cached) || academicNodeIsUnloadedLeaf(node, nodeCoursesMap)) return true;
  return (node.children || []).some((child) => academicNodeHasVisibleContent(child, filters, nodeCoursesMap));
}

function AcademicBadge({ type, children }) {
  return <span className={`academic-badge is-${type || "unknown"}`}>{children || "未知"}</span>;
}

function AcademicCourses({ courses, filters }) {
  const app = useAppContext();
  const filtered = filteredAcademicCourses(courses, filters);
  if (!filtered.length) return <div className="academic-empty dim">当前筛选下暂无课程明细</div>;

  return (
    <table className="academic-course-table">
      <thead><tr><th>课程</th><th>学分</th><th>状态</th><th>成绩</th><th>学时</th><th>课程性质</th><th>建议修读</th><th>课程类别</th></tr></thead>
      <tbody>
        {filtered.map((course) => (
          <tr key={course.kchId || course.kch} className={` is-${course.statusType || "unknown"}`}>
            <td>
              <button type="button" className="link-button" onClick={() => app.academic.loadAcademicCourseDetail(course.kchId)}>{course.name}</button>
              <br /><span className="dim">{course.kch || course.kchId}</span>
            </td>
            <td>{course.creditText || "-"}</td>
            <td><AcademicBadge type={course.statusType}>{course.status || "-"}</AcademicBadge></td>
            <td>{course.score || course.maxScore || "-"}</td>
            <td>{course.hoursText || "-"}</td>
            <td>{course.courseNature || "-"}</td>
            <td>{[course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ") || "-"}</td>
            <td>{course.courseCategory || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AcademicNode({ node, level }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.academicVersion;
  const [isOpen, setIsOpen] = useState(level <= 1);
  const filters = snap.academicFilters;
  const nodeCoursesMap = snap.academicNodeCourses;
  const children = (node.children || []).filter((child) => academicNodeHasVisibleContent(child, filters, nodeCoursesMap));
  const courses = filteredAcademicCourses(academicNodeCourses(node, nodeCoursesMap), filters);
  const passedCount = courses.filter((c) => c.statusType === "passed" || c.statusType === "substituted").length;
  const required = Number(node.requiredCredit);
  const earned = Number(node.earnedCredit || 0);
  const progressWidth = Number.isFinite(required) && required > 0 ? Math.min(100, (earned / required) * 100) : 0;
  const nodeLoading = nodeCoursesMap[node.id]?.__loading;
  const nodeError = nodeCoursesMap[node.id]?.__error;

  function handleToggle(e) {
    setIsOpen(e.target.open);
    if (!e.target.open) return;
    if (!academicNodeIsUnloadedLeaf(node, nodeCoursesMap)) return;
    if (nodeLoading) return;
    app.academic.loadAcademicNodeCourses(node.id);
  }

  function openNodeMenu(e) {
    e.stopPropagation();
    e.preventDefault();
    openFloatingMenu(e.currentTarget, [
      { label: "刷新此节点", action: () => app.academic.reloadAcademicNodeCourses(node.id).catch(app.showError) },
    ]);
  }

  return (
    <details className={`academic-node level-${level}`} open={isOpen} onToggle={handleToggle}>
      <summary>
        <span className="tree-arrow">▸</span>
        <span className="academic-node-title">{node.name}</span>
        <span className="academic-node-credit">{node.earnedCredit || "0.0"}/{node.requiredCredit || "-"} 学分</span>
        <span className="academic-node-state">
          <AcademicBadge type={node.creditStatus}>{node.creditStatusText || "未知"}</AcademicBadge>
          {node.substituteStatus && node.substituteStatus !== "none" && (
            <AcademicBadge type="substitute">{node.substituteStatusText || "课程替代"}</AcademicBadge>
          )}
        </span>
        <span className="academic-node-count">
          {children.length ? `${children.length} 子项` : (nodeLoading ? "加载中..." : nodeError ? "加载失败" : `${passedCount}/${courses.length || "-"} 课程`)}
        </span>
        <button type="button" className="academic-node-more" onClick={openNodeMenu}>⋯</button>
      </summary>
      <div className={`academic-progress is-${node.creditStatus || "unknown"}`}><span style={{ width: `${progressWidth}%` }}></span></div>
      <div className="academic-children">
        {children.map((child) => <AcademicNode key={child.id} node={child} level={level + 1} />)}
        {!children.length && (
          nodeLoading ? (
            <div className="academic-empty dim">加载课程明细中...</div>
          ) : nodeError ? (
            <div className="academic-empty dim">加载失败，点击刷新按钮重新获取。</div>
          ) : (
            <AcademicCourses courses={courses} filters={filters} />
          )
        )}
      </div>
    </details>
  );
}

export function AcademicStatusView() {
  const snap = useSnapshot(state);
  void snap.academicVersion;
  const nodes = snap.academicStatus?.nodes || [];
  const filters = snap.academicFilters;
  const nodeCoursesMap = snap.academicNodeCourses;
  const visibleNodes = nodes.filter((node) => academicNodeHasVisibleContent(node, filters, nodeCoursesMap));
  const summary = academicCreditSummary(nodes);
  const serverSummary = snap.academicStatus?.summary || {};

  if (snap.academicLoading) return <div id="academic-status" className="academic-view"><div className="academic-empty dim">正在拉取学业情况和课程明细...</div></div>;
  if (!nodes.length) return <div id="academic-status" className="academic-view"><div className="academic-empty dim">暂无学业情况数据，点击刷新重新获取。</div></div>;

  return (
    <div id="academic-status" className="academic-view">
      <div className="academic-overview">
        <div><span className="dim">方案</span><strong>{summary.plan}</strong></div>
        <div><span className="dim">学分</span><strong>{summary.earned}/{summary.required}</strong></div>
        <div><span className="dim">未获</span><strong>{summary.remaining}</strong></div>
        <div><span className="dim">GPA</span><strong>{serverSummary.serverGpa || "-"}</strong></div>
        <div><span className="dim">计划课程</span><strong>{serverSummary.planPassedCourses ?? 0}/{serverSummary.planTotalCourses ?? 0}</strong></div>
        <div><span className="dim">未修/在读</span><strong>{serverSummary.planUnstartedCourses ?? 0}/{serverSummary.planStudyingCourses ?? 0}</strong></div>
      </div>
      <div className="academic-tree">
        <div className="academic-tree-head">
          <span></span><span>学分要求节点</span><span>学分</span><span>状态</span><span>明细</span><span></span>
        </div>
        {visibleNodes.length ? (
          visibleNodes.map((node) => <AcademicNode key={node.id} node={node} level={0} />)
        ) : (
          <div className="academic-empty dim">当前筛选下没有匹配课程。</div>
        )}
      </div>
    </div>
  );
}
