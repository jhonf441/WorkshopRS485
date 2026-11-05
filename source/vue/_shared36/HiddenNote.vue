<template>
	<!-- A quiet reason for the sections the person cannot see (AWS-console rule: nothing disappears without a word). The sign-in call is the chip of
	     the page bar, not here. Give it ALL the sections of the page ({ min }); it shows only when some need more than the person has. -->
	<lock-reason v-if="hidden" class="hidden-note" :kind="kind" :text="ts('notice_hidden')" />
</template>

<script>
'use strict'

import LockReason from './LockReason.vue'
import { ts } from './shared-t.js'
import { roleMixin } from './role-mixin.js'
import { signedOut } from './workshop-auth.js'

export default {
	components: { LockReason },
	mixins: [roleMixin],
	props: { sections: { type: Array, default: () => [] } },
	computed: {
		hidden() {
			void this.identityTick
			return this.sections.some(s => s && s.min && !this.atLeast(s.min))
		},
		kind() {
			void this.identityTick
			return signedOut() ? 'session' : 'role'
		}
	},
	methods: { ts }
}
</script>
