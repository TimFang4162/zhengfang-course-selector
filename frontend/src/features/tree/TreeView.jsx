import { useSnapshot } from "valtio";
import { useAppContext } from "../../app/app-context.jsx";
import { classConflicts, classHasCapacity, classMuted, courseCompleted, courseExceedsCredit, courseMuted, isSelectedClass, isSelectedCourse, state } from "../../app/state.js";
import { classMatchesSearch, courseMatchesSearch, normalizedSearchQuery, textMatchesSearch } from "./search.js";
import { cx } from "../../shared/utils.js";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../../components/ui/menu";

function TreeRow({ level, selected, muted, expandable, expanded, onClick, onKeyDown, children }) {
  const labelColor = selected ? "text-success" : muted ? "text-muted-foreground" : level === 0 ? "text-foreground font-medium" : level === 1 ? "text-foreground" : "";
  return (
    <div
      className={cx(
        "tree-row",
        `level-${level}`,
        selected && "selected",
        muted && "muted",
        "group flex items-center min-h-[26px] gap-1 py-px px-2 border border-transparent text-foreground hover:bg-accent"
      )}
      role="treeitem"
      tabIndex="0"
      onClick={onClick}
      onKeyDown={onKeyDown || ((e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick?.(e); }
      })}
    >
      <span className={cx(
        "tree-arrow",
        expandable && "is-expandable",
        expanded && "is-expanded",
        "inline-flex shrink-0 w-4 h-5 items-center justify-center text-[11px] text-muted-foreground",
        expandable && "hover:text-foreground"
      )}>
        {expandable ? (expanded ? "▾" : "▸") : "·"}
      </span>
      <div className={cx("tree-label flex-1 min-w-0 whitespace-pre-wrap break-words text-[13px] leading-[1.45]", labelColor)}>{children}</div>
    </div>
  );
}

function RowChrome({ selectionState, checkLabel, onToggleCheck, children }) {
  const sel = selectionState || "inherit";
  const checkChar = sel === "include" ? "✓" : sel === "exclude" ? "-" : sel === "inherited" ? "✓" : sel === "partial" ? "·" : "";
  return (
    <div className="tree-row-grid">
      <button
        type="button"
        className={cx(`tree-check is-${sel}`, "group-[.muted]:opacity-55")}
        aria-label={checkLabel || "切换选择"}
        onClick={(e) => { e.stopPropagation(); onToggleCheck?.(e); }}
      >
        {checkChar}
      </button>
      {children}
    </div>
  );
}

function RowMoreMenu({ children }) {
  return (
    <Menu>
      <MenuTrigger><button type="button" className="tree-more-dot inline-flex size-5 items-center justify-center rounded-[2px] text-muted-foreground text-base leading-none opacity-0 group-hover:opacity-100 group-[.selected]:opacity-100 hover:bg-accent hover:text-foreground" onClick={(e) => e.stopPropagation()}>⋯</button></MenuTrigger>
      <MenuPopup align="end">{children}</MenuPopup>
    </Menu>
  );
}

function Cell({ className, children }) {
  return <span className={cx(className, "min-w-0 truncate")}>{children || "-"}</span>;
}

function TreeChip({ type, children }) {
  return <Badge variant={type === "selected" ? "info" : "secondary"}>{children}</Badge>;
}

