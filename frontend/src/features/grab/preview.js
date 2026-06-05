export function grabContextPayload(context) {
  return {
    type: "selection",
    selection: context.selection,
  };
}
