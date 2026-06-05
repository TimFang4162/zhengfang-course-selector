import { For, Show } from "solid-js";
import { useAppContext } from "../../app/app-context.jsx";
import { classConflicts, classMuted, courseCompleted, courseExceedsCredit, courseMuted, isSelectedClass, isSelectedCourse, state } from "../../app/state.js";
import { classMatchesSearch, courseMatchesSearch, normalizedSearchQuery, textMatchesSearch } from "./search.js";

function TreeRow(props) {
  function activate(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onClick?.(event);
    }
  }

  return (
    <div
      class={`tree-row level-${props.level}${props.selected ? " selected" : ""}${props.muted ? " muted" : ""}`}
      role="treeitem"
      tabIndex="0"
      onClick={props.onClick}
      onKeyDown={activate}
    >
      <span class={`tree-arrow${props.expandable ? " is-expandable" : ""}${props.expanded ? " is-expanded" : ""}`}>
        {props.expandable ? (props.expanded ? "▾" : "▸") : "·"}
      </span>
      <div class="tree-label">{props.children}</div>
    </div>
  );
}

function RowChrome(props) {
  return (
    <div class="tree-row-grid">
      <span class={`tree-check${props.checked ? " is-checked" : ""}`}>{props.checked ? "✓" : ""}</span>
      {props.children}
      <button
        type="button"
        class="tree-more-dot"
        onClick={(event) => {
          event.stopPropagation();
          props.onMore?.(event.currentTarget);
        }}
      >⋯</button>
    </div>
  );
}

function Cell(props) {
  return <span class={props.className || ""}>{props.children || "-"}</span>;
}

function TreeChip(props) {
  return <span class={`tree-chip${props.type ? ` is-${props.type}` : ""}`}>{props.children}</span>;
}

function hasReactive(set, value) {
  state.treeVersion;
  return set.has(value);
}

function activeTreeTab(app) {
  state.treeVersion;
  return app.tree.activeCourseTab();
}

function CourseSummary(props) {
  const app = useAppContext();
  const reasons = () => [
    isSelectedCourse(props.course) ? "已选" : null,
    state.filters.credit && courseExceedsCredit(props.course) ? "超学分" : null,
    state.filters.completed && courseCompleted(props.course) ? "已修读" : null,
  ].filter(Boolean);

  return (
    <RowChrome checked={isSelectedCourse(props.course)} onMore={(anchor) => app.grab.openTreeMoreMenu(anchor, { type: "course", category: props.category, course: props.course })}>
      <div class="tree-table tree-course-table">
        <Cell className="tree-table-main">{props.course.courseName} <For each={reasons()}>{(reason) => <TreeChip type={reason === "已选" ? "selected" : ""}>{reason}</TreeChip>}</For></Cell>
        <Cell className="tree-table-code">{props.course.kchId}</Cell>
        <Cell className="tree-table-credit">{props.course.creditText ? `${props.course.creditText}学分` : "-"}</Cell>
        <Cell className="tree-table-count">{props.course.classCount}教学班</Cell>
      </div>
    </RowChrome>
  );
}

function ClassSummary(props) {
  const app = useAppContext();
  const teacher = () => props.item.teacherTitle ? `${props.item.teacherName}/${props.item.teacherTitle}` : props.item.teacherName || "未标注教师";
  const timeReasons = () => [
    isSelectedClass(props.item) ? "已选" : null,
    state.filters.conflict && classConflicts(props.item) && !isSelectedClass(props.item) ? "时间冲突" : null,
  ].filter(Boolean);

  return (
    <RowChrome checked={isSelectedClass(props.item)} onMore={(anchor) => app.grab.openTreeMoreMenu(anchor, { type: "class", category: props.category, course: props.course, classItem: props.item })}>
      <div class="tree-table tree-class-table">
        <Cell className="tree-table-code">{props.item.index}. {props.item.classNo}</Cell>
        <Cell className="tree-table-teacher">{teacher()}</Cell>
        <Cell className="tree-table-time">{props.item.sksj} <For each={timeReasons()}>{(reason) => <TreeChip type={reason === "已选" ? "selected" : ""}>{reason}</TreeChip>}</For></Cell>
        <Cell className="tree-table-location">{props.item.location}</Cell>
        <Cell className="tree-table-prop">{props.item.courseProperty}</Cell>
        <Cell className="tree-table-count">{props.item.selectedCount}/{props.item.capacity}</Cell>
      </div>
    </RowChrome>
  );
}

