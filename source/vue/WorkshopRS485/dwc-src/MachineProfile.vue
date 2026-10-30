<template>
	<!-- JSON equipment profile (2026-10-10): parameter and alarm tables of
		     a generic Modbus device, filled from a file (Edit >
		     Equipment profile). Format: dsf/profiles/perfil_json.py -->
	<div class="pe">
		<div v-if="deviceText" class="text-body-medium mb-2">
			<v-icon size="small" class="mr-1">mdi-card-account-details-outline</v-icon>{{ deviceText }}
			<span v-if="pe.device && pe.device.notes" class="text-medium-emphasis"> &middot; {{ pe.device.notes }}</span>
		</div>

		<v-tabs v-model="tab" height="34" class="mb-2">
			<v-tab :value="0"><v-icon size="small" start>mdi-tune</v-icon>{{ $t('plugins.WorkshopRS485.machineProfile.parameters_n', { n: params.length }) }}</v-tab>
			<v-tab :value="1"><v-icon size="small" start :color="alarmCurrent ? 'error' : ''">mdi-alert-circle-outline</v-icon>{{ $t('plugins.WorkshopRS485.machineProfile.alarms_n', { n: alarms.length }) }}</v-tab>
		</v-tabs>

		<!-- ===== parametros ===== -->
		<template v-if="tab === 0">
			<div class="pe-bar">
				<v-btn size="small" variant="outlined" :loading="reading" :disabled="!params.length" @click="readAll()"><v-icon size="small" start>mdi-download</v-icon>{{ $t('plugins.WorkshopRS485.machineProfile.read_all') }}</v-btn>
				<v-text-field v-model="filter" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.machineProfile.name_register_or_word')" density="compact" variant="outlined" hide-details clearable class="pe-search" />
				<span v-if="msg" class="text-body-small" :class="msgError ? 'text-error' : 'text-success'">{{ msg }}</span>
			</div>
			<div v-if="!params.length" class="text-body-medium text-medium-emphasis pa-3">{{ $t('plugins.WorkshopRS485.machineProfile.the_profile_has_no_parameters') }}</div>
			<v-table v-else density="compact" class="pe-table">
				<thead>
					<tr><th>{{ $t('plugins.WorkshopRS485.common.register') }}</th><th>{{ $t('plugins.WorkshopRS485.common.name') }}</th><th>{{ $t('plugins.WorkshopRS485.common.value') }}</th><th>{{ $t('plugins.WorkshopRS485.machineProfile.range') }}</th><th /></tr>
				</thead>
				<tbody>
					<template v-for="r in visible" :key="key(r)">
						<tr :class="{ 'pe-outside': outside(r) }" @click="open = open === key(r) ? null : key(r)">
							<td class="pe-reg">{{ r.record }}<span class="text-medium-emphasis"> {{ r.func === 4 ? 'in' : 'hd' }}</span></td>
							<td>
								{{ r.name }}
								<v-icon v-if="r.watch" size="x-small" color="primary" :title="$t('plugins.WorkshopRS485.machineProfile.read_every_cycle')">mdi-eye</v-icon>
								<v-icon v-if="r.access === 'write'" size="x-small" :title="$t('plugins.WorkshopRS485.machineProfile.can_be_written')">mdi-pencil</v-icon>
							</td>
							<td class="pe-val">
								<template v-if="values[key(r)] && values[key(r)].error"><span class="text-error text-body-small">{{ values[key(r)].error }}</span></template>
								<template v-else-if="values[key(r)]">{{ textValue(r, values[key(r)].value) }} <small>{{ r.unit }}</small></template>
								<span v-else class="text-medium-emphasis">--</span>
							</td>
							<td class="text-medium-emphasis text-body-small">{{ range(r) }}</td>
							<td class="text-right"><v-icon size="small">{{ open === key(r) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon></td>
						</tr>
						<tr v-if="open === key(r)" class="pe-detail">
							<td colspan="5">
								<div v-if="r.description" class="text-body-medium mb-2">{{ r.description }}</div>
								<div v-if="r.options && r.options.length" class="text-body-small mb-2">
									<span v-for="o in r.options" :key="o.value" class="mr-3"><b>{{ o.value }}</b> = {{ o.text }}</span>
								</div>
								<div class="text-body-small text-medium-emphasis mb-2">
									{{ r.func === 4 ? $t('plugins.WorkshopRS485.common.input_function_4') : $t('plugins.WorkshopRS485.common.holding_function_3') }} &middot; {{ $t('plugins.WorkshopRS485.machineProfile.scale_n', { n: r.scale }) }}<span v-if="r.defaultValue != null"> &middot; {{ $t('plugins.WorkshopRS485.machineProfile.factory_value', { v: r.defaultValue, unit: r.unit || '' }) }}</span>
								</div>
								<div class="d-flex flex-wrap align-center" style="gap:8px">
									<v-btn size="x-small" variant="outlined" :loading="busy === key(r) + 'l'" @click.stop="readOne(r)">{{ $t('plugins.WorkshopRS485.common.read') }}</v-btn>
									<template v-if="r.access === 'write'">
										<v-select v-if="r.options && r.options.length" v-model="newItem" :items="r.options.map(o => ({ text: o.value + ' = ' + o.text, value: o.value }))" item-title="text" item-value="value" density="compact" variant="outlined" hide-details class="pe-new-sel" @click.stop />
										<v-text-field v-else v-model.number="newItem" type="number" step="any" :label="$t('plugins.WorkshopRS485.machineProfile.new_value') + (r.unit ? ' (' + r.unit + ')' : '')" density="compact" variant="outlined" hide-details class="pe-new" @click.stop />
										<v-btn size="x-small" variant="outlined" :color="armed === key(r) ? 'error' : ''" :disabled="newItem === null || newItem === '' || !can('rs485.action', { action: 'write_parameter' })" :loading="busy === key(r) + 'e'" @click.stop="arm(r)">
											{{ armed === key(r) ? $t('plugins.WorkshopRS485.machineProfile.tap_again_to_write') : $t('plugins.WorkshopRS485.common.write') }}
										</v-btn>
									</template>
									<span v-else class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.machineProfile.read_only') }}</span>
								</div>
							</td>
						</tr>
					</template>
				</tbody>
			</v-table>
		</template>

		<!-- ===== alarmas ===== -->
		<template v-else>
			<div class="text-body-medium mb-2">
				<span v-if="!pe.alarm" class="text-warning">{{ $t('plugins.WorkshopRS485.machineProfile.the_profile_doesn_t_say_where') }}</span>
				<span v-else-if="alarmCurrent" class="text-error"><v-icon size="small" color="error" class="mr-1">mdi-alert-octagon</v-icon>{{ $t('plugins.WorkshopRS485.common.active_now') }} <b>{{ alarmCurrent }}</b></span>
				<span v-else class="text-success"><v-icon size="small" color="success" class="mr-1">mdi-check-circle</v-icon>{{ $t('plugins.WorkshopRS485.common.no_active_alarm') }}</span>
				<span v-if="pe.alarm" class="text-medium-emphasis"> &middot; {{ $t('plugins.WorkshopRS485.machineProfile.code_in_register', { n: pe.alarm.record, kind: pe.alarm.func === 3 ? 'holding' : 'input' }) }}</span>
			</div>
			<v-text-field v-model="filterA" prepend-inner-icon="mdi-magnify" :placeholder="$t('plugins.WorkshopRS485.machineProfile.code_or_word')" density="compact" variant="outlined" hide-details clearable class="pe-search mb-2" />
			<div v-if="!alarms.length" class="text-body-medium text-medium-emphasis pa-3">{{ $t('plugins.WorkshopRS485.machineProfile.the_profile_has_no_alarms') }}</div>
			<div v-for="a in visibleA" :key="a.code" class="pe-alarm" :class="{ active: a.code === alarmCurrent }">
				<div class="d-flex align-center flex-wrap" style="gap:8px">
					<span class="pe-code">{{ a.code }}</span>
					<span class="font-weight-medium">{{ a.text }}</span>
					<v-chip v-if="a.code === alarmCurrent" size="x-small" color="error" variant="flat">{{ $t('plugins.WorkshopRS485.common.active_now_2') }}</v-chip>
					<v-chip size="x-small" variant="outlined">{{ textAction(a.action) }}</v-chip>
				</div>
				<div v-if="a.cause" class="text-body-medium mt-1"><span class="pe-et">{{ $t('plugins.WorkshopRS485.common.cause') }}</span>{{ a.cause }}</div>
				<div v-if="a.that_do" class="text-body-medium"><span class="pe-et">{{ $t('plugins.WorkshopRS485.common.what_to_do') }}</span>{{ a.that_do }}</div>
			</div>
		</template>
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { i18n } from './dwc-host.js'
import { action, useCan } from './api.js'

const ACTION_TEXT = { pause: i18n.t('plugins.WorkshopRS485.machineProfile.pauses_the_job'), notify: i18n.t('plugins.WorkshopRS485.common.only_warns'), nothing: i18n.t('plugins.WorkshopRS485.machineProfile.does_nothing') }

const props = defineProps({
	cfg: { type: Object, required: true },
	live: { type: Object, default: null }
})

const { can } = useCan()
const tab = ref(0)
const filter = ref('')
const filterA = ref('')
const values = ref({})
const reading = ref(false)
const busy = ref(null)
const open = ref(null)
const newItem = ref(null)
const armed = ref(null)
let armedTimer = null
const msg = ref('')
const msgError = ref(false)

const pe = computed(() => (props.cfg.options && props.cfg.options.profile_device) || {})
const params = computed(() => pe.value.params || [])
const alarms = computed(() => pe.value.alarms || [])
const deviceText = computed(() => {
	const e = pe.value.device || {}
	const nombre = [e.mark, e.model].filter(Boolean).join(' ')
	const com = e.baud ? `${e.baud} 8${e.parity || 'N'}${e.bits_stop || 1}` : ''
	return [nombre, com, e.address ? i18n.t('plugins.WorkshopRS485.machineProfile.address_n', { n: e.address }) : ''].filter(Boolean).join(' · ')
})
const visible = computed(() => {
	const f = String(filter.value || '').trim().toLowerCase()
	if (!f) {
		return params.value
	}
	return params.value.filter(r => String(r.record) === f || (r.name + ' ' + (r.description || '')).toLowerCase().includes(f))
})
const visibleA = computed(() => {
	const f = String(filterA.value || '').trim().toLowerCase()
	if (!f) {
		return alarms.value
	}
	return alarms.value.filter(a => String(a.code) === f || [a.text, a.cause, a.that_do].join(' ').toLowerCase().includes(f))
})
const alarmCurrent = computed(() => {
	const v = props.live && props.live.values
	const without = pe.value.alarm ? (pe.value.alarm.without_alarm || 0) : 0
	return v && v.alarm != null && v.alarm !== without ? v.alarm : 0
})

watch(open, () => {
	newItem.value = null
	armed.value = null
})
onBeforeUnmount(() => {
	clearTimeout(armedTimer)
})

function key(r) {
	return r.func + '-' + r.record
}
function textAction(a) {
	return ACTION_TEXT[a] || i18n.t('plugins.WorkshopRS485.machineProfile.per_the_device')
}
function range(r) {
	const p = []
	if (r.min != null) p.push(i18n.t('plugins.WorkshopRS485.machineProfile.min_n', { n: r.min }))
	if (r.max != null) p.push(i18n.t('plugins.WorkshopRS485.machineProfile.max_n', { n: r.max }))
	return p.join(' · ')
}
function textValue(r, v) {
	const o = (r.options || []).find(x => x.value === v)
	return o ? v + ' = ' + o.text : v
}
function outside(r) {
	const x = values.value[key(r)]
	if (!x || x.value == null) {
		return false
	}
	return (r.min != null && x.value < r.min) || (r.max != null && x.value > r.max)
}
function notice(text, error) {
	msg.value = text
	msgError.value = !!error
}
function saveValues(list) {
	const n = Object.assign({}, values.value)
	for (const x of list) {
		n[x.func + '-' + x.record] = x
	}
	values.value = n
}
async function readAll() {
	reading.value = true
	notice('')
	try {
		const r = await action(props.cfg.id, 'read_parameters', {})
		saveValues(r.values || [])
		const malos = (r.values || []).filter(x => x.error).length
		notice(malos ? i18n.t('plugins.WorkshopRS485.machineProfile.read_n_no_response', { n: malos }) : i18n.t('plugins.WorkshopRS485.machineProfile.read_done'), malos > 0)
	} catch (e) {
		notice(e.message, true)
	} finally {
		reading.value = false
	}
}
async function readOne(r) {
	busy.value = key(r) + 'l'
	try {
		const x = await action(props.cfg.id, 'read_parameters', { records: [[r.func, r.record]] })
		saveValues(x.values || [])
	} catch (e) {
		notice(e.message, true)
	} finally {
		busy.value = null
	}
}
function arm(r) {
	const k = key(r)
	if (armed.value === k) {
		armed.value = null
		write(r)
		return
	}
	armed.value = k
	clearTimeout(armedTimer)
	armedTimer = setTimeout(() => { armed.value = null }, 4000)
}
async function write(r) {
	busy.value = key(r) + 'e'
	try {
		const x = await action(props.cfg.id, 'write_parameter', { record: r.record, value: Number(newItem.value) })
		saveValues([{ func: 3, record: r.record, value: x.value }])
		notice(x.verified ? i18n.t('plugins.WorkshopRS485.machineProfile.value_verified', { name: r.name, v: x.value, unit: r.unit || '' }) : i18n.t('plugins.WorkshopRS485.machineProfile.device_returned_other', { name: r.name, v: x.value }), !x.verified)
		newItem.value = null
	} catch (e) {
		notice(e.message, true)
	} finally {
		busy.value = null
	}
}
</script>

<style scoped>
.pe-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-bottom: 8px;
}
.pe-search {
	max-width: 320px;
}
.pe-table tbody tr {
	cursor: pointer;
}
.pe-reg {
	font-family: monospace;
	white-space: nowrap;
}
.pe-val {
	font-weight: 600;
	white-space: nowrap;
}
.pe-outside td {
	background: rgba(128, 128, 128, 0.1);
}
.pe-detail td {
	background: rgba(128, 128, 128, 0.08);
	cursor: default;
	padding-top: 8px !important;
	padding-bottom: 8px !important;
}
.pe-new {
	max-width: 170px;
}
.pe-new-sel {
	max-width: 300px;
}
.pe-alarm {
	border: 1px solid rgba(128, 128, 128, 0.3);
	border-radius: 6px;
	padding: 8px 10px;
	margin-bottom: 6px;
}
.pe-alarm.active {
	border-color: #f44336;
	background: rgba(128, 128, 128, 0.1);
}
.pe-code {
	font-family: monospace;
	font-weight: 700;
	min-width: 36px;
}
.pe-et {
	display: inline-block;
	min-width: 80px;
	opacity: 0.7;
	margin-right: 6px;
}
</style>
