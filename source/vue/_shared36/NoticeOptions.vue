<template>
	<!-- How notices show on THIS screen (the ONE notices center, notices.js; architecture review 2026-11-23, section 9). The fields are not written
	     here: the component walks OPTION_FIELDS of notices.js (the same list the service page walks with its own kit), so no screen has a field the
	     other lacks. Saved in this browser (key workshopNoticeOptions): the kiosk and a phone can choose differently. It names no plugin.
	       <notice-options @change="opts => ..." />          event change(options) after each choice -->
	<div class="wf-notice-options">
		<p class="wf-help wf-help-line">{{ ts(small ? 'notices_opt_small' : 'notices_opt_wide') }}</p>
		<div class="wf-notice-options-row">
			<template v-for="f in fields">
				<wf-field v-if="f.kind !== 'bool'" :id="'wf-no-' + f.key" :key="f.key" :label="ts(f.label)">
					<v-select :id="'wf-no-' + f.key" :value="opts[f.key]" :items="itemsOf(f)" item-text="title" item-value="value" dense outlined hide-details :disabled="off(f)" :aria-label="ts(f.label)" @change="set({ [f.key]: $event })" />
				</wf-field>
			</template>
			<v-btn outlined class="wf-notice-options-test" @click="test"><v-icon small left>mdi-bell-ring-outline</v-icon>{{ ts('notices_opt_test') }}</v-btn>
		</div>
		<template v-for="f in fields">
			<v-switch v-if="f.kind === 'bool'" :key="f.key" :input-value="opts[f.key]" dense hide-details color="primary" :disabled="off(f)" :label="ts(f.label)" @change="set({ [f.key]: !!$event })" />
		</template>
	</div>
</template>

<script>
'use strict'

import { ts } from './shared-t.js'
import WfField from './WfField.vue'
import { installNotices, workshopNoticesOptions, workshopNoticesSmall, OPTION_FIELDS } from './notices.js'

function isSmall() {
	return typeof window === 'undefined' ? false : workshopNoticesSmall(window.innerWidth || 1024, window.innerHeight || 768)
}

export default {
	name: 'NoticeOptions',
	components: { WfField },
	data() {
		const c = installNotices()
		return { opts: c ? c.options() : workshopNoticesOptions(null), small: isSmall(), fields: c && c.optionFields ? c.optionFields() : OPTION_FIELDS }
	},
	mounted() {
		this.onResize = () => { this.small = isSmall() }
		window.addEventListener('resize', this.onResize, { passive: true })
	},
	beforeDestroy() {
		window.removeEventListener('resize', this.onResize)
	},
	methods: {
		ts,
		// the choices of a field: its values with their catalog words, or the numbers of an int
		itemsOf(f) {
			if (f.kind === 'int') return Array.from({ length: f.max - f.min + 1 }, (_, i) => ({ value: f.min + i, title: String(f.min + i) }))
			return f.values.map(v => ({ value: v, title: ts(f.valueLabel + String(v).replace(/-/g, '_')) }))
		},
		// a small screen ignores the wide-only fields; a field that needs another value is off without it
		off(f) {
			if (f.wideOnly && this.small) return true
			return !!f.needs && Object.keys(f.needs).some(k => this.opts[k] !== f.needs[k])
		},
		set(change) {
			const c = installNotices()
			this.opts = c ? c.setOptions(change) : workshopNoticesOptions(Object.assign({}, this.opts, change))
			this.$emit('change', this.opts)
		},
		// what a message looks like here, with the clocks of this screen
		test() {
			const c = installNotices()
			if (!c) return
			c.post({ source: 'NoticeOptions', id: 'test', level: 'info', title: ts('notices_test_title'), text: ts('notices_test_text') })
		}
	}
}
</script>

<style>
.wf-notice-options-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; gap: 12px 16px; margin: 8px 0; }
.wf-notice-options-test { min-height: var(--wf-hit, 40px); justify-self: start; }
</style>
