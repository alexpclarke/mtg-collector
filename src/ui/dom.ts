// DOM utilities that perform direct manipulation outside of Vue's control.
// Kept separate so the Vue layer (main.ts) stays declarative.

// Opens a URL in a new tab without leaving a dangling <a> element in the DOM.
// Uses rel="noopener noreferrer" to prevent the opened page from accessing
// window.opener (security best practice for outbound links).
export function openExternalLink(url) {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

// Traps keyboard focus inside a Carbon modal container when Tab is pressed.
// Prevents focus from escaping to background content, which is required for
// WCAG 2.1 SC 2.1.2 (No Keyboard Trap) compliance in modal dialogs.
export function trapModalFocus(event) {
  if (event.key !== "Tab") return;
  const root = event.currentTarget;
  const container = root?.querySelector?.(".cds--modal-container");
  if (!container) return;

  const focusable = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    last.focus();
    event.preventDefault();
  } else if (!event.shiftKey && active === last) {
    first.focus();
    event.preventDefault();
  }
}
