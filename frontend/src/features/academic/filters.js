export function academicFilterTerms(nodes) {
  const terms = new Set();
  const walk = (items) => {
    for (const item of items || []) {
      for (const course of item.courses || []) {
        const value = [course.suggestedYear, course.suggestedTerm].filter(Boolean).join(" / ");
        if (value) terms.add(value);
      }
      walk(item.children || []);
    }
  };
  walk(nodes || []);
  return [...terms].filter(Boolean).sort();
}

export function academicFilterNatures(nodes) {
  const natures = new Set();
  const walk = (items) => {
    for (const item of items || []) {
      for (const course of item.courses || []) {
        if (course.courseNature) natures.add(String(course.courseNature).trim());
      }
      walk(item.children || []);
    }
  };
  walk(nodes || []);
  return [...natures].filter(Boolean).sort();
}
