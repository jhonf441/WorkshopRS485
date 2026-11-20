<template>
	<!-- The screen is for a mode the machine is not in now (mode-gate.js, state elsewhere / unknown): ONE thin note on top, the screen below stays for
	     reading. It is the ONE notice component of the session (SessionNotice, neutral "empty" cause: information, not a failure). Nothing is drawn when
	     the mode is right or when the machine does not use the mode (the page then does not show the section at all: gate.show). -->
	<session-notice v-if="text" class="mode-notice" variant="section" kind="empty" :text="text" />
</template>

<script>
'use strict'

import SessionNotice from './SessionNotice.vue'
import { modeGateMixin } from './mode-gate-mixin.js'
import { ts } from './shared-t.js'

// <mode-notice :needs="['FFF']" /> : the sentence says what works in which mode and what the machine is in. Reading is never blocked by it.
export default {
	components: { SessionNotice },
	mixins: [modeGateMixin],
	props: { needs: { type: Array, required: true } },
	computed: {
		gate() {
			return this.gateOf(this.needs)
		},
		text() {
			if (!this.gate.show) return ''
			const why = this.modeBlock(this.needs)
			return why && this.gate.state === 'elsewhere' ? why + ' ' + ts('mode_change_hint') : why
		}
	}
}
</script>
