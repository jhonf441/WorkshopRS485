<template>
	<!-- A time of day written as HH:MM in one 44 px field, the same box as the day and time fields of the range picker (RangePicker.vue, criteria C3,
	     owner 2026-11-23: the date and time inputs look the same in every plugin). It replaces the Vuetify clock in a menu, which was the only way to
	     enter a time. "9:05", "0905" and "09:05" are understood; the value only changes with a real time, a wrong one is marked and goes back on leaving.
	       <time-field v-model="since" :label="..." :disabled="off" /> -->
	<v-text-field
		:value="text" :label="label" :disabled="disabled" :error="bad" dense outlined hide-details color="primary"
		inputmode="numeric" autocomplete="off" maxlength="5" placeholder="HH:MM" class="wf-time-field" :aria-invalid="bad ? 'true' : null"
		@input="typed" @blur="settle" @keydown.enter="settle"
	>
		<template #prepend-inner><v-icon small aria-hidden="true">mdi-clock-outline</v-icon></template>
	</v-text-field>
</template>

<script>
'use strict'

import { parseTimeText } from './range-picker.js'

export default {
	model: { prop: 'value', event: 'input' },
	props: {
		value: { type: String, default: '' },
		label: { type: String, default: '' },
		disabled: { type: Boolean, default: false }
	},
	data() {
		return { text: this.value, bad: false }
	},
	watch: {
		value(v) {
			if (parseTimeText(this.text) !== v) this.text = v
			this.bad = false
		}
	},
	methods: {
		typed(v) {
			this.text = v
			const t = parseTimeText(v)
			this.bad = !!String(v || '').trim() && !t
			if (t && t !== this.value) this.$emit('input', t)
		},
		// leaving the field: a real time is shown in its HH:MM form, a wrong one goes back to the last good value
		settle() {
			const t = parseTimeText(this.text)
			this.text = t || this.value
			this.bad = false
		}
	}
}
</script>

<style>
.wf-time-field { max-width: 160px; } /* 44 px high: the family rule of dense fields (design/family.css) */
</style>
