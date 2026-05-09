// Pure color utilities. Derives deterministic display colors from string codes.
// No DOM access, no Vue, no domain logic.

export function colorForCode(code) {
  let hash = 0;
  for (let i = 0; i < code.length; i += 1) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 62% 48%)`;
}
