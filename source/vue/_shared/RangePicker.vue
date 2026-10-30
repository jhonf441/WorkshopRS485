<template>
	<!-- the time range of a search, like the one of CloudWatch: quick ranges, "the last N units" and an absolute range from a date and time to another -->
	<v-menu v-model="open" :close-on-content-click="false" location="bottom start" min-width="320" max-width="420">
		<template #activator="{ props: menu }">
			<v-btn v-bind="menu" size="small" variant="outlined" class="range-picker-button" :aria-label="ts('range_label')">
				<v-icon size="small" start>mdi-calendar-range</v-icon>{{ shown }}
			</v-btn>
		</template>
		<v-card class="pa-3 range-picker">
			<v-btn v-if="clearable" size="small" :variant="modelValue ? 'outlined' : 'flat'" :color="modelValue ? undefined : 'primary'" class="mb-2" @click="pickAll">{{ ts('range_all') }}</v-btn>
			<div class="text-title-small">{{ ts('range_quick') }}</div>
			<div class="d-flex flex-wrap mt-1" style="gap:6px">
				<v-btn v-for="q in quick" :key="q.amount + q.unit" size="x-small" :variant="isQuick(q) ? 'flat' : 'outlined'" :color="isQuick(q) ? 'primary' : undefined" @click="pickQuick(q)">
					{{ ts(word('range_short_', q.unit), { n: q.amount }) }}
				</v-btn>
			</div>

			<v-tabs v-model="tab" density="compact" class="mt-3">
				<v-tab value="relative">{{ ts('range_relative') }}</v-tab>
				<v-tab value="absolute">{{ ts('range_absolute') }}</v-tab>
			</v-tabs>

			<div v-if="tab === 'relative'" class="mt-3">
				<div class="text-body-small text-medium-emphasis">{{ ts('range_relative_help') }}</div>
				<div class="d-flex align-center flex-wrap mt-2" style="gap:8px">
					<input v-model.number="amount" type="number" min="1" :max="maxAmount" step="1" class="field amount" :aria-label="ts('range_amount')" />
					<v-btn v-for="u in units" :key="u" size="x-small" :variant="unit === u ? 'flat' : 'outlined'" :color="unit === u ? 'primary' : undefined" @click="unit = u">{{ ts(word('range_unit_', u)) }}</v-btn>
				</div>
			</div>
			<div v-else class="mt-3">
				<div class="text-body-small text-medium-emphasis">{{ ts('range_absolute_help') }}</div>
				<div class="d-flex align-center flex-wrap mt-2" style="gap:8px">
					<span class="text-body-medium range-word">{{ ts('range_from') }}</span>
					<input v-model="fromDay" type="date" class="field date" :aria-label="ts('range_from')" />
					<input v-model="fromTime" type="time" class="field time" :aria-label="ts('range_from_time')" />
				</div>
				<div class="d-flex align-center flex-wrap mt-2" style="gap:8px">
					<span class="text-body-medium range-word">{{ ts('range_to') }}</span>
					<input v-model="toDay" type="date" class="field date" :aria-label="ts('range_to')" />
					<input v-model="toTime" type="time" class="field time" :aria-label="ts('range_to_time')" />
				</div>
			</div>

			<div v-if="problem" class="text-body-small text-error mt-2">{{ ts(word('range_err_', problem)) }}</div>
			<div v-else-if="preview" class="text-body-small text-medium-emphasis mt-2">{{ preview }}</div>

			<div class="d-flex align-center mt-3" style="gap:8px">
				<v-spacer />
				<v-btn size="small" variant="text" @click="open = false">{{ ts('range_cancel') }}</v-btn>
				<v-btn size="small" color="primary" :disabled="!!problem" @click="apply">{{ ts('range_apply') }}</v-btn>
			</div>
		</v-card>
	</v-menu>
</template>

<script setup>
// <range-picker v-model="range" />   range: { type: 'relative', amount, unit } | { type: 'absolute', from, to } (range-picker.js);
// the page asks resolve(range, new Date()) for the two moments each time it searches, so "the last 3 hours" moves with the clock.
import { computed, ref, watch } from 'vue'
import { ts } from './shared-t.js'
import { QUICK, UNITS, MAX_AMOUNT, check, resolve, quickOf, relative, absolute, localText } from './range-picker.js'

const props = defineProps({
	modelValue: { type: Object, default: null }, // null: no limit in time (only with `clearable`)
	clearable: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

// the text of a family of keys (range_unit_hours, range_err_order...): the key is built here
const word = (family, id) => family + id
const quick = QUICK
const units = UNITS
const maxAmount = MAX_AMOUNT
const open = ref(false)
const tab = ref('relative')
const amount = ref(1)
const unit = ref('hours')
const fromDay = ref('')
const fromTime = ref('00:00')
const toDay = ref('')
const toTime = ref('23:59')

// the form takes the value each time the menu opens (a cancelled edit is forgotten)
function load() {
	const v = props.modelValue || relative(1, 'days')
	if (v.type === 'absolute') {
		tab.value = 'absolute'
		;[fromDay.value, fromTime.value] = String(v.from).split('T')
		;[toDay.value, toTime.value] = String(v.to).split('T')
		fromTime.value = fromTime.value || '00:00'
		toTime.value = toTime.value || '23:59'
	} else {
		tab.value = 'relative'
		amount.value = v.amount
		unit.value = v.unit
		const now = localText(new Date()).split('T')
		fromDay.value = toDay.value = now[0]
	}
}
watch(open, o => { if (o) load() }, { immediate: true })

const draft = computed(() => (tab.value === 'relative'
	? relative(Number(amount.value), unit.value)
	: absolute(fromDay.value + 'T' + (fromTime.value || '00:00'), toDay.value + 'T' + (toTime.value || '23:59'))))
const problem = computed(() => {
	const c = check(draft.value)
	return c.ok ? '' : c.why
})
const preview = computed(() => {
	const r = resolve(draft.value, new Date())
	return r ? text(r.from) + '  ->  ' + text(r.to) : ''
})

function text(d) {
	return localText(d).replace('T', ' ')
}
function pickAll() {
	emit('update:modelValue', null)
	open.value = false
}
function isQuick(q) {
	const k = quickOf(props.modelValue)
	return !!k && k.amount === q.amount && k.unit === q.unit
}
function pickQuick(q) {
	emit('update:modelValue', relative(q.amount, q.unit))
	open.value = false
}
function apply() {
	if (problem.value) return
	emit('update:modelValue', draft.value)
	open.value = false
}

// what the button says: "Last 3 hours" or the two moments
const shown = computed(() => {
	const v = props.modelValue
	if (!v) return ts('range_all')
	if (v.type === 'absolute') return String(v.from).replace('T', ' ') + '  ->  ' + String(v.to).replace('T', ' ')
	return ts('range_last', { span: ts(word('range_short_', v.unit), { n: v.amount }) })
})
</script>

<style scoped>
.field {
	padding: 2px 5px;
	border: 1px solid rgba(128, 128, 128, 0.45);
	border-radius: 4px;
	color: inherit;
	background: transparent;
	color-scheme: light dark;
}
.field.amount {
	width: 72px;
}
.range-word {
	min-width: 44px;
}
</style>
