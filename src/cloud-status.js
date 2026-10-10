// Presentation state for the compact indicator; the full message remains available.
export function cloudStatusState(message) {
  if (/disconnected|offline|not saved|could not|missing|failed|unavailable|sign in|paused|deleted|choose.*version|edits in both|error/i.test(message)) return 'disconnected';
  if (/pending|saving|deleting/i.test(message)) return 'saving';
  if (/saved|updated from another browser|test copy ready/i.test(message)) return 'saved';
  return 'connecting';
}
