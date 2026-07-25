const HOSHI_POPUP_SELECTOR = /iframe\s*\.hoshi-popup/g

export function scopeMiningPopupOuterCss (css: string, scopeSelector: string): string {
  const compatibleCss = css.replace(HOSHI_POPUP_SELECTOR, ':scope')

  return `@scope (${scopeSelector}) {\n${compatibleCss}\n}`
}
