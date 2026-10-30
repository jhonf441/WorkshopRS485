<template>
	<v-alert v-if="text" density="compact" variant="outlined" :type="kind === 'role' ? 'warning' : 'error'" class="mb-2 error-notice" role="alert">
		<div class="d-flex align-center flex-wrap" style="gap:8px">
			<span class="error-notice-text">{{ text }}</span>
			<v-spacer />
			<v-btn v-if="showLogin" size="x-small" variant="outlined" @click="identify">{{ ts('err_identify') }}</v-btn>
			<v-btn v-if="retry" size="x-small" variant="outlined" @click="emit('retry')">{{ ts('err_retry') }}</v-btn>
		</div>
	</v-alert>
</template>

<script setup>
// A failed call of the API as a person reads it (F3-V, 2026-10-21): what happened in the language of DWC, a button to identify
// yourself when a PIN is what is missing, and a button to try again. Nothing here retries by itself: a page that fails says so.
// The text and the kind come from friendly-error.js; the PIN dialog is the one of workshop-api.js (askLogin).
//
//   <error-notice :error="error" retry @retry="load()" />      error: ApiError | Error | string | null (null = nothing shown)

import { computed } from 'vue'
import { ts } from './shared-t.js'
import { askLogin } from './workshop-api.js'
import { currentIdentity } from './workshop-auth.js'
import { errorKind, errorText, needsLogin } from './friendly-error.js'

const props = defineProps({
	error: { type: [Error, Object, String], default: null },
	retry: { type: Boolean, default: false }
})
const emit = defineEmits(['retry'])

const kind = computed(() => errorKind(props.error))
const text = computed(() => {
	if (!props.error) return ''
	if (typeof props.error === 'string') return props.error
	return errorText(props.error, ts)
})
const showLogin = computed(() => !!props.error && typeof props.error !== 'string' && needsLogin(props.error, currentIdentity()))

async function identify() {
	if (await askLogin()) emit('retry')
}
</script>