function CourseSummary({ category, course }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const reasons = [
    isSelectedCourse(course) ? "已选" : null,
    snap.filters.credit && courseExceedsCredit(course) ? "超学分" : null,
    snap.filters.completed && courseCompleted(course) ? "已修读" : null,
  ].filter(Boolean);

  return (
    <RowChrome
      selectionState={app.tree.selectionDisplayState("course", category.id, course.kchId)}
      checkLabel={`切换课程 ${course.courseName} 的抢课选择`}
      onToggleCheck={() => app.tree.toggleCourseSelection(category.id, course.kchId)}
    >
      <div className="tree-table tree-course-table">
        <Cell className="tree-table-main text-inherit">{course.courseName} {reasons.map((r) => <TreeChip key={r} type={r === "已选" ? "selected" : ""}>{r}</TreeChip>)}</Cell>
        <Cell className="tree-table-code text-muted-foreground">{course.kchId}</Cell>
        <Cell className="tree-table-credit text-foreground">{course.creditText ? `${course.creditText}学分` : "-"}</Cell>
        <Cell className="tree-table-count text-muted-foreground">{course.classCount}教学班</Cell>
      </div>
      <RowMoreMenu>
        <MenuItem onClick={() => app.timetable.openCourseModal(category.id, course)}>显示详情</MenuItem>
        <MenuItem onClick={() => app.tree.refreshCourseClasses(category.id, course.kchId).catch(app.showError)}>刷新教学班</MenuItem>
      </RowMoreMenu>
    </RowChrome>
  );
}

function ClassSummary({ category, course, item }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  const teacher = item.teacherTitle ? `${item.teacherName}/${item.teacherTitle}` : item.teacherName || "未标注教师";
  const hasCap = classHasCapacity(item);
  const timeReasons = [
    snap.filters.conflict && classConflicts(item) && !isSelectedClass(item) ? "时间冲突" : null,
  ].filter(Boolean);

  return (
    <RowChrome
      selectionState={app.tree.selectionDisplayState("class", category.id, course.kchId, item)}
      checkLabel={`切换教学班 ${item.classNo} 的抢课选择`}
      onToggleCheck={() => app.tree.toggleClassSelection(category.id, course.kchId, item)}
    >
      <div className="tree-table tree-class-table">
        <Cell className="tree-table-code text-muted-foreground">{item.index}. {item.classNo}{isSelectedClass(item) ? <TreeChip type="selected">已选</TreeChip> : null}</Cell>
        <Cell className="tree-table-teacher text-muted-foreground">{teacher}</Cell>
        <Cell className="tree-table-time text-muted-foreground">{item.sksj} {timeReasons.map((r) => <TreeChip key={r}>{r}</TreeChip>)}</Cell>
        <Cell className="tree-table-location text-muted-foreground">{item.location}</Cell>
        <Cell className="tree-table-prop text-muted-foreground">{item.courseProperty}</Cell>
        <Cell className={cx("tree-table-count", snap.filters.highlightCapacity && hasCap ? "is-has-capacity text-success" : "text-muted-foreground")}>{item.selectedCount}/{item.capacity}</Cell>
      </div>
      <RowMoreMenu>
        <MenuItem onClick={() => app.timetable.openClassModal(category.id, course, item)}>显示详情</MenuItem>
        <MenuItem onClick={() => app.timetable.chooseOrWithdrawClass(category.id, course, item).catch(app.showError)}>{isSelectedClass(item) ? "退选" : "选课"}</MenuItem>
      </RowMoreMenu>
    </RowChrome>
  );
}

function ClassRows({ category, course }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.treeVersion;
  const tab = app.tree.activeCourseTab();
  const courseKey = `${category.id}:${course.kchId}`;
  const classItems = app.tree.classBucket(category.id, course.kchId, tab) || [];
  const query = tab?.localFilter || "";
  let renderItems = classItems;
  if (normalizedSearchQuery(state, query)) {
    renderItems = classItems.filter((item) => classMatchesSearch(state, item, query) || textMatchesSearch(state, query, course.courseName, course.kchId));
  }
  const loading = app.tree.loadingCourses(tab)?.has(courseKey);

  if (loading) return <div className="tree-children"><div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">加载教学班中...</div></div>;
  if (!classItems.length) return <div className="tree-children"><div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">展开后加载教学班</div></div>;
  if (!classItems.length) return <div className="tree-children"><div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">无教学班</div></div>;
  if (!renderItems.length) return <div className="tree-children"><div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">无匹配教学班</div></div>;

  return (
    <div className="tree-children">
      {renderItems.map((item) => (
        <TreeRow
          key={`${item.classKey || item.jxbId}`}
          level={2}
          selected={isSelectedClass(item)}
          muted={classMuted(course, item)}
          onClick={() => app.timetable.openClassModal(category.id, course, item)}
        >
          <ClassSummary category={category} course={course} item={item} />
        </TreeRow>
      ))}
    </div>
  );
}

