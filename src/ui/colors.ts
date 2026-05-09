// Pure color utilities. Derives deterministic display colors from string codes.
// No DOM access, no Vue, no domain logic.
import {
  purple70, cyan50, teal70, magenta70, red50, red90,
  green60, blue80, magenta50, yellow50, teal50, blue90,
  orange70, purple50,
} from "@carbon/colors";

// Carbon Design System categorical palette for data visualization.
// Source: https://carbondesignsystem.com/data-visualization/color-palettes/
// Ordered to maximise contrast between consecutive entries — each step
// alternates warm/cool and light/dark so that set codes with adjacent hash
// values still produce visually distinct segment colors.
const CARBON_CATEGORICAL_PALETTE = [
  purple70,  // dark purple   (cool, dark)
  red50,     // bright red    (warm, light)
  teal50,    // teal          (cool, mid)
  yellow50,  // gold          (warm, mid)
  blue80,    // dark blue     (cool, dark)
  magenta50, // bright pink   (warm, light)
  green60,   // green         (cool, mid)
  orange70,  // dark orange   (warm, dark)
  cyan50,    // bright blue   (cool, light)
  red90,     // dark maroon   (warm, dark)
  purple50,  // light purple  (cool, light)
  teal70,    // dark teal     (cool, dark)
  magenta70, // dark pink     (warm, dark)
  blue90,    // navy          (cool, dark)
];

// Hashes a set code string to a stable index into the Carbon categorical
// palette, producing a unique but consistent color for each set. Using the
// Carbon palette ensures adjacent segments are visually distinct and the
// colors remain consistent with the rest of the Carbon UI.
export function colorForIndex(index) {
  return CARBON_CATEGORICAL_PALETTE[Math.abs(index) % CARBON_CATEGORICAL_PALETTE.length];
}
