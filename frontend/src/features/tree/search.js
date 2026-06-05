export function normalizedSearchQuery(state, query = state.search.query) {
  return String(query || "").trim().toLowerCase();
}

export function textMatchesSearch(state, queryOrPart, ...parts) {
  const hasExplicitQuery = parts.length > 0;
  const query = normalizedSearchQuery(state, hasExplicitQuery ? queryOrPart : state.search.query);
  const values = hasExplicitQuery ? parts : [queryOrPart];
  if (!query) return true;
  return values.filter(Boolean).some((part) => String(part).toLowerCase().includes(query));
}

export function classMatchesSearch(state, item, query = state.search.query) {
  return textMatchesSearch(state, query, item.classNo, item.teacherName, item.teacherTitle, item.teacherId, item.sksj, item.location, item.courseProperty);
}

export function courseMatchesSearch(state, categoryId, course, query = state.search.query) {
  if (!textMatchesSearch(state, query, course.courseName, course.kchId, course.creditText, course.classCount)) {
    const classStore = state.courseEntities.classes[categoryId] || {};
    const entity = state.courseEntities.courses[categoryId]?.[course.kchId];
    const classItems = (entity?.classIds || []).map((key) => classStore[key]).filter(Boolean);
    return classItems.some((item) => classMatchesSearch(state, item, query));
  }
  return true;
}