function ClassRows(props) {
  const app = useAppContext();
  const courseKey = () => `${props.category.id}:${props.course.kchId}`;
  const classItems = () => app.tree.classBucket(props.category.id, props.course.kchId, activeTreeTab(app));
  const renderClassItems = () => {
    const items = classItems() || [];
    const query = activeTreeTab(app)?.localFilter || "";
    if (!normalizedSearchQuery(state, query)) return items;
    return items.filter((item) => classMatchesSearch(state, item, query) || textMatchesSearch(state, query, props.course.courseName, props.course.kchId));
  };

  return (
    <div class="tree-children">
      <Show when={!hasReactive(app.tree.loadingCourses(activeTreeTab(app)), courseKey())} fallback={<div class="tree-placeholder">加载教学班中...</div>}>
        <Show when={classItems()} fallback={<div class="tree-placeholder">展开后加载教学班</div>}>
          <Show when={classItems().length} fallback={<div class="tree-placeholder">无教学班</div>}>
            <Show when={renderClassItems().length} fallback={<div class="tree-placeholder">无匹配教学班</div>}>
              <For each={renderClassItems()}>
                {(item) => (
                  <TreeRow
                    level={2}
                    selected={isSelectedClass(item)}
                    muted={classMuted(props.course, item)}
                    onClick={() => app.timetable.openClassModal(props.category.id, props.course, item)}
                  >
                    <ClassSummary category={props.category} course={props.course} item={item} />
                  </TreeRow>
                )}
              </For>
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

function CourseRows(props) {
  const app = useAppContext();
  const courseKey = () => `${props.category.id}:${props.course.kchId}`;

  return (
    <>
      <TreeRow
        level={1}
        selected={isSelectedCourse(props.course)}
        muted={courseMuted(props.category.id, props.course)}
        expandable
        expanded={hasReactive(app.tree.expandedCourses(activeTreeTab(app)), courseKey())}
        onClick={() => app.tree.toggleCourse(props.category.id, props.course.kchId)}
      >
        <CourseSummary category={props.category} course={props.course} />
      </TreeRow>
      <Show when={hasReactive(app.tree.expandedCourses(activeTreeTab(app)), courseKey())}>
        <ClassRows category={props.category} course={props.course} />
      </Show>
    </>
  );
}

function CategoryRows(props) {
  const app = useAppContext();
  const activeTab = () => activeTreeTab(app);
  const bucket = () => app.tree.categoryBucket(props.category.id, activeTab());
  const courses = () => bucket()?.courses || [];
  const renderCourses = () => {
    const query = activeTab()?.localFilter || "";
    if (!normalizedSearchQuery(state, query)) return courses();
    return courses().filter((course) => props.shouldRenderCourse(props.category.id, course, query));
  };
  const categoryMuted = () => renderCourses().length > 0 && renderCourses().every((course) => courseMuted(props.category.id, course));
  const categoryCountText = () => bucket()?.loaded && !bucket()?.hasMore ? String(renderCourses().length) : "?";

  return (
    <>
      <TreeRow
        level={0}
        muted={categoryMuted()}
        expandable
        expanded={hasReactive(app.tree.expandedCategories(activeTab()), props.category.id)}
        onClick={() => app.tree.toggleCategory(props.category.id)}
      >
        <RowChrome onMore={(anchor) => app.grab.openTreeMoreMenu(anchor, { type: "category", category: props.category })}>
          {props.category.name} ({categoryCountText()})
        </RowChrome>
      </TreeRow>
      <Show when={hasReactive(app.tree.expandedCategories(activeTab()), props.category.id)}>
        <div class="tree-children">
          <Show when={!(!bucket()?.loaded && hasReactive(app.tree.loadingCategories(activeTab()), props.category.id))} fallback={<div class="tree-placeholder">加载课程中...</div>}>
            <Show when={bucket()?.loaded} fallback={<div class="tree-placeholder">展开后加载课程</div>}>
              <For each={renderCourses()}>
                {(course) => <CourseRows category={props.category} course={course} />}
              </For>
              <Show when={hasReactive(app.tree.loadingCategories(activeTab()), props.category.id)}>
                <div class="tree-placeholder">加载更多课程中...</div>
              </Show>
              <Show when={!hasReactive(app.tree.loadingCategories(activeTab()), props.category.id) && bucket()?.hasMore}>
                <button type="button" class="tree-more" onClick={() => {
                  const tab = activeTab();
                  app.tree.loadSearchCategoryCourses(tab, props.category.id, bucket().nextPage).catch(app.showError);
                }}>加载更多...</button>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </>
  );
}

export function TreeView() {
  const app = useAppContext();
  const shouldRenderCourse = (categoryId, course) => {
    return courseMatchesSearch(state, categoryId, course, activeTreeTab(app)?.localFilter || "");
  };
  const visibleCategories = () => state.categories;

  return (
    <div id="course-tree" class="tree-view" data-tree-version={state.treeVersion}>
      <For each={visibleCategories()}>
        {(category) => <CategoryRows category={category} shouldRenderCourse={shouldRenderCourse} />}
      </For>
    </div>
  );
}
