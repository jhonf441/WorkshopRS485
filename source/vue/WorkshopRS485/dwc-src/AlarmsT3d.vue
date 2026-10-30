<template>
	<div class="at3">
		<div class="at3-bar">
			<div class="text-body-medium">
				<span v-if="current" class="text-error"><v-icon size="small" color="error" class="mr-1">mdi-alert-octagon</v-icon>{{ $t('plugins.WorkshopRS485.common.active_now') }} <b>Err{{ current }}</b></span>
				<span v-else class="text-success"><v-icon size="small" color="success" class="mr-1">mdi-check-circle</v-icon>{{ $t('plugins.WorkshopRS485.common.no_active_alarm') }}</span>
				<span class="text-medium-emphasis"> &middot; {{ $t('plugins.WorkshopRS485.alarmsT3d.n_manual_codes', { n: alarms.length }) }}</span>
			</div>
			<v-spacer />
			<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.alarmsT3d.code_or_word_e_g_39')" density="compact" variant="outlined" hide-details clearable class="at3-search" />
		</div>

		<!-- filter by how it is cleared (also serves as a legend) -->
		<div class="at3-filters">
			<v-chip size="small" :variant="kind !== null ? 'outlined' : 'flat'" :color="kind === null ? 'primary' : undefined" @click="kind = null">{{ $t('plugins.WorkshopRS485.alarmsT3d.all_n', { n: alarms.length }) }}</v-chip>
			<v-chip v-for="(b, k) in DELETED" :key="k" size="small" :variant="kind !== k ? 'outlined' : 'flat'" :color="b.color" :title="b.help" @click="kind = kind === k ? null : k">
				{{ b.text }} &middot; {{ count(k) }}
			</v-chip>
		</div>
		<div v-if="kind" class="text-body-small text-medium-emphasis mt-1">{{ DELETED[kind].text }}: {{ DELETED[kind].help }}</div>

		<div class="at3-list">
			<div v-for="a in visible" :key="a.code" class="at3-row" :class="{ active: a.code === current, open: open(a) }">
				<div class="at3-cab" @click="toggle(a.code)">
					<span class="at3-code">Err{{ a.code }}</span>
					<span class="at3-name">{{ a.name }}</span>
					<v-chip v-if="a.code === current" size="x-small" color="error" variant="flat">{{ $t('plugins.WorkshopRS485.common.active_now_2') }}</v-chip>
					<v-chip size="x-small" :color="DELETED[a.deleted].color" variant="flat">{{ DELETED[a.deleted].text }}</v-chip>
					<v-icon size="small">{{ open(a) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
				</div>
				<div v-if="open(a)" class="at3-detail">
					<div><span class="et">{{ $t('plugins.WorkshopRS485.common.what_happens') }}</span><span>{{ a.description }}</span></div>
					<div><span class="et">{{ $t('plugins.WorkshopRS485.common.what_to_do') }}</span><span class="at3-solution">{{ a.solution }}</span></div>
					<div v-if="a.procedure"><span class="et">{{ $t('plugins.WorkshopRS485.alarmsT3d.how_to_clear_it') }}</span><span class="at3-proc">{{ a.procedure }}</span></div>
				</div>
			</div>
			<div v-if="!visible.length" class="text-body-medium text-medium-emphasis pa-4">{{ $t('plugins.WorkshopRS485.common.nothing_matches_the_search') }}</div>
		</div>
		<div class="text-body-small text-medium-emphasis mt-2">
			{{ $t('plugins.WorkshopRS485.alarmsT3d.source_note') }}
		</div>
	</div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { deleted as DELETED } from './api.js'

const props = defineProps({
	alarms: { type: Array, required: true },
	current: { type: Number, default: 0 }
})

const filter = ref('')
const kind = ref(null)
const openMap = reactive({})

const searching = computed(() => !!(filter.value || '').trim())
const visible = computed(() => {
	const f = (filter.value || '').trim().toLowerCase().replace(/^err\s*/, '')
	let list = props.alarms
	if (kind.value) {
		list = list.filter(a => a.deleted === kind.value)
	}
	if (f) {
		list = list.filter(a => String(a.code) === f ||
			[a.name, a.description, a.solution].some(t => (t || '').toLowerCase().includes(f)))
	}
	// the active one first
	return list.slice().sort((a, b) => (b.code === props.current) - (a.code === props.current) || a.code - b.code)
})

function count(k) {
	return props.alarms.filter(a => a.deleted === k).length
}
// open: the one the user touched, the active one, or all if searching for something
function open(a) {
	const v = openMap[a.code]
	if (v != null) {
		return v
	}
	return a.code === props.current || (searching.value && visible.value.length <= 5)
}
function toggle(code) {
	const a = props.alarms.find(x => x.code === code)
	openMap[code] = !open(a)
}
</script>

<style scoped>
.at3-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.at3-search {
	max-width: 340px;
	min-width: 220px;
}
.at3-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 10px;
}
.at3-list {
	margin-top: 10px;
	max-height: 560px;
	overflow-y: auto;
	padding-right: 4px;
}
.at3-row {
	border-radius: 8px;
	background: rgba(128, 128, 128, 0.06);
	border-left: 3px solid transparent;
	margin-bottom: 4px;
}
.at3-row.active {
	border-left-color: #ef5350;
	background: rgba(128, 128, 128, 0.1);
}
.at3-cab {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	cursor: pointer;
	user-select: none;
}
.at3-code {
	font-family: monospace;
	font-size: 14px;
	font-weight: 600;
	width: 56px;
	flex: 0 0 auto;
}
.at3-name {
	flex: 1;
	min-width: 0;
	font-size: 0.875rem;
	font-weight: 500;
}
.at3-detail {
	padding: 0 12px 10px 74px;
}
.at3-detail > div {
	display: grid;
	grid-template-columns: 110px 1fr;
	gap: 8px;
	padding: 2px 0;
	font-size: 0.875rem;
}
.at3-detail .et {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
}
@media (max-width: 600px) {
	.at3-detail {
		padding-left: 12px;
	}
	.at3-detail > div {
		grid-template-columns: 1fr;
		gap: 0;
	}
}
.at3-solution {
	color: var(--tp-blue-bright, #90caf9);
}
.at3-proc {
	color: var(--tp-orange-bright, #ffb74d);
}
</style>
