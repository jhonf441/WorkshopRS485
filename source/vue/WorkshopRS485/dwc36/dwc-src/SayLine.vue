<template>
	<!-- the message of an action: a refusal (no session / role too low) is the calm reason of its cause, a failure is red, a success is green.
	     `text` is a string (a success, or a text of the page) or a failure kept as { error, label } (session-refusal.js failureOf): the sentence and the cause are
	     computed here, from the error, so they follow the role and the language. -->
	<lock-reason v-if="cause" :kind="cause" :need="need" :action="what" />
	<div v-else-if="line" :class="error ? 'error--text' : 'success--text'">{{ line }}</div>
</template>

<script>
'use strict'

import LockReason from './LockReason.vue' // vue/_shared36
import { roleMixin } from './role-mixin.js' // vue/_shared36
import { failureActionNow, failureCauseNow, failureNow } from './session-refusal.js' // vue/_shared36

export default {
	components: { LockReason },
	mixins: [roleMixin],
	props: {
		text: { type: [String, Object], default: '' },
		error: { type: Boolean, default: false },
		// the role a refused call needs, and what the person was doing (translated): the 403 sentence names both
		need: { type: String, default: 'technician' },
		action: { type: String, default: '' }
	},
	computed: {
		failure() {
			return this.text && typeof this.text === 'object' ? this.text : null
		},
		cause() {
			void this.identityTick
			return this.failure ? failureCauseNow(this.failure) : ''
		},
		what() {
			void this.identityTick
			return this.action || (this.failure ? failureActionNow(this.failure) : '')
		},
		line() {
			void this.identityTick
			return this.failure ? failureNow(this.failure, this.need, this.action) : this.text
		}
	}
}
</script>
