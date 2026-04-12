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

export function toErrorMessage(errorLike) {
  return errorLike?.message || String(errorLike);
}

export function applyRunFailure(refs, errorLike) {
  resetRunOutputRefs(refs);
  refs.error.value = toErrorMessage(errorLike);
}
