// Vue ref management helpers for the run lifecycle in main.ts.
// Extracted here so the reset/failure logic stays out of the orchestration
// function and can be tested or reused independently.

// Resets all output-related Vue refs to their empty/null initial state.
// Called at the start of every run() invocation to clear stale results
// before new ones are written.
export function resetRunOutputRefs(refs) {
  refs.boxes.value = [];
  refs.missingEditionList.value = [];
  refs.missingEditionTotal.value = 0;
  refs.binderTotal.value = 0;
  refs.totalCards.value = 0;
  refs.selectedBoxIndex.value = null;
  refs.selectedSetInfo.value = null;
  refs.hoveredSegment.value = null;
}

// Normalises any thrown value (Error object, string, etc.) to a plain message
// string suitable for display in the UI error banner.
export function toErrorMessage(errorLike) {
  return errorLike?.message || String(errorLike);
}

// Resets output refs and writes the error message when a run() call throws.
// Centralises the catch-block behaviour so main.ts doesn't need to know the
// shape of the error object.
export function applyRunFailure(refs, errorLike) {
  resetRunOutputRefs(refs);
  refs.error.value = toErrorMessage(errorLike);
}
