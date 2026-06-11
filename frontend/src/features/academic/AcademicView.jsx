import { useSnapshot } from "valtio";
import { state } from "../../app/state.js";
import { useAppContext } from "../../app/app-context.jsx";
import { academicFilterNatures, academicFilterTerms } from "./filters.js";
import { cx } from "../../shared/utils.js";
import { Button } from "../../components/ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../../components/ui/menu";
import { Popover, PopoverTrigger, PopoverPopup } from "../../components/ui/popover";
import { Progress, ProgressTrack, ProgressIndicator } from "../../components/ui/progress";
import { Ellipsis, ChevronRight, ChevronDown, FilterX, RefreshCw } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "../../components/ui/table";

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
  const typeMap = { passed: "success", substituted: "warning", studying: "info", failed: "destructive" };
  return <Badge variant={typeMap[type] || "secondary"}>{children || "未知"}</Badge>;
}

function AcademicCourses({ courses, filters }) {
  const app = useAppContext();
  const filtered = filteredAcademicCourses(courses, filters);
  if (!filtered.length) return <div className="academic-empty text-muted-foreground">当前筛选下暂无课程明细</div>;

  return (
    <Table className="academic-course-table">
      <TableHeader>
        <TableRow>
          <TableHead>课程</TableHead>
          <TableHead>学分</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>成绩</TableHead>
          <TableHead>学时</TableHead>
          <TableHead>课程性质</TableHead>
          <TableHead>建议修读</TableHead>
          <TableHead>课程类别</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filtered.map((course) => (
          <TableRow key={course.kchId || course.kch} className={`is-${course.statusType || "unknown"}`}>
            <TableCell>
              <Button variant="link" size="sm" className="px-0" onClick={() => app.academic.loadAcademicCourseDetail(course.kchId)}>{course.name}</Button>
              <br /><span className="text-muted-foreground">{course.kch || course.kchId}</span>
            </TableCell>
            <TableCell>{course.creditText || "-"}</TableCell>
            <TableCell><AcademicBadge type={course.statusType}>{course.status || "-"}</AcademicBadge></TableCell>
            <TableCell>{course.score || course.maxScore || "-"}</TableCell>
            <TableCell>{course.hoursText || "-"}</TableCell>
            <TableCell>{course.courseNature || "-"}</TableCell>
            <TableCell>{[course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ") || "-"}</TableCell>
            <TableCell>{course.courseCategory || "-"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AcademicNode({ node, level }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.academicVersion;
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
  const expanded = snap.academicExpandedNodes.has(node.id);

  function handleToggle() {
    app.academic.toggleAcademicNode(node.id);
    if (!expanded && academicNodeIsUnloadedLeaf(node, nodeCoursesMap)) {
      app.academic.loadAcademicNodeCourses(node.id);
    }
  }

  return (
    <>
      <div
        className={cx(
          "group flex items-center min-h-[26px] gap-1 py-px px-2 border border-transparent text-foreground text-[13px] cursor-pointer hover:bg-accent",
          `level-${level}`
        )}
        role="treeitem"
        tabIndex="0"
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleToggle(); }
        }}
      >
        <Button variant="ghost" size="icon-xs" onClick={(e) => { e.stopPropagation(); handleToggle(); }}>
          {expanded ? <ChevronDown /> : <ChevronRight />}
        </Button>
        <div className="flex-1 min-w-0 grid academic-node-grid items-center gap-2">
          <span className="academic-node-title">{node.name}</span>
          <span className="academic-node-credit">
            <Progress value={progressWidth} className="w-[120px] shrink-0" data-status={node.creditStatus}>
              <ProgressTrack className="h-1.5">
                <ProgressIndicator className="transition-all duration-500" style={{ background: { full: "var(--vscode-success)", passed: "var(--vscode-success)", overflow: "var(--vscode-warning)", node_failed: "var(--vscode-error)" }[node.creditStatus] || "var(--vscode-info)" }} />
              </ProgressTrack>
            </Progress>
            {node.earnedCredit || "0.0"}/{node.requiredCredit || "-"}
          </span>
          <span className="academic-node-state">
            <AcademicBadge type={node.creditStatus}>{node.creditStatusText || "未知"}</AcademicBadge>
            {node.substituteStatus && node.substituteStatus !== "none" && (
              <AcademicBadge type="substitute">{node.substituteStatusText || "课程替代"}</AcademicBadge>
            )}
          </span>
          <span className="academic-node-count">
            {children.length ? `${children.length} 子项` : (nodeLoading ? "加载中..." : nodeError ? "加载失败" : `${passedCount}/${courses.length || "-"} 课程`)}
          </span>
          <Menu>
            <MenuTrigger><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={(e) => e.stopPropagation()}><Ellipsis /></Button></MenuTrigger>
            <MenuPopup align="end">
              <MenuItem onClick={() => { app.academic.reloadAcademicNodeCourses(node.id).catch(app.showError); }}><RefreshCw aria-hidden="true" />刷新此节点</MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>
      {expanded && (
        <div className="academic-children">
          {children.length ? (
            children.map((child) => <AcademicNode key={child.id} node={child} level={level + 1} />)
          ) : (
            nodeLoading ? (
              <div className="academic-empty text-muted-foreground">加载课程明细中...</div>
            ) : nodeError ? (
              <div className="academic-empty text-muted-foreground">加载失败，点击刷新按钮重新获取。</div>
            ) : (
              <AcademicCourses courses={courses} filters={filters} />
            )
          )}
        </div>
      )}
    </>
  );
}

export function AcademicStatusView() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.academicVersion;
  const nodes = snap.academicStatus?.nodes || [];
  const filters = snap.academicFilters;
  const nodeCoursesMap = snap.academicNodeCourses;
  const visibleNodes = nodes.filter((node) => academicNodeHasVisibleContent(node, filters, nodeCoursesMap));
  const summary = academicCreditSummary(nodes);
  const serverSummary = snap.academicStatus?.summary || {};

  if (snap.academicLoading) return <div id="academic-status" className="academic-view flex-1"><div className="academic-empty text-muted-foreground">正在拉取学业情况和课程明细...</div></div>;
  if (!nodes.length) return <div id="academic-status" className="academic-view flex-1"><div className="academic-empty text-muted-foreground">暂无学业情况数据，点击刷新重新获取。</div></div>;

  return (
    <div id="academic-status" className="academic-view flex-1">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-px border-b border-border bg-border">
        <div className="grid gap-0.5 min-w-0 px-2.5 py-2 bg-card"><span className="text-muted-foreground text-xs">方案</span><strong className="text-foreground text-sm font-medium truncate">{summary.plan}</strong></div>
        <div className="grid gap-0.5 min-w-0 px-2.5 py-2 bg-card"><span className="text-muted-foreground text-xs">学分</span><strong className="text-foreground text-sm font-medium truncate">{summary.earned}/{summary.required}</strong></div>
        <div className="grid gap-0.5 min-w-0 px-2.5 py-2 bg-card"><span className="text-muted-foreground text-xs">未获</span><strong className="text-foreground text-sm font-medium truncate">{summary.remaining}</strong></div>
        <Popover onOpenChange={(open) => { if (open && !snap.academicGpaDetail) app.academic.loadAcademicGpaDetail(); }}>
          <PopoverTrigger className="grid gap-0.5 min-w-0 px-2.5 py-2 bg-card cursor-pointer hover:bg-accent text-left">
            <span className="text-muted-foreground text-xs">GPA</span>
            <strong className="text-foreground text-sm font-medium truncate">{serverSummary.serverGpa || "-"}</strong>
          </PopoverTrigger>
          <PopoverPopup side="bottom" align="start" className="min-w-[280px]">
            <div className="text-sm font-semibold mb-2">绩点明细</div>
            {snap.academicGpaDetail === null ? (
              <div className="text-muted-foreground text-xs">加载中...</div>
            ) : snap.academicGpaDetail.length === 0 ? (
              <div className="text-muted-foreground text-xs">暂无数据</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/50">
                      <th className="text-left font-medium py-1 pr-2">课程性质</th>
                      <th className="text-right font-medium px-2">学分</th>
                      <th className="text-right font-medium pl-2">绩点</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.academicGpaDetail.map((item, i) => (
                      <tr key={i} className="border-b border-border/30">
                        <td className="py-1.5 pr-2">{item.courseNature}</td>
                        <td className="text-right px-2">{item.credits}</td>
                        <td className="text-right pl-2 font-medium">{item.gpa}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PopoverPopup>
        </Popover>
        <div className="grid gap-0.5 min-w-0 px-2.5 py-2 bg-card"><span className="text-muted-foreground text-xs">计划课程</span><strong className="text-foreground text-sm font-medium truncate">{serverSummary.planPassedCourses ?? 0}/{serverSummary.planTotalCourses ?? 0}</strong></div>
        <div className="grid gap-0.5 min-w-0 px-2.5 py-2 bg-card"><span className="text-muted-foreground text-xs">未修/在读</span><strong className="text-foreground text-sm font-medium truncate">{serverSummary.planUnstartedCourses ?? 0}/{serverSummary.planStudyingCourses ?? 0}</strong></div>
      </div>
      <div className="academic-tree">
        <div className="academic-tree-head">
          <span></span><span>学分要求节点</span><span>学分</span><span>状态</span><span>明细</span><span></span>
        </div>
        {visibleNodes.length ? (
          visibleNodes.map((node) => <AcademicNode key={node.id} node={node} level={0} />)
        ) : (
          <div className="academic-empty text-muted-foreground"><FilterX className="inline size-4 mr-1 align-[-2px]" />当前筛选下没有匹配课程。</div>
        )}
      </div>
    </div>
  );
}
