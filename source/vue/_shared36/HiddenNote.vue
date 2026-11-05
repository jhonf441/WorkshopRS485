<template>
	<!-- A quiet line for the sections the person cannot see (2026-11-04, AWS-console rule: nothing disappears without a word).
	     Give it ALL the sections of the page ({ min }); it shows only when some need more than the person has. -->
	<div v-if="hidden" class="hidden-note text-caption" role="note">
		<v-icon x-small left>mdi-lock-outline</v-icon>
		<span>{{ ts('lock_hidden_note') }}</span>
		<a v-if="out" href="#" class="ml-1" @click.prevent="signIn">{{ ts('header_sign_in') }}</a>
	</div>
</template>

<script>
'use strict'

import { ts } from './shared-t.js'
import { roleMixin } from './role-mixin.js'
import { askLogin } from './workshop-api.js'
import { signedOut } from './workshop-auth.js'

export default {
	mixins: [roleMixin],
	props: { sections: { type: Array, default: () => [] } },
	computed: {
		hidden() {
			void this.identityTick
			return this.sections.some(s => s && s.min && !this.atLeast(s.min))
		},
		out() {
			void this.identityTick
			return signedOut()
		}
	},
	methods: {
		ts,
		signIn() {
			askLogin()
		}
	}
}
</script>

<style scoped>
.hidden-note {
	opacity: 0.75;
	padding: 4px 8px;
}
</style>
