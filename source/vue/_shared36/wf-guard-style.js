'use strict'

// The few rules of the unsaved-changes guard and of the reveal of a far result, for the plugin pages. They are written ONCE in the page (a <style id="wf-guard-style">), not in
// family.css: the service page keeps the same rules in its own kit.css and the family file is a generated twin shared with the JS pages. Colours only through the --wf-c-* tokens.
// ensureGuardStyle() is safe to call many times and in node (no document: nothing happens).
export const GUARD_CSS = [
	'[data-reveal] { scroll-margin-top: 80px; }',
	'@keyframes wf-flash { to { background: transparent; box-shadow: inset 4px 0 transparent; } }',
	'[data-revealed] { background: var(--wf-c-info-bg); box-shadow: inset 4px 0 var(--wf-c-info); }',
	'@media (prefers-reduced-motion: no-preference) { [data-revealed] { animation: wf-flash 1.8s ease-out; } }',
	'.wf-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }',
	'.wf-unsaved { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border: 1px solid var(--wf-c-warning); border-radius: 999px; font-size: 12px; font-weight: 600; }',
	'.wf-unsaved-title { font-size: 18px; }',
	'.wf-unsaved-actions { flex-wrap: wrap; gap: 8px; padding: 8px 16px 16px; }',
	// 7 classes: wins over the 32 px of the family (.workshop-theme .v-btn:not(...) x4 = 6) and over Vuetify's 36 px height, whatever the order of the style sheets
	'.wf-unsaved-dialog.workshop-theme .wf-unsaved-actions .v-btn.v-btn.v-btn.wf-unsaved-btn { margin: 0; min-height: var(--wf-hit, 40px); min-width: var(--wf-hit, 40px); }',
	'.wf-unsaved-dialog.workshop-theme .wf-unsaved-actions .v-btn.v-btn.v-btn.wf-unsaved-discard { margin-left: 16px; }',
	'.wf-unsaved-dialog { z-index: 400; }'
].join('\n')

export function ensureGuardStyle() {
	if (typeof document === 'undefined' || !document.head || typeof document.getElementById !== 'function') return
	if (document.getElementById('wf-guard-style')) return
	const st = document.createElement('style')
	st.id = 'wf-guard-style'
	st.textContent = GUARD_CSS
	document.head.appendChild(st)
}
