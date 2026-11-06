<template>
	<!-- The sections this role does not see (AWS-console rule: nothing disappears without a word). ONE note of the cause "role", the same box as every
	     other role notice (N2): it says WHICH role the person has, how many sections it hides and which role opens them. Signed out the chip of the bar
	     says it, so nothing is drawn here. Give it ALL the sections of the page ({ min }). -->
	<session-notice v-if="hidden" class="hidden-note" variant="section" kind="role" :text="text" />
</template>

<script>
'use strict'

import SessionNotice from './SessionNotice.vue'
import { ts } from './shared-t.js'
import { roleMixin } from './role-mixin.js'
import { roleLabel } from './notice-kind.js'
import { signedOut, workshopRole } from './workshop-auth.js'

const ORDER = ['viewer', 'operator', 'technician', 'admin']

export default {
	components: { SessionNotice },
	mixins: [roleMixin],
	props: { sections: { type: Array, default: () => [] } },
	computed: {
		// the sections this person does not reach (nothing while signed out: the chip of the bar says it)
		blocked() {
			void this.identityTick
			if (signedOut()) return []
			return this.sections.filter(s => s && s.min && !this.atLeast(s.min))
		},
		hidden() {
			return this.blocked.length > 0
		},
		text() {
			const needed = this.blocked.map(s => s.min).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0]
			return ts('notice_hidden', { n: this.blocked.length, role: roleLabel(workshopRole(), ts), needed: roleLabel(needed, ts) })
		}
	}
}
</script>
