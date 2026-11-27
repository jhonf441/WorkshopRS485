<template>
	<!-- THE "You have unsaved changes" dialog of a plugin page (mounted ONCE by the page): three answers with words: keep editing (the first and the focused one), save and leave, and discard
	     (red, 44 px, apart from the others). The logic is unsaved-guard.js (a twin of the service page: the same three answers, the same 'later' of an editor with its own review).
	     While an editor runs its own review (a before / after dialog) this one steps aside. Drawn from <body>: content-class workshop-theme keeps the family. -->
	<v-dialog :value="open" max-width="460" persistent content-class="workshop-theme wf-unsaved-dialog" @keydown.esc="keep">
		<v-card role="alertdialog" aria-labelledby="wf-unsaved-title" aria-describedby="wf-unsaved-text">
			<v-card-title id="wf-unsaved-title" class="wf-unsaved-title">{{ t('unsaved_title') }}</v-card-title>
			<v-card-text>
				<p id="wf-unsaved-text" class="mb-0">{{ t('unsaved_text') }}</p>
				<p v-if="state.error" class="wf-field-msg is-error mt-2 mb-0" role="alert">{{ t('unsaved_failed') }}</p>
			</v-card-text>
			<v-card-actions class="wf-unsaved-actions">
				<v-btn ref="keepBtn" color="primary" class="wf-unsaved-btn" data-act="keep" autofocus @click="keep">{{ t('unsaved_keep') }}</v-btn>
				<v-btn outlined class="wf-unsaved-btn" data-act="save" :disabled="busy" :loading="busy" @click="save">{{ t('unsaved_save') }}</v-btn>
				<v-spacer />
				<v-btn color="error" class="wf-unsaved-btn wf-unsaved-discard" data-act="discard" :disabled="busy" @click="discard">{{ t('unsaved_discard') }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
'use strict'

import { discardAndLeave, keepEditing, saveAndLeave, unsaved } from './unsaved-guard.js'
import { ts } from './shared-t.js'
import { ensureGuardStyle } from './wf-guard-style.js'

export default {
	name: 'WfUnsavedDialog',
	data() {
		return { state: unsaved, busy: false }
	},
	created() {
		ensureGuardStyle()
	},
	watch: {
		// Vuetify 2.7 does not apply `autofocus` inside its dialog and puts the focus on the dialog box itself: "Keep editing" (the safe answer) takes it by code, after Vuetify's own focus
		open(v) {
			if (v) this.$nextTick(() => setTimeout(() => this.focusKeep(), 30))
		}
	},
	computed: {
		open() {
			return !!this.state.pending && !this.state.waiting
		}
	},
	methods: {
		t(key) {
			return ts(key)
		},
		focusKeep() {
			const b = this.$refs.keepBtn
			const el = b && (b.$el || b)
			if (el && typeof el.focus === 'function') el.focus()
		},
		keep() {
			if (!this.busy) keepEditing()
		},
		discard() {
			discardAndLeave()
		},
		async save() {
			this.busy = true
			try { await saveAndLeave() } finally { this.busy = false }
		}
	}
}
</script>
