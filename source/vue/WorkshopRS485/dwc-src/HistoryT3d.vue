<template>
	<div>
		<!-- resumen -->
		<div class="hres">
			<div class="hres-tile">
				<div class="et">{{ $t('plugins.WorkshopRS485.historyT3d.faults_in_24_h') }}</div>
				<div class="val" :class="{ 'text-error': summary.day }">{{ summary.day }}</div>
			</div>
			<div class="hres-tile">
				<div class="et">{{ $t('plugins.WorkshopRS485.historyT3d.faults_in_total') }}</div>
				<div class="val">{{ summary.total }}</div>
			</div>
			<div class="hres-tile">
				<div class="et">{{ $t('plugins.WorkshopRS485.historyT3d.last_failure') }}</div>
				<div class="val val-small">{{ summary.last ? does(summary.last.ts) : $t('plugins.WorkshopRS485.historyT3d.never') }}</div>
				<div v-if="summary.last" class="sub">{{ summary.last.alarm ? 'Err' + summary.last.alarm : summary.last.text }}</div>
			</div>
			<div class="hres-tile">
				<div class="et">{{ $t('plugins.WorkshopRS485.historyT3d.the_most_repeated') }}</div>
				<div class="val val-small">{{ summary.repeated ? summary.repeated.text : '—' }}</div>
				<div v-if="summary.repeated" class="sub">{{ $t('plugins.WorkshopRS485.historyT3d.n_times', { n: summary.repeated.times }) }}</div>
			</div>
		</div>

		<div class="d-flex align-center flex-wrap mt-3" style="gap:8px">
			<v-btn-toggle v-model="see" mandatory density="compact">
				<v-btn size="small" value="todo">{{ $t('plugins.WorkshopRS485.historyT3d.all') }}</v-btn>
				<v-btn size="small" value="fault">{{ $t('plugins.WorkshopRS485.historyT3d.faults_only') }}</v-btn>
			</v-btn-toggle>
			<v-spacer />
			<v-btn size="small" variant="outlined" :loading="loading" @click="load()"><v-icon size="small" start>mdi-refresh</v-icon>{{ $t('plugins.WorkshopRS485.common.refresh') }}</v-btn>
			<v-btn size="small" variant="text" :color="armed ? 'error' : ''" :disabled="!events.length || !can('rs485.clear_history')" @click="touchDelete()">
				<v-icon size="small" start>mdi-delete-sweep</v-icon>{{ armed ? $t('plugins.WorkshopRS485.historyT3d.tap_again_to_clear') : $t('plugins.WorkshopRS485.historyT3d.clear_history') }}
			</v-btn>
		</div>
		<div v-if="msg" class="text-body-medium mt-2" :class="msgError ? 'text-error' : 'text-success'">{{ msg }}</div>

		<div v-if="!rows.length && !loading" class="empty mt-3">
			<v-icon size="large" color="grey">mdi-history</v-icon>
			<div>{{ see === 'fault' ? $t('plugins.WorkshopRS485.historyT3d.no_fault_events') : $t('plugins.WorkshopRS485.historyT3d.no_events') }}</div>
		</div>
		<div v-else class="hist mt-3">
			<template v-for="g in groups" :key="'d' + g.day">
				<div class="hist-day">{{ g.title }}</div>
				<div v-for="(e, i) in g.events" :key="g.day + '-' + i" class="hist-row" :class="e.kind">
					<v-icon size="small" :color="color(e)">{{ icon(e) }}</v-icon>
					<span class="hist-hour">{{ hour(e.ts) }}</span>
					<span class="hist-text">
						<template v-if="e.kind === 'fault'">
							<b v-if="e.alarm">Err{{ e.alarm }}<template v-if="nameAlarm(e.alarm)"> &middot; {{ nameAlarm(e.alarm) }}</template></b>
							<span :class="{ 'text-medium-emphasis': e.alarm }">{{ e.alarm ? ' — ' : '' }}{{ e.text }}</span>
						</template>
						<template v-else-if="e.kind === 'normal'">{{ $t('plugins.WorkshopRS485.historyT3d.back_to_normal') }} <span class="text-medium-emphasis">({{ e.text }})</span></template>
						<template v-else>{{ e.text }}</template>
					</span>
					<v-chip v-if="e.duration != null" size="x-small" variant="outlined" :title="$t('plugins.WorkshopRS485.historyT3d.time_in_fault')">
						<v-icon size="x-small" start>mdi-timer-outline</v-icon>{{ duration(e.duration) }}
					</v-chip>
					<v-chip v-else-if="e.kind === 'fault' && e.follows" size="x-small" color="error" variant="flat">{{ $t('plugins.WorkshopRS485.historyT3d.ongoing') }}</v-chip>
				</div>
			</template>
		</div>
		<div class="text-body-small text-medium-emphasis mt-2">
			{{ $t('plugins.WorkshopRS485.historyT3d.saved_on_the_sd') }}<code>sys/workshop/data/rs485-history.json</code>{{ $t('plugins.WorkshopRS485.historyT3d.last_500_events_of_all_devices') }}
		</div>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { i18n } from './dwc-host.js'
import { callService, useCan } from './api.js'

const p2 = n => String(n).padStart(2, '0')

const props = defineProps({
	dispId: { type: String, required: true },
	alarms: { type: Array, default: () => [] }
})

const { can } = useCan()
const events = ref([]) // from the oldest to the newest
const loading = ref(false)
const armed = ref(false)
let armedTimer = null
const msg = ref(null)
const msgError = ref(false)
const see = ref('todo')

