import { classConflictMuted, classMuted, courseMuted, isSelectedClass, isSelectedCourse } from "../../app/state.js";
import { categoryInSearchScope, classMatchesSearch, courseMatchesSearch, normalizedSearchQuery, textMatchesSearch } from "./search.js";

function makeTreeRow({ level, label, selected = false, muted = false, expandable = false, expanded = false, onClick }) {
  const row = document.createElement("div");
  row.className = `tree-row level-${level}${selected ? " selected" : ""}${muted ? " muted" : ""}`;
  const arrow = document.createElement("span");
  arrow.className = `tree-arrow${expandable ? " is-expandable" : ""}${expanded ? " is-expanded" : ""}`;
  arrow.textContent = expandable ? (expanded ? "▾" : "▸") : "·";
  const text = document.createElement("div");
  text.className = "tree-label";
  if (label instanceof Node) text.appendChild(label);
  else text.textContent = label;
  row.append(arrow, text);
  row.addEventListener("click", onClick);
  return row;
}

function makeCell(text, className = "") {
  const cell = document.createElement("span");
  cell.className = className;
  cell.textContent = text || "-";
  return cell;
}

function makeRowChrome(content, { checked = false, onMore = null } = {}) {
  const row = document.createElement("div");
  row.className = "tree-row-grid";
  const checkbox = document.createElement("span");
  checkbox.className = `tree-check${checked ? " is-checked" : ""}`;
  checkbox.textContent = checked ? "✓" : "";
  const more = document.createElement("span");
  more.className = "tree-more-dot";
  more.textContent = "⋯";
  more.addEventListener("click", (event) => {
    event.stopPropagation();
    if (onMore) onMore(more);
  });
  row.append(checkbox, content, more);
  return row;
}

function courseSummary(app, category, course) {
  const table = document.createElement("div");
  table.className = "tree-table tree-course-table";
  table.append(
    makeCell(course.courseName, "tree-table-main"),
    makeCell(course.kchId, "tree-table-code"),
    makeCell(course.creditText ? `${course.creditText}学分` : "-", "tree-table-credit"),
    makeCell(`${course.classCount}教学班`, "tree-table-count"),
  );
  return makeRowChrome(table, {
    checked: isSelectedCourse(course),
    onMore: (anchor) => app.grab.openTreeMoreMenu(anchor, { type: "course", category, course }),
  });
}

function classSummary(app, category, course, item) {
  const teacher = item.teacherTitle ? `${item.teacherName}/${item.teacherTitle}` : item.teacherName || "未标注教师";
  const countText = `${item.selectedCount}/${item.capacity}`;
  const table = document.createElement("div");
  table.className = "tree-table tree-class-table";
  table.append(
    makeCell(`${item.index}. ${item.classNo}`, "tree-table-code"),
    makeCell(teacher, "tree-table-teacher"),
    makeCell(item.sksj, "tree-table-time"),
    makeCell(item.location, "tree-table-location"),
    makeCell(item.courseProperty, "tree-table-prop"),
    makeCell(countText, "tree-table-count"),
  );
  return makeRowChrome(table, {
    checked: isSelectedClass(item),
    onMore: (anchor) => app.grab.openTreeMoreMenu(anchor, { type: "class", category, course, classItem: item }),
  });
}

