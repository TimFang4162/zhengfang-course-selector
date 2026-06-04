import { classConflicts } from "../../app/state.js";

export const grabSymbols = [
  "course.id",
  "course.name",
  "course.credit",
  "course.categoryId",
  "class.id",
  "class.no",
  "class.teacher",
  "teachers",
  "class.time",
  "class.location",
  "class.capacityLeft",
  "class.capacity",
  "class.selected",
  "conflicts",
  "has_capacity",
];

export const grabSymbolDocs = {
  "course.id": "string：课程号，例如 course.id == \"xxxxxxxxx\"。",
  "course.name": "string：课程名称。",
  "course.credit": "number|null：课程学分。",
  "course.categoryId": "string：大类 ID。",
  "class.id": "string：教学班操作 ID，通常对应 doJxbId。",
  "class.no": "string：教学班号。",
  "class.teacher": "string：教师姓名。",
  teachers: "string[]：教师姓名和职称数组，可写 \"张\" in teachers。",
  "class.time": "string：上课时间文本。",
  "class.location": "string：上课地点。",
  "class.capacityLeft": "number：剩余容量。",
  "class.capacity": "number：容量。",
  "class.selected": "number：已选人数。",
  conflicts: "boolean：是否与当前课表冲突。",
  has_capacity: "boolean：是否有余量。",
};

export function defaultGrabExpression(context) {
  if (context.type === "category") return `course.categoryId == ${JSON.stringify(String(context.category.id))} and has_capacity and not conflicts`;
  if (context.type === "course") return `course.id == ${JSON.stringify(context.course.kchId)} and has_capacity and not conflicts`;
  return `course.id == ${JSON.stringify(context.course.kchId)} and class.no == ${JSON.stringify(context.classItem.classNo)} and has_capacity`;
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
    Function("course", "classItem", "teachers", "conflicts", "has_capacity", `return Boolean(${jsExpression});`);
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
      capacityLeft: Math.max(0, capacity - selected),
    } : null,
    teachers: [classItem?.teacherName, classItem?.teacherTitle].filter(Boolean),
    conflicts: classItem ? classConflicts(classItem) : false,
    has_capacity: classItem ? capacity > selected : true,
  };
}