// each fault with how long it lasted (until the next 'normal'), newest on top
const withDuration = computed(() => {
	const out = events.value.map(e => ({ ...e }))
	let abierta = null
	for (const e of out) {
		if (e.kind === 'fault') {
			abierta = e
		} else if (e.kind === 'normal' && abierta) {
			abierta.duration = e.ts - abierta.ts
			abierta = null
		} else if (e.kind === 'deleted') {
			abierta = null
		}
	}
	if (abierta) {
		abierta.follows = true
	}
	return out.reverse()
})
const rows = computed(() => see.value === 'fault' ? withDuration.value.filter(e => e.kind === 'fault') : withDuration.value)
const groups = computed(() => {
	const today = day(Date.now() / 1000)
	const ayer = day(Date.now() / 1000 - 86400)
	const g = []
	for (const e of rows.value) {
		const d = day(e.ts)
		if (!g.length || g[g.length - 1].day !== d) {
			g.push({ day: d, title: d === today ? i18n.t('plugins.WorkshopRS485.historyT3d.today') : (d === ayer ? i18n.t('plugins.WorkshopRS485.historyT3d.yesterday') : d), events: [] })
		}
		g[g.length - 1].events.push(e)
	}
	return g
})
const summary = computed(() => {
	const faults = events.value.filter(e => e.kind === 'fault')
	const ahora = Date.now() / 1000
	const times = {}
	for (const f of faults) {
		const k = f.alarm ? 'Err' + f.alarm : f.text
		times[k] = (times[k] || 0) + 1
	}
	const top = Object.entries(times).sort((a, b) => b[1] - a[1])[0]
	return {
		total: faults.length,
		day: faults.filter(f => ahora - f.ts < 86400).length,
		last: faults[faults.length - 1] || null,
		repeated: top ? { text: top[0], times: top[1] } : null
	}
})

onMounted(() => {
	load()
})
onBeforeUnmount(() => {
	clearTimeout(armedTimer)
})

async function load() {
	loading.value = true
	msg.value = null
	try {
		const r = await callService({ P: 'history', I: props.dispId })
		events.value = (r.history || []).slice()
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.historyT3d.could_not_read_the_history') + (e.message || e)
		msgError.value = true
	} finally {
		loading.value = false
	}
}
function touchDelete() {
	if (!armed.value) {
		armed.value = true
		clearTimeout(armedTimer)
		armedTimer = setTimeout(() => { armed.value = false }, 4000)
		return
	}
	armed.value = false
	remove()
}
async function remove() {
	try {
		await callService({ P: 'clear_history', I: props.dispId })
		msg.value = i18n.t('plugins.WorkshopRS485.historyT3d.history_cleared')
		msgError.value = false
		await load()
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.historyT3d.could_not_clear', { error: e.message || String(e) })
		msgError.value = true
	}
}
function nameAlarm(c) {
	const a = props.alarms.find(x => x.code === c)
	return a ? a.name : ''
}
function day(ts) {
	const d = new Date(ts * 1000)
	return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}
function hour(ts) {
	const d = new Date(ts * 1000)
	return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
}
function duration(s) {
	if (s < 60) {
		return `${Math.max(0, Math.round(s))} s`
	}
	if (s < 3600) {
		return `${Math.round(s / 60)} min`
	}
	return `${(s / 3600).toFixed(1)} h`
}
function does(ts) {
	const s = Date.now() / 1000 - ts
	if (s < 3600) {
		return i18n.t('plugins.WorkshopRS485.historyT3d.min_ago', { n: Math.max(1, Math.round(s / 60)) })
	}
	if (s < 86400) {
		return i18n.t('plugins.WorkshopRS485.historyT3d.h_ago', { n: Math.round(s / 3600) })
	}
	return i18n.t('plugins.WorkshopRS485.historyT3d.days_ago', { n: Math.round(s / 86400) })
}
function icon(e) {
	return { fault: 'mdi-alert-octagon', normal: 'mdi-check-circle' }[e.kind] || 'mdi-information-outline'
}
function color(e) {
	if (e.kind === 'fault') {
		return e.axis ? 'error' : 'info'
	}
	return e.kind === 'normal' ? 'success' : 'grey'
}
</script>

<style scoped>
.hres {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	gap: 8px;
}
.hres-tile {
	background: rgba(128, 128, 128, 0.09);
	border-radius: 8px;
	padding: 8px 10px;
	min-width: 0;
}
.hres-tile .et {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
}
.hres-tile .val {
	font-size: 22px;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
}
.hres-tile .val-small {
	font-size: 15px;
	padding: 4px 0 2px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.hres-tile .sub {
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
.hist {
	max-height: 420px;
	overflow-y: auto;
}
.hist-day {
	position: sticky;
	top: 0;
	z-index: 1;
	font-size: 12px;
	font-weight: 600;
	padding: 4px 8px;
	background: var(--tp-card, #1e1e1e);
	color: var(--tp-faint, #9e9e9e);
}
.hist-row {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 5px 8px;
	border-radius: 6px;
	font-size: 13px;
}
.hist-row:nth-child(odd) {
	background: rgba(128, 128, 128, 0.06);
}
.hist-hour {
	font-family: monospace;
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
	white-space: nowrap;
}
.hist-text {
	flex: 1 1 auto;
	min-width: 0;
}
.empty {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 12px;
	border-radius: 8px;
	background: rgba(128, 128, 128, 0.06);
	font-size: 0.875rem;
	color: var(--tp-faint, #9e9e9e);
}
</style>
