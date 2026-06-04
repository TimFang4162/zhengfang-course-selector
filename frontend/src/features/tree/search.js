export function normalizedSearchQuery(state) {
  return state.search.query.trim().toLowerCase();
}

export function textMatchesSearch(state, ...parts) {
  const query = normalizedSearchQuery(state);
  if (!query) return true;
  return parts.filter(Boolean).some((part) => String(part).toLowerCase().includes(query));
}

export function classMatchesSearch(state, item) {
  return textMatchesSearch(state, item.classNo, item.teacherName, item.teacherTitle, item.sksj, item.location, item.courseProperty);
}

export function courseMatchesSearch(state, categoryId, course) {
  if (!textMatchesSearch(state, course.courseName, course.kchId, course.creditText, course.classCount)) {
    const classItems = state.courseClasses[`${categoryId}:${course.kchId}`] || [];
    return classItems.some((item) => classMatchesSearch(state, item));
  }
  return true;
}

export function categoryInSearchScope(state, categoryId) {
  return state.search.scope === "all" || state.search.scope === categoryId;
}