export function createTreeRenderer({ state, getApp, shouldRenderCourse }) {
  return function renderTree() {
    const app = getApp();
    const root = document.getElementById("course-tree");
    root.innerHTML = "";
    for (const category of state.categories) {
      if (!categoryInSearchScope(state, category.id)) continue;
      const bucket = state.categoryCourses[category.id];
      const courses = bucket?.courses || [];
      const categoryLoading = state.loadingCategories.has(category.id);
      const visibleCourses = courses.filter((course) => shouldRenderCourse(category.id, course));
      const renderCourses = normalizedSearchQuery(state) ? visibleCourses : courses;
      const categoryMuted = renderCourses.length > 0 && renderCourses.every((course) => courseMuted(category.id, course));
      const categoryCountText = bucket?.loaded && !bucket?.hasMore ? String(renderCourses.length) : "?";
      const label = `${category.name} (${categoryCountText})`;
      const categoryLabel = makeRowChrome(document.createTextNode(label), {
        onMore: (anchor) => app.grab.openTreeMoreMenu(anchor, { type: "category", category }),
      });
      const categoryRow = makeTreeRow({
        level: 0,
        label: categoryLabel,
        muted: categoryMuted,
        expandable: true,
        expanded: state.expandedCategories.has(category.id),
        onClick: () => app.tree.toggleCategory(category.id),
      });
      root.appendChild(categoryRow);
      if (!state.expandedCategories.has(category.id)) continue;
      const children = document.createElement("div");
      children.className = "tree-children";
      if (!bucket?.loaded && categoryLoading) {
        const placeholder = document.createElement("div");
        placeholder.className = "tree-placeholder";
        placeholder.textContent = "加载课程中...";
        children.appendChild(placeholder);
      } else if (!bucket?.loaded) {
        const placeholder = document.createElement("div");
        placeholder.className = "tree-placeholder";
        placeholder.textContent = "展开后加载课程";
        children.appendChild(placeholder);
      } else {
        for (const course of renderCourses) {
          const courseKey = `${category.id}:${course.kchId}`;
          const labelText = courseSummary(app, category, course);
          if (isSelectedCourse(course)) labelText.querySelector(".tree-table-main").textContent += " (已选)";
          const courseRow = makeTreeRow({
            level: 1,
            label: labelText,
            selected: isSelectedCourse(course),
            muted: courseMuted(category.id, course),
            expandable: true,
            expanded: state.expandedCourses.has(courseKey),
            onClick: () => app.tree.toggleCourse(category.id, course.kchId),
          });
          children.appendChild(courseRow);
          if (!state.expandedCourses.has(courseKey)) continue;
          const classChildren = document.createElement("div");
          classChildren.className = "tree-children";
          const classItems = state.courseClasses[courseKey];
          if (state.loadingCourses.has(courseKey)) {
            const placeholder = document.createElement("div");
            placeholder.className = "tree-placeholder";
            placeholder.textContent = "加载教学班中...";
            classChildren.appendChild(placeholder);
          } else if (!classItems) {
            const placeholder = document.createElement("div");
            placeholder.className = "tree-placeholder";
            placeholder.textContent = "展开后加载教学班";
            classChildren.appendChild(placeholder);
          } else if (!classItems.length) {
            const placeholder = document.createElement("div");
            placeholder.className = "tree-placeholder";
            placeholder.textContent = "无教学班";
            classChildren.appendChild(placeholder);
          } else {
            const renderClassItems = classItems.filter((item) => {
              if (!normalizedSearchQuery(state)) return true;
              return classMatchesSearch(state, item) || textMatchesSearch(state, course.courseName, course.kchId);
            });
            if (!renderClassItems.length) {
              const placeholder = document.createElement("div");
              placeholder.className = "tree-placeholder";
              placeholder.textContent = "无匹配教学班";
              classChildren.appendChild(placeholder);
            }
            for (const item of renderClassItems) {
              const row = makeTreeRow({
                level: 2,
                label: classSummary(app, category, course, item),
                selected: isSelectedClass(item),
                muted: classMuted(course, item) || classConflictMuted(item),
                onClick: () => app.timetable.openClassModal(category.id, course, item),
              });
              classChildren.appendChild(row);
            }
          }
          children.appendChild(classChildren);
        }
        if (categoryLoading) {
          const placeholder = document.createElement("div");
          placeholder.className = "tree-placeholder";
          placeholder.textContent = "加载更多课程中...";
          children.appendChild(placeholder);
        } else if (bucket?.hasMore) {
          const more = document.createElement("button");
          more.className = "tree-more";
          more.textContent = "加载更多...";
          more.addEventListener("click", () => app.tree.loadCategoryCourses(category.id, bucket.nextPage).catch(app.showError));
          children.appendChild(more);
        }
      }
      root.appendChild(children);
    }
  };
}
