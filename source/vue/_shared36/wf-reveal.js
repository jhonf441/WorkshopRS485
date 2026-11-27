'use strict'

// The reveal of a result that appears far from its button, for the plugin pages: reveal-mixin.js (a twin of the service page: scroll under DWC's fixed bar ONLY when it is out of view,
// highlight, focus, the sentence for the screen reader) plus the rules it needs (wf-guard-style.js). A component says
//     mixins: [wfRevealMixin]       <span class="wf-vh" role="status" aria-live="polite">{{ said }}</span>      this.showResult(el, { said, focus: true })
import { revealMixin } from './reveal-mixin.js'
import { ensureGuardStyle } from './wf-guard-style.js'

export const wfRevealMixin = {
	mixins: [revealMixin],
	created() {
		ensureGuardStyle()
	}
}
