<template>
	<v-alert v-if="text" dense outlined :type="kind === 'role' ? 'warning' : 'error'" class="mb-2 error-notice" role="alert">
		<div class="d-flex align-center flex-wrap" style="gap:8px">
			<span class="error-notice-text">{{ text }}</span>
			<v-spacer />
			<v-btn v-if="showLogin" x-small outlined @click="identify">{{ ts('err_identify') }}</v-btn>
			<v-btn v-if="retry" x-small outlined @click="$emit('retry')">{{ ts('err_retry') }}</v-btn>
		</div>
	</v-alert>
</template>

<script>
'use strict'

// A failed call of the API as a person reads it (F3-V, 2026-10-21): what happened in the language of DWC, a button to identify
// yourself when a PIN is what is missing, and a button to try again. Nothing here retries by itself: a page that fails says so.
// The text and the kind come from friendly-error.js; the PIN dialog is the one of workshop-api.js (askLogin).
//
//   <error-notice :error="error" retry @retry="load()" />      error: ApiError | Error | string | null (null = nothing shown)

import { ts } from './shared-t.js'
import { askLogin } from './workshop-api.js'
import { currentIdentity } from './workshop-auth.js'
import { errorKind, errorText, needsLogin } from './friendly-error.js'

export default {
	props: {
		error: { type: [Error, Object, String], default: null },
		retry: { type: Boolean, default: false }
	},
	computed: {
		kind() {
			return errorKind(this.error)
		},
		text() {
			if (!this.error) return ''
			if (typeof this.error === 'string') return this.error
			return errorText(this.error, ts)
		},
		showLogin() {
			return !!this.error && typeof this.error !== 'string' && needsLogin(this.error, currentIdentity())
		}
	},
	methods: {
		ts,
		async identify() {
			if (await askLogin()) this.$emit('retry')
		}
	}
}
</script>
