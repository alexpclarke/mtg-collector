import test from "node:test";
import assert from "node:assert/strict";
import { resetRunOutputRefs, applyRunFailure } from "../../src/ui/run-state.js";

function ref(value) {
  return { value };
}

test("given prior run output state when resetting outputs then stale boxes and metrics are cleared", () => {
  const refs = {
    boxes: ref([{ label: "2020", totalCount: 100, sets: [] }]),
    missingEditionList: ref([{ name: "Card" }]),
    missingEditionTotal: ref(7),
    binderTotal: ref(9),
    totalCards: ref(123),
    selectedBoxIndex: ref(2),
    selectedSetInfo: ref({ code: "abc" }),
    hoveredSegment: ref({ boxIndex: 1 }),
  };

  resetRunOutputRefs(refs);

  assert.deepEqual(refs.boxes.value, []);
  assert.deepEqual(refs.missingEditionList.value, []);
  assert.equal(refs.missingEditionTotal.value, 0);
  assert.equal(refs.binderTotal.value, 0);
  assert.equal(refs.totalCards.value, 0);
  assert.equal(refs.selectedBoxIndex.value, null);
  assert.equal(refs.selectedSetInfo.value, null);
  assert.equal(refs.hoveredSegment.value, null);
});

test("given a run failure when applying failure state then outputs are cleared and error message is set", () => {
  const refs = {
    boxes: ref([{ label: "2020", totalCount: 100, sets: [] }]),
    missingEditionList: ref([{ name: "Card" }]),
    missingEditionTotal: ref(7),
    binderTotal: ref(9),
    totalCards: ref(123),
    selectedBoxIndex: ref(2),
    selectedSetInfo: ref({ code: "abc" }),
    hoveredSegment: ref({ boxIndex: 1 }),
    error: ref(""),
  };

  applyRunFailure(refs, new Error("network down"));

  assert.deepEqual(refs.boxes.value, []);
  assert.deepEqual(refs.missingEditionList.value, []);
  assert.equal(refs.missingEditionTotal.value, 0);
  assert.equal(refs.binderTotal.value, 0);
  assert.equal(refs.totalCards.value, 0);
  assert.equal(refs.selectedBoxIndex.value, null);
  assert.equal(refs.selectedSetInfo.value, null);
  assert.equal(refs.hoveredSegment.value, null);
  assert.equal(refs.error.value, "network down");
});
