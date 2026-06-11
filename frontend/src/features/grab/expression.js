import { classConflicts } from "../../app/state.js";

export const grabSymbols = [
  "course.id",
  "course.name",
  "course.credit",
  "course.categoryId",
  "class.id",
  "class.no",
  "class.teacher",
  "class.time",
  "class.location",
  "class.selected",
  "class.capacity",
  "class.has_capacity",
  "class.not_conflicts",
];

export const grabSymbolDocs = {
  "course.id": "string：课程号，例如 course.id == \"xxxxxxxxx\"。",
  "course.name": "string：课程名称。",
  "course.credit": "number|null：课程学分。",
  "course.categoryId": "string：大类 ID。",
  "class.id": "string：教学班操作 ID，通常对应 doJxbId。",
  "class.no": "string：教学班号。",
  "class.teacher": "string：教师姓名。",
  "class.time": "string：上课时间文本。",
  "class.location": "string：上课地点。",
  "class.selected": "number：已选人数。运行时获取最新值。动态条件，不会缩小候选扫描范围。",
  "class.capacity": "number：容量。运行时获取最新值。动态条件，不会缩小候选扫描范围。",
  "class.has_capacity": "boolean：是否有余量（capacity > selected）。动态条件，不会缩小候选扫描范围。",
  "class.not_conflicts": "boolean：是否不与当前课表冲突。静态条件，可缩小候选扫描范围。",
};

export function defaultGrabExpression(context) {
  if (context.type === "selection") return buildSelectionGrabExpression(context.selection);
  throw new Error("抢课表达式只能从课程树选择规则生成");
}

function renderRuleItem(item) {
  if (item.type === "course") return `(course.categoryId == ${JSON.stringify(String(item.categoryId))} and course.id == ${JSON.stringify(String(item.kchId))})`;
  return `(course.categoryId == ${JSON.stringify(String(item.categoryId))} and course.id == ${JSON.stringify(String(item.kchId))} and class.no == ${JSON.stringify(String(item.classNo))})`;
}

export function buildSelectionGrabExpression(selection) {
  const includes = selection?.includes || [];
  const excludes = selection?.excludes || [];
  const includeExpr = includes.length ? includes.map(renderRuleItem).join(" or ") : "False";
  const excludeExpr = excludes.length ? excludes.map(renderRuleItem).join(" or ") : "False";
  if (excludes.length) return `(${includeExpr}) and not (${excludeExpr}) and class.has_capacity and class.not_conflicts`;
  return `(${includeExpr}) and class.has_capacity and class.not_conflicts`;
}

export function translateGrabExpression(expression) {
  return expression
    .replace(/\bclass\./g, "classItem.")
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!")
    .replace(/("[^"]*"|'[^']*')\s+in\s+([A-Za-z_][\w.\[\]]*)/g, "$2.includes($1)");
}

export function validateGrabExpression(expression) {
  const jsExpression = translateGrabExpression(expression);
  try {
    Function("course", "classItem", `return Boolean(${jsExpression});`);
    return { ok: true, jsExpression };
  } catch (error) {
    return { ok: false, error: error.message, jsExpression };
  }
}

export function buildGrabContext(course, category, classItem = null) {
  const selected = Number(classItem?.selectedCount || 0);
  const capacity = Number(classItem?.capacity || 0);
  return {
    course: {
      id: String(course.kchId),
      name: course.courseName,
      credit: course.creditValue,
      categoryId: String(category.id),
      classCount: course.classCount,
    },
    classItem: classItem ? {
      id: String(classItem.doJxbId || classItem.jxbId || ""),
      no: classItem.classNo,
      teacher: classItem.teacherName,
      time: classItem.sksj,
      location: classItem.location,
      selected,
      capacity,
      has_capacity: capacity > selected,
      not_conflicts: !classConflicts(classItem),
    } : null,
  };
}
