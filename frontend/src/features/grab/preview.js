export function grabContextPayload(context) {
  return {
    type: context.type,
    categoryId: context.category?.id,
    kchId: context.course?.kchId,
    classNo: context.classItem?.classNo,
  };
}
