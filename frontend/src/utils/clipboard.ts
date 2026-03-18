/**
 * copyToClipboard - A robust clipboard copy utility.
 *
 * Attempts to use the modern Clipboard API first (requires HTTPS or localhost).
 * Falls back to the legacy execCommand approach which works in HTTP contexts.
 *
 * @returns true if the copy succeeded, false otherwise.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Modern API (requires Secure Context: HTTPS or localhost)
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy fallback
    }
  }

  // Legacy fallback using a temporary textarea + execCommand
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}
