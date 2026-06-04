import { escapeHtml } from "../../shared/utils.js";

export function grabContextPayload(context) {
  return {
    type: context.type,
    categoryId: context.category?.id,
    kchId: context.course?.kchId,
    classNo: context.classItem?.classNo,
  };
}

export function renderGrabPreviewTree(data) {
  const sections = [];
  const missingCourseLoads = data.missing.courseLoads || [];
  const missingClassLoads = data.missing.classLoads || [];
  if (missingCourseLoads.length || missingClassLoads.length) {
    sections.push('<div class="grab-preview-section">缺失数据</div>');
    for (const item of missingCourseLoads) {
      sections.push(`
        <div class="grab-preview-tree-row level-0 is-missing"><span class="tree-arrow">▸</span><span>大类 ${escapeHtml(item.name)}</span></div>
        <div class="grab-preview-tree-row level-1 is-missing"><span class="tree-arrow">·</span><span>需要加载全部课程分页</span></div>
      `);
    }
    const byCategory = new Map();
    for (const item of missingClassLoads) {
      const key = `${item.categoryId}`;
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key).push(item);
    }
    for (const [categoryId, items] of byCategory.entries()) {
      sections.push(`<div class="grab-preview-tree-row level-0 is-missing"><span class="tree-arrow">▾</span><span>大类 ${escapeHtml(categoryId)}</span></div>`);
      for (const item of items) {
        sections.push(`<div class="grab-preview-tree-row level-1 is-missing"><span class="tree-arrow">·</span><span>${escapeHtml(item.courseName)} <span class="dim">${escapeHtml(item.kchId)}</span> 需要加载教学班</span></div>`);
      }
    }
  }
  if (data.matches.length) {
    sections.push('<div class="grab-preview-section">匹配结果</div>');
    const byCategory = new Map();
    for (const item of data.matches) {
      const categoryId = String(item.category.id);
      if (!byCategory.has(categoryId)) byCategory.set(categoryId, { category: item.category, courses: new Map() });
      const categoryBucket = byCategory.get(categoryId);
      const courseId = String(item.course.kchId);
      if (!categoryBucket.courses.has(courseId)) categoryBucket.courses.set(courseId, { course: item.course, classes: [] });
      categoryBucket.courses.get(courseId).classes.push(item.classItem);
    }
    for (const categoryBucket of byCategory.values()) {
      sections.push(`<div class="grab-preview-tree-row level-0"><span class="tree-arrow">▾</span><span>${escapeHtml(categoryBucket.category.name)}</span></div>`);
      for (const courseBucket of categoryBucket.courses.values()) {
        sections.push(`<div class="grab-preview-tree-row level-1"><span class="tree-arrow">▾</span><span>${escapeHtml(courseBucket.course.courseName)} <span class="dim">${escapeHtml(courseBucket.course.kchId)}</span></span></div>`);
        for (const classItem of courseBucket.classes) {
          if (!classItem) {
            sections.push('<div class="grab-preview-tree-row level-2"><span class="tree-arrow">·</span><span class="dim">待加载教学班</span></div>');
            continue;
          }
          sections.push(`<div class="grab-preview-tree-row level-2"><span class="tree-arrow">·</span><span>${escapeHtml(classItem.classNo)} <span class="dim">${escapeHtml(classItem.teacherName || "-")} · ${escapeHtml(classItem.location || "-")} · ${escapeHtml(`${classItem.selectedCount}/${classItem.capacity}`)}</span></span></div>`);
        }
      }
    }
  }
  return sections.join("") || '<div class="dim grab-preview-empty">没有匹配项。</div>';
}