function CourseRows({ category, course }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.treeVersion;
  const tab = app.tree.activeCourseTab();
  const courseKey = `${category.id}:${course.kchId}`;
  const expanded = app.tree.expandedCourses(tab)?.has(courseKey);

  return (
    <>
      <TreeRow
        level={1}
        selected={isSelectedCourse(course)}
        muted={courseMuted(category.id, course)}
        expandable
        expanded={expanded}
        onClick={() => app.tree.toggleCourse(category.id, course.kchId)}
      >
        <CourseSummary category={category} course={course} />
      </TreeRow>
      {expanded && <ClassRows category={category} course={course} />}
    </>
  );
}

function CategoryRows({ category, shouldRenderCourse }) {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.treeVersion;
  const tab = app.tree.activeCourseTab();
  const bucket = app.tree.categoryBucket(category.id, tab);
  const courses = bucket?.courses || [];
  const query = tab?.localFilter || "";
  let renderCourses = courses;
  if (normalizedSearchQuery(state, query)) {
    renderCourses = courses.filter((course) => shouldRenderCourse(category.id, course, query));
  }
  const categoryMuted = renderCourses.length > 0 && renderCourses.every((course) => courseMuted(category.id, course));
  const expanded = app.tree.expandedCategories(tab)?.has(category.id);
  const loading = app.tree.loadingCategories(tab)?.has(category.id);
  const countText = (() => {
    if (!bucket?.loaded) return "";
    const count = renderCourses.length;
    return bucket.hasMore ? `${count}+` : String(count);
  })();

  return (
    <>
      <TreeRow
        level={0}
        muted={categoryMuted}
        expandable
        expanded={expanded}
        onClick={() => app.tree.toggleCategory(category.id)}
      >
        <RowChrome
          selectionState={app.tree.selectionDisplayState("category", category.id)}
          checkLabel={`切换大类 ${category.name} 的抢课选择`}
          onToggleCheck={() => app.tree.toggleCategorySelection(category.id)}
        >
          {category.name}{countText && ` (${countText})`}
          <RowMoreMenu>
            <MenuItem onClick={() => app.tree.refreshCategoryCourses(category.id).catch(app.showError)}>刷新课程</MenuItem>
          </RowMoreMenu>
        </RowChrome>
      </TreeRow>
      {expanded && (
        <div className="tree-children">
          {(!bucket?.loaded && loading) ? (
            <div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">加载课程中...</div>
          ) : !bucket?.loaded ? (
            <div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">展开后加载课程</div>
          ) : (
            <>
              {renderCourses.map((course) => <CourseRows key={course.kchId} category={category} course={course} />)}
              {loading && <div className="tree-placeholder py-[5px] px-2 pl-6 text-muted-foreground text-xs">加载更多课程中...</div>}
              {!loading && bucket?.hasMore && (
                <Button variant="ghost" size="sm" onClick={() => {
                  app.tree.loadSearchCategoryCourses(tab, category.id, bucket.nextPage).catch(app.showError);
                }}>加载更多...</Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

export function TreeView() {
  const app = useAppContext();
  const snap = useSnapshot(state);
  void snap.treeVersion;
  const shouldRenderCourse = (categoryId, course) => {
    return courseMatchesSearch(state, categoryId, course, app.tree.activeCourseTab()?.localFilter || "");
  };

  return (
    <div id="course-tree" className="tree-view flex-1 py-1 pb-2 bg-background" data-tree-version={snap.treeVersion}>
      {snap.categories.map((category) => <CategoryRows key={category.id} category={category} shouldRenderCourse={shouldRenderCourse} />)}
    </div>
  );
}
