<template>
	<v-dialog :model-value="modelValue" max-width="780" scrollable persistent :fullscreen="xs" @update:model-value="$emit('update:modelValue', $event)">
		<v-card v-if="form" class="editor-disp">
			<v-card-title class="py-3">
				<v-icon start>{{ newItem ? 'mdi-plus-circle-outline' : 'mdi-pencil' }}</v-icon>
				{{ newItem ? $t('plugins.WorkshopRS485.common.add_device') : $t('plugins.WorkshopRS485.common.edit') + (form.name || form.id) }}
				<v-spacer />
				<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_close')" icon size="small" @click="$emit('update:modelValue', false)"><v-icon>mdi-close</v-icon></v-btn>
			</v-card-title>
			<v-divider />
			<v-card-text class="pt-3">
				<!-- ===== Equipo ===== -->
				<div class="block">
					<div class="block-title"><v-icon size="small" start>mdi-chip</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.device') }}</div>
					<v-row density="compact">
						<v-col cols="12" sm="5"><v-text-field v-model.trim="form.name" :label="$t('plugins.WorkshopRS485.deviceEditor.name_e_g_z_axis_servo')" density="compact" variant="outlined" hide-details /></v-col>
						<v-col cols="12" sm="4">
							<v-select v-model="form.profile" :items="profiles" item-value="id" item-title="name" :label="$t('plugins.WorkshopRS485.deviceEditor.device_type')" density="compact" variant="outlined" hide-details :disabled="!newItem" @update:model-value="changeProfile" />
						</v-col>
						<v-col cols="12" sm="3">
							<v-select v-model="form.axis" :items="optionsAxis" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.deviceEditor.axis_it_moves')" density="compact" variant="outlined" hide-details />
						</v-col>
					</v-row>
					<div v-if="descProfile" class="text-body-small text-medium-emphasis mt-1">{{ descProfile }}</div>
					<div v-if="newItem && form.profile === 't3d'" class="text-body-small text-medium-emphasis mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.other_device_json_hint') }}
						<a href="#" @click.prevent="form.profile = 'generic'; changeProfile('generic')">{{ $t('plugins.WorkshopRS485.deviceEditor.use_generic_modbus') }}</a>
					</div>
					<div v-if="form.axis" class="text-body-small mt-1">
						<template v-if="form.axis">
							{{ $t('plugins.WorkshopRS485.deviceEditor.if_this_device_fails_the_job') }} <b>{{ $t('plugins.WorkshopRS485.deviceEditor.fault_word') }}</b> {{ $t(hasLights ? 'plugins.WorkshopRS485.deviceEditor.fault_explain' : 'plugins.WorkshopRS485.deviceEditor.fault_explain_no_lights', { axis: form.axis }) }}
						</template>
					</div>
				</div>

				<!-- ===== Conexion ===== -->
				<div class="block">
					<div class="block-title"><v-icon size="small" start>mdi-serial-port</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.connection') }}</div>
					<v-row density="compact">
						<v-col cols="12" sm="6">
							<v-select v-model="form.bus" :items="buses" item-value="id" :item-title="textBus" :label="$t('plugins.WorkshopRS485.deviceEditor.bus_adapter')" density="compact" variant="outlined" hide-details />
						</v-col>
						<v-col cols="6" sm="3"><v-text-field v-model.number="form.address" type="number" min="1" max="247" :label="$t('plugins.WorkshopRS485.deviceEditor.address')" density="compact" variant="outlined" hide-details /></v-col>
					</v-row>
					<div v-if="!buses.length" class="text-body-small text-warning mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.there_are_no_buses_yet_create') }} <b>{{ $t('plugins.WorkshopRS485.common.buses_and_adapters') }}</b>.
					</div>
					<div v-if="crashAddress" class="text-body-small text-warning mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.address_used_by', { n: form.address }) }} <b>{{ crashAddress.name || crashAddress.id }}</b> {{ $t('plugins.WorkshopRS485.deviceEditor.on_this_bus') }}
					</div>
					<div class="d-flex align-center flex-wrap mt-2" style="gap:8px">
						<v-btn size="x-small" variant="outlined" :loading="scanning" :disabled="!form.bus" @click="$emit('scan', form.bus)">
							<v-icon size="x-small" start>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.scan_bus_addresses_1_32') }}
						</v-btn>
						<template v-if="found[form.bus]">
							<span class="text-body-small">{{ $t('plugins.WorkshopRS485.common.answering') }}</span>
							<v-chip v-for="a in found[form.bus]" :key="a" size="x-small" :color="a === form.address ? 'primary' : ''" @click="form.address = a">{{ a }}</v-chip>
							<span v-if="!found[form.bus].length" class="text-body-small text-warning">{{ $t('plugins.WorkshopRS485.common.none') }}</span>
						</template>
					</div>

					<!-- exact values for the T3D panel -->
					<v-sheet v-if="form.profile === 't3d' && busSel" variant="outlined" rounded class="pa-2 mt-3 t3d-panel">
						<div class="text-body-small mb-1">{{ $t('plugins.WorkshopRS485.deviceEditor.on_the_servo_panel_set_exactly') }}</div>
						<div class="t3d-values">
							<div><span class="p">P-181</span><span class="v">{{ form.address || '?' }}</span><span class="d">{{ $t('plugins.WorkshopRS485.deviceEditor.address_lower') }}</span></div>
							<div><span class="p">P-182</span><span class="v">{{ t3dBaud.value }}</span><span class="d">{{ t3dBaud.text }}</span></div>
							<div><span class="p">P-183</span><span class="v">{{ t3dFormat.value }}</span><span class="d">{{ t3dFormat.text }}</span></div>
						</div>
						<div v-if="t3dBaud.value === '?' || t3dFormat.value === '?'" class="text-body-small text-warning mt-1">
							{{ $t('plugins.WorkshopRS485.deviceEditor.the_t3d_servo_only_supports_4800') }}
						</div>
						<div class="text-body-small text-medium-emphasis mt-1">{{ $t('plugins.WorkshopRS485.deviceEditor.after_changing_them_on_the_panel') }}</div>
					</v-sheet>
				</div>

				<!-- ===== Vigilancia ===== -->
				<div class="block">
					<div class="block-title"><v-icon size="small" start>mdi-shield-check-outline</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.monitoring') }}</div>
					<v-row density="compact">
						<v-col cols="12" sm="6">
							<v-select v-model="form.options.action_fault" :items="actionsFault" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.deviceEditor.on_a_fault')" density="compact" variant="outlined" hide-details />
						</v-col>
						<v-col cols="12" sm="6" v-if="form.options.action_fault === 'pause'">
							<v-select v-model="form.options.in_live" :items="actionsLive" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.deviceEditor.if_the_job_is_live_no')" density="compact" variant="outlined" hide-details />
						</v-col>
						<v-col cols="12" sm="6" v-if="form.axis && form.options.action_fault !== 'nothing'">
							<v-select v-model="form.options.in_motion" :items="actionsMotion" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.deviceEditor.if_fails_while_axis_moves', { axis: form.axis })" density="compact" variant="outlined" hide-details />
						</v-col>
						<v-col cols="12" sm="6" class="d-flex align-center">
							<v-switch v-model="form.options.pause_without_com" :label="$t('plugins.WorkshopRS485.deviceEditor.losing_communication_is_also_a_fault')" density="compact" hide-details class="mt-0" />
						</v-col>
					</v-row>
					<div class="text-body-small text-medium-emphasis mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.a_job_run_from_a_file') }}
					</div>
					<v-row density="compact" class="mt-2">
						<v-col cols="6" sm="3"><v-text-field v-model.number="form.options.poll_s" type="number" step="0.1" min="0.1" :label="$t('plugins.WorkshopRS485.deviceEditor.read_every_s')" density="compact" variant="outlined" hide-details /></v-col>
						<v-col cols="6" sm="3"><v-text-field v-model.number="form.options.faults_com_limit" type="number" min="1" :label="$t('plugins.WorkshopRS485.deviceEditor.consecutive_comm_failures')" density="compact" variant="outlined" hide-details /></v-col>
						<template v-if="form.profile === 't3d'">
							<v-col cols="6" sm="3"><v-text-field v-model.number="form.options.torque_max" type="number" :label="$t('plugins.WorkshopRS485.deviceEditor.max_torque')" density="compact" variant="outlined" hide-details /></v-col>
							<v-col cols="6" sm="3"><v-text-field v-model="form.options.current_max" type="number" step="0.1" :label="$t('plugins.WorkshopRS485.deviceEditor.max_current_a')" :placeholder="$t('plugins.WorkshopRS485.deviceEditor.empty_means_no')" density="compact" variant="outlined" hide-details /></v-col>
						</template>
					</v-row>

					<!-- JSON equipment profile (2026-10-10): optional; fills the tables
					     of parameters and alarms and the watched registers -->
					<template v-if="form.profile === 'generic'">
						<div class="text-title-small mt-3 mb-1">{{ $t('plugins.WorkshopRS485.common.device_profile') }} <span class="text-medium-emphasis font-weight-regular">{{ $t('plugins.WorkshopRS485.deviceEditor.optional') }}</span></div>
						<div class="text-body-small text-medium-emphasis mb-2">
							{{ $t('plugins.WorkshopRS485.deviceEditor.a_json_file_with_the_device') }}
						</div>
						<div class="d-flex flex-wrap align-center" style="gap:8px">
							<v-btn size="small" variant="outlined" :loading="profileBusy === 'import'" @click="fileProfile.click()"><v-icon size="small" start>mdi-file-import-outline</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.import_json') }}</v-btn>
							<v-btn size="small" variant="text" :loading="profileBusy === 'example'" @click="exampleProfile()"><v-icon size="small" start>mdi-file-eye-outline</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.example_t3d_servo') }}</v-btn>
							<v-btn v-if="form.options.profile_device" size="small" variant="text" :color="armedProfile ? 'error' : ''" @click="removeProfile()">
								{{ armedProfile ? $t('plugins.WorkshopRS485.deviceEditor.tap_again_to_remove_it') : $t('plugins.WorkshopRS485.deviceEditor.remove_profile') }}
							</v-btn>
							<input ref="fileProfile" type="file" accept=".json,application/json" style="display:none" @change="importProfile">
						</div>
						<div v-if="form.options.profile_device" class="text-body-medium mt-2">
							<v-icon size="small" color="success" class="mr-1">mdi-check-circle</v-icon>{{ summaryProfile }}
						</div>
						<div v-if="crashBus" class="text-body-small text-warning mt-1">{{ crashBus }}</div>
						<div v-if="profileMsg" class="text-body-small mt-1" :class="profileError ? 'text-error' : 'text-medium-emphasis'">{{ profileMsg }}</div>
						<ul v-if="profileNotices.length" class="text-body-small text-warning mt-1 profile-notices">
							<li v-for="(a, i) in profileNotices.slice(0, 12)" :key="i">{{ a }}</li>
							<li v-if="profileNotices.length > 12">{{ $t('plugins.WorkshopRS485.deviceEditor.and_n_more_warnings', { n: profileNotices.length - 12 }) }}</li>
						</ul>
					</template>

					<!-- registros del generico -->
					<template v-if="form.profile === 'generic'">
						<div class="text-title-small mt-3 mb-1">{{ $t('plugins.WorkshopRS485.deviceEditor.registers_to_read') }}</div>
						<div v-for="(r, i) in form.options.records" :key="i" class="reg-row">
							<v-text-field v-model.trim="r.name" :label="$t('plugins.WorkshopRS485.common.name')" density="compact" variant="outlined" hide-details />
							<v-text-field v-model.number="r.record" type="number" :label="$t('plugins.WorkshopRS485.common.register')" density="compact" variant="outlined" hide-details />
							<v-select v-model="r.func" :items="funcItems" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.common.function')" density="compact" variant="outlined" hide-details />
							<v-text-field v-model.number="r.scale" type="number" step="any" :label="$t('plugins.WorkshopRS485.deviceEditor.scale')" density="compact" variant="outlined" hide-details />
							<v-text-field v-model.trim="r.unit" :label="$t('plugins.WorkshopRS485.deviceEditor.unit')" density="compact" variant="outlined" hide-details />
							<v-text-field v-model="r.min" type="number" :label="$t('plugins.WorkshopRS485.deviceEditor.min')" density="compact" variant="outlined" hide-details />
							<v-text-field v-model="r.max" type="number" :label="$t('plugins.WorkshopRS485.deviceEditor.max')" density="compact" variant="outlined" hide-details />
							<v-checkbox v-model="r.with_sign" label="±" density="compact" hide-details class="mt-0" />
							<v-checkbox v-model="r.writable" :label="$t('plugins.WorkshopRS485.common.write')" density="compact" hide-details class="mt-0" />
							<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_delete')" icon size="small" @click="form.options.records.splice(i, 1)"><v-icon size="small">mdi-delete</v-icon></v-btn>
						</div>
						<v-btn size="x-small" variant="text" color="primary" @click="form.options.records.push({ name: '', record: null, func: 3, scale: 1, unit: '', with_sign: false, writable: false })">
							<v-icon size="x-small" start>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.add_register') }}
						</v-btn>
					</template>
				</div>
				<div v-if="msg" class="text-body-small mt-2" :class="msgError ? 'text-error' : 'text-success'">{{ msg }}</div>
			</v-card-text>
			<v-divider />
			<v-card-actions class="flex-wrap" style="gap:6px">
				<v-switch v-model="form.active" :label="$t('plugins.WorkshopRS485.deviceEditor.active')" density="compact" hide-details class="mt-0 ml-2 mr-4" />
				<v-switch :model-value="!!form.absent" :disabled="!form.active" :label="$t('plugins.WorkshopRS485.deviceEditor.absent_on_purpose')" density="compact" hide-details class="mt-0 mr-4"
					:title="$t('plugins.WorkshopRS485.deviceEditor.absent_hint')" @update:model-value="putAbsent" />
				<v-spacer />
				<v-btn v-if="!newItem" size="small" variant="text" :disabled="!can('rs485.save')" :color="armed ? 'error' : 'grey'" @click="armDelete">
					{{ armed ? $t('plugins.WorkshopRS485.deviceEditor.tap_again_to_remove_it') : $t('plugins.WorkshopRS485.deviceEditor.remove_device') }}
				</v-btn>
				<v-btn size="small" variant="text" @click="$emit('update:modelValue', false)">{{ $t('plugins.WorkshopRS485.common.cancel') }}</v-btn>
				<v-btn size="small" color="primary" :loading="saving" :disabled="!valid || !can('rs485.save')" @click="$emit('save', copy(form))">{{ $t('plugins.WorkshopRS485.common.save') }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script setup>
// Editor of one RS485 device in a dialog: Device / Connection / Monitoring.
// The parent saves (API rs485.save) and does the address search.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useDisplay } from 'vuetify'
import { i18n, machineModel } from './dwc-host.js'
import { BAUDS_T3D, PARITY_T3D, optionsOf, callService, useCan } from './api.js'
import { pathExists } from './workshop-ids.js' // the Lights plugin is optional: nothing about it when absent

function copy(o) {
	return JSON.parse(JSON.stringify(o))
}

const props = defineProps({
	modelValue: Boolean,
	initial: Object, // device to edit (a copy) or the draft of the new one
	newItem: Boolean,
	buses: Array,
	devices: Array,
	profiles: Array,
	found: Object,
	scanning: Boolean,
	saving: Boolean,
	msg: String,
	msgError: Boolean
})
const emit = defineEmits(['update:modelValue', 'scan', 'save', 'remove'])

const router = useRouter()
const { xs } = useDisplay()
const { can } = useCan()

const form = ref(null)
const armed = ref(false)
let armedTimer = null
const armedProfile = ref(false)
const profileBusy = ref(null)
const profileMsg = ref('')
const profileError = ref(false)
const profileNotices = ref([])
const fileProfile = ref(null)
const actionsFault = [
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.pause_the_job_and_warn'), value: 'pause' },
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.just_warn'), value: 'notify' },
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.nothing_just_show'), value: 'nothing' }
]
const actionsMotion = [
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.just_warn'), value: 'notify' },
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.emergency_stop_m112'), value: 'emergency' }
]
const actionsLive = [
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.just_warn_you_pause_in_the'), value: 'notify' },
	{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.emergency_stop_m112'), value: 'emergency' }
]
const funcItems = [{ text: '3 holding', value: 3 }, { text: '4 input', value: 4 }]

const hasLights = computed(() => pathExists(router, '/Plugins/Lights'))
const optionsAxis = computed(() => {
	const ejes = ((machineModel().move || {}).axes || []).filter(a => a && a.visible !== false).map(a => a.letter)
	const current = form.value && form.value.axis
	if (current && !ejes.includes(current)) {
		ejes.push(current)
	}
	return [{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.none'), value: '' }, ...ejes.map(l => ({ text: i18n.t('plugins.WorkshopRS485.deviceEditor.axis_name', { axis: l }), value: l }))]
})
const descProfile = computed(() => {
	const p = props.profiles.find(x => x.id === (form.value && form.value.profile))
	return p ? p.description : ''
})
const busSel = computed(() => props.buses.find(b => b.id === form.value.bus) || null)
const t3dBaud = computed(() => {
	const i = BAUDS_T3D.indexOf(Number(busSel.value.baud))
	return i < 0 ? { value: '?', text: i18n.t('plugins.WorkshopRS485.deviceEditor.baud_not_possible', { baud: busSel.value.baud }) } : { value: i, text: i18n.t('plugins.WorkshopRS485.deviceEditor.baud_n', { baud: busSel.value.baud }) }
})
const t3dFormat = computed(() => {
	const par = busSel.value.parity || 'N'
	const v = PARITY_T3D[par]
	if (v == null || Number(busSel.value.bits_stop || 1) !== 1) {
		return { value: '?', text: i18n.t('plugins.WorkshopRS485.deviceEditor.format_not_possible', { format: '8' + par + (busSel.value.bits_stop || 1) }) }
	}
	return { value: v, text: `8${par}1` }
})
const crashAddress = computed(() => {
	const f = form.value
	return props.devices.find(d => d.id !== f.id && d.bus === f.bus && Number(d.address) === Number(f.address)) || null
})
const summaryProfile = computed(() => {
	const pe = form.value.options.profile_device || {}
	const e = pe.device || {}
	const nombre = [e.mark, e.model].filter(Boolean).join(' ') || i18n.t('plugins.WorkshopRS485.deviceEditor.profile_loaded')
	const p = pe.params || []
	const vig = p.filter(r => r.watch).length
	return i18n.t('plugins.WorkshopRS485.deviceEditor.profile_summary', { name: nombre, n: p.length, watched: vig, alarms: (pe.alarms || []).length }) +
		(pe.alarm ? ', ' + i18n.t('plugins.WorkshopRS485.deviceEditor.alarm_code_in_register', { n: pe.alarm.record }) : ', ' + i18n.t('plugins.WorkshopRS485.deviceEditor.no_alarm_register'))
})
const crashBus = computed(() => {
	const e = ((form.value.options.profile_device || {}).device) || {}
	const b = busSel.value
	if (!b || !e.baud) {
		return ''
	}
	const asks = `${e.baud} 8${e.parity || 'N'}${e.bits_stop || 1}`
	const tiene = `${b.baud} 8${b.parity || 'N'}${b.bits_stop || 1}`
	return asks === tiene ? '' : i18n.t('plugins.WorkshopRS485.deviceEditor.bus_mismatch', { wants: asks, has: tiene })
})
const valid = computed(() => {
	const f = form.value
	return !!(f && f.profile && f.bus && f.address >= 1 && f.address <= 247 && !crashAddress.value)
})

watch(() => props.modelValue, v => {
	if (v && props.initial) {
		form.value = copy(props.initial)
		armed.value = false
	}
}, { immediate: true })

onBeforeUnmount(() => {
	clearTimeout(armedTimer)
})

function putAbsent(v) {
	if (v) {
		form.value.absent = true
	} else {
		delete form.value.absent
	}
}
function textBus(b) {
	return `${b.name || b.id} (${b.baud} 8${b.parity || 'N'}${b.bits_stop || 1})`
}
function applyProfile(r, origen) {
	const o = form.value.options
	const vig = (r.options && r.options.records) || []
	const key = x => (x.func || 3) + '-' + x.record
	const del = new Set(vig.map(key))
	// those loaded by hand that the profile does not bring stay
	const manuales = (o.records || []).filter(x => x.record !== null && x.record !== '' && !del.has(key(x)))
	o.profile_device = r.profile
	o.records = [...vig, ...manuales]
	const e = r.profile.device || {}
	if (props.newItem && e.address) {
		form.value.address = e.address
	}
	if (props.newItem && !form.value.name && (e.mark || e.model)) {
		form.value.name = [e.mark, e.model].filter(Boolean).join(' ')
	}
	profileNotices.value = r.notices || []
	profileError.value = false
	profileMsg.value = i18n.t('plugins.WorkshopRS485.deviceEditor.profile_applied', { origin: origen }) + (manuales.length ? ' ' + i18n.t('plugins.WorkshopRS485.deviceEditor.n_registers_kept', { n: manuales.length }) : '')
}
async function importProfile(ev) {
	const f = ev.target.files && ev.target.files[0]
	ev.target.value = ''
	if (!f) {
		return
	}
	profileBusy.value = 'import'
	profileNotices.value = []
	try {
		if (f.size > 2 * 1024 * 1024) {
			throw new Error(i18n.t('plugins.WorkshopRS485.deviceEditor.file_over_2mb'))
		}
		let data
		try {
			data = JSON.parse(await f.text())
		} catch (e) {
			throw new Error(i18n.t('plugins.WorkshopRS485.deviceEditor.not_valid_json', { error: e.message }))
		}
		const r = await callService({ P: 'profile_check', J: data })
		applyProfile(r, i18n.t('plugins.WorkshopRS485.deviceEditor.profile_imported_from', { file: f.name }))
	} catch (e) {
		profileError.value = true
		profileMsg.value = i18n.t('plugins.WorkshopRS485.deviceEditor.could_not_import', { error: e.message })
	} finally {
		profileBusy.value = null
	}
}
async function exampleProfile() {
	profileBusy.value = 'example'
	try {
		const r = await callService({ P: 'profile_example' })
		const url = URL.createObjectURL(new Blob([JSON.stringify(r.profile, null, 2) + '\n'], { type: 'application/json' }))
		const a = document.createElement('a')
		a.href = url
		a.download = 'example-servo-T3D.rs485.json'
		document.body.appendChild(a)
		a.click()
		a.remove()
		setTimeout(() => URL.revokeObjectURL(url), 2000)
		profileError.value = false
		profileMsg.value = i18n.t('plugins.WorkshopRS485.deviceEditor.the_example_was_downloaded_open_it')
	} catch (e) {
		profileError.value = true
		profileMsg.value = i18n.t('plugins.WorkshopRS485.deviceEditor.could_not_build_example', { error: e.message })
	} finally {
		profileBusy.value = null
	}
}
function removeProfile() {
	if (!armedProfile.value) {
		armedProfile.value = true
		setTimeout(() => { armedProfile.value = false }, 4000)
		return
	}
	armedProfile.value = false
	delete form.value.options.profile_device
	profileNotices.value = []
	profileError.value = false
	profileMsg.value = i18n.t('plugins.WorkshopRS485.deviceEditor.profile_removed_the_watched_registers_stay')
}
function changeProfile(p) {
	form.value.options = optionsOf(props.profiles, p)
}
function armDelete() {
	if (armed.value) {
		armed.value = false
		emit('remove', form.value.id)
		return
	}
	armed.value = true
	clearTimeout(armedTimer)
	armedTimer = setTimeout(() => { armed.value = false }, 4000)
}
</script>

<style scoped>
.block {
	margin-bottom: 18px;
}
.block-title {
	font-size: 0.95rem;
	font-weight: 500;
	margin-bottom: 8px;
	padding-bottom: 4px;
	border-bottom: 1px solid rgba(128, 128, 128, 0.3);
}
.profile-notices {
	padding-left: 18px;
	margin: 0;
}
.t3d-panel {
	border-color: rgba(33, 150, 243, 0.5) !important;
}
.t3d-values {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 24px;
}
.t3d-values > div {
	display: flex;
	align-items: baseline;
	gap: 6px;
}
.t3d-values .p {
	font-family: monospace;
	font-size: 0.85rem;
}
.t3d-values .v {
	font-size: 1.4rem;
	font-weight: 600;
	color: #2196f3;
}
.t3d-values .d {
	font-size: 0.75rem;
	opacity: 0.7;
}
.reg-row {
	display: grid;
	grid-template-columns: 1.4fr 0.8fr 1fr 0.7fr 0.7fr 0.6fr 0.6fr auto auto auto;
	gap: 6px;
	align-items: center;
	margin-bottom: 6px;
}
@media (max-width: 900px) {
	.reg-row {
		grid-template-columns: 1fr 1fr 1fr;
	}
}
</style>
