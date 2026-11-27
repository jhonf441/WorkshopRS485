<template>
	<!-- The mark "Unsaved changes" next to the title of an editor: words and an icon, never colour alone (family chip: outline, state with a shape and a word). Prop: show. -->
	<span v-if="show" class="wf-unsaved" role="status" data-part="unsaved-mark"><v-icon :size="14" aria-hidden="true">mdi-circle-edit-outline</v-icon>{{ text }}</span>
</template>

<script>
'use strict'

import { ts } from './shared-t.js'
import { ensureGuardStyle } from './wf-guard-style.js'

export default {
	name: 'WfUnsavedMark',
	props: { show: { type: Boolean, default: false } },
	created() {
		ensureGuardStyle()
	},
	computed: {
		text() {
			return ts('unsaved_mark')
		}
	}
}
</script>
