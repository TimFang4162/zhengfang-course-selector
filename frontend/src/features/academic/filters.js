function collectNodeCourses(nodes, nodeCourses) {
  const out = [];
  function walk(items) {
    for (const item of items || []) {
      const loaded = nodeCourses?.[item.id];
      if (Array.isArray(loaded)) out.push(...loaded);
      out.push(...(item.courses || []));
      walk(item.children || []);
    }
  }
  walk(nodes || []);
  return out;
}

export function academicFilterTerms(nodes, nodeCourses) {
  const terms = new Set();
  for (const course of collectNodeCourses(nodes, nodeCourses)) {
    const value = [course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ");
    if (value) terms.add(value);
  }
  return [...terms].filter(Boolean).sort();
}

export function academicFilterNatures(nodes, nodeCourses) {
  const natures = new Set();
  for (const course of collectNodeCourses(nodes, nodeCourses)) {
    if (course.courseNature) natures.add(String(course.courseNature).trim());
  }
  return [...natures].filter(Boolean).sort();
}
