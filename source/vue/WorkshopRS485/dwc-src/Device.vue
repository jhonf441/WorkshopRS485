<template>
	<v-card variant="outlined" class="disp-card" :class="'edge-' + (live ? live.state : 'unknown') + (isNotice ? ' notice' : '')">
		<v-card-text>
			<!-- header: who it is and how it is -->
			<div class="cab">
				<div class="cab-icon" :class="'background-' + colorCab">
					<v-icon color="white">{{ cfg.profile === 't3d' ? 'mdi-engine' : 'mdi-chip' }}</v-icon>
				</div>
				<div class="cab-text">
					<div class="d-flex align-center flex-wrap" style="gap:6px">
						<span class="text-title-large cab-name">{{ cfg.name || cfg.id }}</span>
						<v-chip size="x-small" :color="isNotice ? 'info' : est.color" variant="flat">{{ isNotice ? $t('plugins.WorkshopRS485.device.warning') : est.text }}</v-chip>
						<v-chip size="x-small" variant="outlined" :color="cfg.axis ? 'primary' : 'grey'" :title="cfg.axis ? $t('plugins.WorkshopRS485.device.axis_faults_pause') : $t('plugins.WorkshopRS485.device.no_axis_faults_warn')">
							<v-icon size="x-small" start>mdi-axis-arrow</v-icon>{{ cfg.axis ? $t('plugins.WorkshopRS485.device.axis_name', { axis: cfg.axis }) : $t('plugins.WorkshopRS485.common.no_axis') }}
						</v-chip>
						<v-chip v-if="cfg.auto" size="x-small" variant="outlined" color="info" :title="$t('plugins.WorkshopRS485.device.the_system_found_it_and_added')">
							<v-icon size="x-small" start>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.device.added_automatically') }}
						</v-chip>
					</div>
					<div class="text-body-small text-medium-emphasis">
						{{ nameProfile }} &middot; {{ cfg.bus }} &middot; {{ $t('plugins.WorkshopRS485.device.address_n', { n: cfg.address }) }}
						<template v-if="cfg.active !== false && !cfg.absent"> &middot; <span :class="{ 'text-warning': doesS > 5 }">{{ textReading }}</span></template>
					</div>
				</div>
				<div class="cab-buttons">
					<v-btn size="small" variant="text" :disabled="!can('rs485.save')" @click="$emit('edit')"><v-icon size="small" start>mdi-pencil</v-icon>{{ $t('plugins.WorkshopRS485.common.edit') }}</v-btn>
					<v-btn icon size="small" :title="collapsed ? $t('plugins.WorkshopRS485.device.show_details') : $t('plugins.WorkshopRS485.device.hide_details')" @click="fold(!collapsed)">
						<v-icon>{{ collapsed ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
					</v-btn>
				</div>
			</div>
			<!-- absent on purpose / without communication: what happened and what to do -->
			<div v-if="cfg.absent && cfg.active !== false" class="d-flex align-center flex-wrap text-body-medium mt-2" style="gap:6px">
				<v-icon size="small" color="grey">mdi-eye-off-outline</v-icon>
				<span>{{ $t('plugins.WorkshopRS485.device.absent_on_purpose_it_is_not') }}</span>
				<span v-if="live && live.answers" class="text-info">{{ $t('plugins.WorkshopRS485.device.it_answers_now') }}</span>
				<v-btn size="x-small" variant="outlined" color="primary" @click="$emit('absent', false)"><v-icon size="x-small" start>mdi-eye-outline</v-icon>{{ $t('plugins.WorkshopRS485.common.watch_again') }}</v-btn>
			</div>
			<div v-else-if="live && live.state === 'without_communication'" class="d-flex align-center flex-wrap text-body-small mt-2" style="gap:6px">
				<template v-if="live.seen_does_s != null"><span>{{ $t('plugins.WorkshopRS485.device.last_answered') }}</span> {{ doesText.n }} <span>{{ doesText.u }}</span></template>
				<span v-else>{{ ' ' }}{{ $t('plugins.WorkshopRS485.device.never_answered') }}</span>
				<v-btn size="x-small" variant="text" :title="$t('plugins.WorkshopRS485.common.if_it_is_not_connected_on')" @click="$emit('absent', true)">
					<v-icon size="x-small" start>mdi-eye-off-outline</v-icon>{{ $t('plugins.WorkshopRS485.common.mark_as_absent') }}
				</v-btn>
			</div>
			<div v-if="live && live.message && !v.alarm" class="text-body-medium mt-2" :class="isNotice ? 'text-blue-lighten-2' : (live.state === 'alarm' ? 'text-error' : 'text-warning')">
				<v-icon size="small" :color="isNotice ? 'info' : 'warning'" class="mr-1">mdi-alert-circle-outline</v-icon>{{ textOf(live, 'message') }}
				<span v-if="isNotice" class="text-medium-emphasis"> {{ $t('plugins.WorkshopRS485.device.moves_no_axis_the_machine_can') }}</span>
			</div>

			<!-- ===== T3D ===== -->
			<template v-if="cfg.profile === 't3d'">
				<div class="tiles mt-3">
					<div class="tile" :class="{ 'tile-alarm': v.alarm }">
						<div class="tile-label"><v-icon size="x-small" class="mr-1">mdi-alert-octagon-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.alarm') }}</div>
						<div class="tile-value" :class="v.alarm ? 'text-error' : (v.alarm === 0 ? 'text-success' : '')">{{ v.alarm == null ? '--' : (v.alarm ? 'Err' + v.alarm : $t('plugins.WorkshopRS485.common.none')) }}</div>
						<div v-if="alarmInfo" class="tile-sub text-red-lighten-2">{{ alarmInfo.name }}</div>
					</div>
					<div class="tile">
						<div class="tile-label"><v-icon size="x-small" class="mr-1">mdi-arm-flex-outline</v-icon>Torque</div>
						<div class="tile-value">{{ v.torque == null ? '--' : v.torque }}<small> %</small></div>
						<v-progress-linear :model-value="Math.min(100, Math.abs(v.torque || 0) / (op.torque_max || 150) * 100)" height="4" rounded :color="Math.abs(v.torque || 0) > (op.torque_max || 150) * 0.8 ? 'warning' : 'success'" bg-color="grey-darken-3" />
						<div class="tile-sub">{{ $t('plugins.WorkshopRS485.device.peak_and_limit', { peak: v.torque_peak == null ? '--' : v.torque_peak, max: op.torque_max }) }}</div>
					</div>
					<div class="tile">
						<div class="tile-label"><v-icon size="x-small" class="mr-1">mdi-flash-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.current') }}</div>
						<div class="tile-value">{{ v.current == null ? '--' : v.current.toFixed(1) }}<small> A</small></div>
						<svg v-if="histCurrent.length > 1" class="mini" viewBox="0 0 100 20" preserveAspectRatio="none"><polyline :points="line(histCurrent)" fill="none" stroke="#66BB6A" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg>
						<div class="tile-sub">{{ op.current_max ? $t('plugins.WorkshopRS485.device.limit') + op.current_max + ' A' : $t('plugins.WorkshopRS485.device.no_limit') }}</div>
					</div>
					<div class="tile">
						<div class="tile-label"><v-icon size="x-small" class="mr-1">mdi-shield-check-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.if_it_fails') }}</div>
						<div class="tile-value tile-value-small">{{ textAction }}</div>
						<div class="tile-sub">{{ $t('plugins.WorkshopRS485.device.every_s_n_readings', { s: op.poll_s, n: live ? live.readings : 0 }) }}</div>
					</div>
				</div>

				<!-- active alarm: what is happening, what to do, how to clear it -->
				<div v-if="v.alarm" class="alarm-box mt-3" :class="{ notice: isNotice }">
					<div class="d-flex align-center flex-wrap" style="gap:8px">
						<v-icon :color="isNotice ? 'info' : 'error'">mdi-alert-octagon</v-icon>
						<span class="text-title-medium font-weight-medium">Err{{ v.alarm }} &middot; {{ alarmInfo ? alarmInfo.name : $t('plugins.WorkshopRS485.device.alarm_not_in_manual') }}</span>
						<v-chip v-if="alarmInfo" size="x-small" :color="DELETED[alarmInfo.deleted].color" variant="flat">{{ DELETED[alarmInfo.deleted].text }}</v-chip>
					</div>
					<div v-if="alarmInfo" class="steps-alarm mt-2">
						<div><span class="et">{{ $t('plugins.WorkshopRS485.common.what_happens') }}</span><span>{{ alarmInfo.description }}</span></div>
						<div><span class="et">{{ $t('plugins.WorkshopRS485.common.what_to_do') }}</span><span class="alarm-solution">{{ alarmInfo.solution }}</span></div>
						<div><span class="et">{{ $t('plugins.WorkshopRS485.device.how_it_clears') }}</span><span>{{ alarmInfo.procedure || alarmInfo.deleted_text }}</span></div>
					</div>
					<div class="d-flex flex-wrap align-center mt-2" style="gap:8px">
						<v-btn v-if="(!alarmInfo || alarmInfo.deleted === 'si') && can('rs485.action', { action: 'clear_alarm' })" size="small" variant="outlined" :color="armed === 'alarm' ? 'error' : ''" :loading="busy === 'alarm'" @click="arm('alarm', deleteAlarm)">
							<v-icon size="small" start>mdi-alarm-off</v-icon>{{ armed === 'alarm' ? $t('plugins.WorkshopRS485.device.tap_again_to_clear_the_alarm') : $t('plugins.WorkshopRS485.device.clear_alarm') }}
						</v-btn>
						<v-btn size="small" variant="text" @click="open(3)"><v-icon size="small" start>mdi-format-list-numbered</v-icon>{{ $t('plugins.WorkshopRS485.device.see_all_codes') }}</v-btn>
						<v-btn size="small" variant="text" @click="open(4)"><v-icon size="small" start>mdi-history</v-icon>{{ $t('plugins.WorkshopRS485.device.history') }}</v-btn>
					</div>
				</div>
				<div v-if="result" class="text-body-small mt-1" :class="resultError ? 'text-error' : 'text-success'">{{ result }}</div>

				<template v-if="!collapsed">
					<v-tabs v-model="section" class="mt-3 sections" height="38">
						<v-tab :value="0"><v-icon size="small" start>mdi-chart-line</v-icon>{{ $t('plugins.WorkshopRS485.device.charts') }}</v-tab>
						<v-tab :value="1"><v-icon size="small" start>mdi-gauge</v-icon>{{ $t('plugins.WorkshopRS485.device.live_states') }}</v-tab>
						<v-tab :value="2"><v-icon size="small" start>mdi-tune</v-icon>{{ $t('plugins.WorkshopRS485.device.parameters') }}</v-tab>
						<v-tab :value="3"><v-icon size="small" start :color="v.alarm ? 'error' : ''">mdi-alert-circle-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.alarm_codes') }}</v-tab>
						<v-tab :value="4"><v-icon size="small" start>mdi-history</v-icon>{{ $t('plugins.WorkshopRS485.device.history') }}</v-tab>
					</v-tabs>
					<div class="pt-3">
						<template v-if="section === 0">
							<v-row density="compact" v-if="histTorque.length > 1">
								<v-col cols="12" md="6">
									<div class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.device.torque') }}</div>
									<detail-chart :history="histTorque" color="#FFA726" unit="%" :label="$t('plugins.WorkshopRS485.device.torque')" :limit="op.torque_max" :limit-label="$t('plugins.WorkshopRS485.device.limit')" :height="140" />
								</v-col>
								<v-col cols="12" md="6">
									<div class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.device.current_a') }}</div>
									<detail-chart :history="histCurrent" color="#66BB6A" unit="A" :label="$t('plugins.WorkshopRS485.device.current')" :limit="op.current_max || null" :limit-label="$t('plugins.WorkshopRS485.device.limit')" :height="140" />
								</v-col>
							</v-row>
							<div v-else class="empty">
								<v-icon size="large" color="grey">mdi-chart-line</v-icon>
								<div>{{ $t('plugins.WorkshopRS485.device.the_torque_and_current_charts_appear') }}</div>
							</div>
						</template>
						<template v-else-if="!table">
							<div v-if="tableError" class="text-body-medium text-error">{{ tableError }}</div>
							<v-progress-linear v-else indeterminate height="2" />
						</template>
						<states-t3d v-else-if="section === 1" :disp-id="cfg.id" :table="table" />
						<params-t3d v-else-if="section === 2" :disp-id="cfg.id" />
						<alarms-t3d v-else-if="section === 3" :alarms="table.alarms || []" :current="v.alarm || 0" />
						<history-t3d v-else-if="section === 4" :disp-id="cfg.id" :alarms="table.alarms || []" />
					</div>
					<div class="d-flex flex-wrap align-center mt-3" style="gap:8px">
						<v-btn size="small" variant="text" :loading="busy === 'export'" @click="exportProfile()"><v-icon size="small" start>mdi-file-export-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.export_profile_json') }}</v-btn>
						<span class="text-body-small text-medium-emphasis">{{ textExport }}</span>
					</div>
				</template>
			</template>

			<!-- ===== Generico ===== -->
			<template v-else>
				<div class="tiles mt-3" v-if="regs.length">
					<div v-for="r in regs" :key="r.record" class="tile" :class="{ 'tile-alarm': outsideOfSpan(r) }">
						<div class="tile-label">{{ r.name || 'reg ' + r.record }} <span class="text-medium-emphasis">({{ r.record }})</span></div>
						<div class="tile-value">{{ valueFor(r) }}<small> {{ r.unit }}</small></div>
						<div v-if="r.min !== '' && r.min != null || r.max !== '' && r.max != null" class="tile-sub">{{ r.min != null && r.min !== '' ? $t('plugins.WorkshopRS485.device.min') + r.min : '' }} {{ r.max != null && r.max !== '' ? $t('plugins.WorkshopRS485.device.max') + r.max : '' }}</div>
					</div>
				</div>
				<div v-else-if="!hasProfile" class="empty mt-2">
					<v-icon size="large" color="grey">mdi-format-list-bulleted-square</v-icon>
					<div>{{ $t('plugins.WorkshopRS485.device.no_registers_defined', { n: op.record_test || 0 }) }}</div>
				</div>
				<!-- active alarm according to the equipment profile's table -->
				<div v-if="alarmProfile" class="alarm-box mt-3" :class="{ notice: isNotice }">
					<div class="d-flex align-center flex-wrap" style="gap:8px">
						<v-icon :color="isNotice ? 'info' : 'error'">mdi-alert-octagon</v-icon>
						<span class="text-title-medium font-weight-medium">{{ $t('plugins.WorkshopRS485.device.alarm_n', { n: v.alarm }) }} &middot; {{ alarmProfile.text || $t('plugins.WorkshopRS485.device.not_in_the_profile_table') }}</span>
					</div>
					<div class="steps-alarm mt-2">
						<div v-if="alarmProfile.cause"><span class="et">{{ $t('plugins.WorkshopRS485.common.cause') }}</span><span>{{ alarmProfile.cause }}</span></div>
						<div v-if="alarmProfile.that_do"><span class="et">{{ $t('plugins.WorkshopRS485.common.what_to_do') }}</span><span class="alarm-solution">{{ alarmProfile.that_do }}</span></div>
					</div>
				</div>
				<template v-if="!collapsed && hasProfile">
					<div class="text-title-small mt-4 mb-1"><v-icon size="small" class="mr-1">mdi-file-document-outline</v-icon>{{ $t('plugins.WorkshopRS485.common.device_profile') }}</div>
					<machine-profile :cfg="cfg" :live="live" />
				</template>
				<template v-if="!collapsed">
					<div class="text-title-small mt-3 mb-1"><v-icon size="small" class="mr-1">mdi-console</v-icon>{{ $t('plugins.WorkshopRS485.device.read_or_write_a_register_by') }}</div>
					<div class="d-flex flex-wrap align-center" style="gap:8px">
						<v-text-field v-model.number="manual.record" type="number" :label="$t('plugins.WorkshopRS485.common.register')" density="compact" variant="outlined" hide-details style="max-width:120px" />
						<v-select v-model="manual.func" :items="[3, 4]" :label="$t('plugins.WorkshopRS485.common.function')" density="compact" variant="outlined" hide-details style="max-width:110px" />
						<v-btn size="small" variant="outlined" :loading="busy === 'read'" @click="readManual()">{{ $t('plugins.WorkshopRS485.common.read') }}</v-btn>
						<v-text-field v-model.number="manual.value" type="number" :label="$t('plugins.WorkshopRS485.common.value')" density="compact" variant="outlined" hide-details style="max-width:120px" />
						<v-btn size="small" variant="outlined" :disabled="!can('rs485.action', { action: 'write_register' })" :color="armed === 'write' ? 'error' : ''" :loading="busy === 'write'" @click="arm('write', writeManual)">
							{{ armed === 'write' ? $t('plugins.WorkshopRS485.device.tap_again') : $t('plugins.WorkshopRS485.common.write') }}
						</v-btn>
						<span v-if="result" class="text-body-small" :class="resultError ? 'text-error' : 'text-success'">{{ result }}</span>
					</div>

					<!-- identificacion Modbus (funcion 43): fabricante y modelo -->
					<div class="text-title-small mt-4 mb-1"><v-icon size="small" class="mr-1">mdi-card-account-details-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.which_device_it_is') }}</div>
					<div class="d-flex flex-wrap align-center" style="gap:8px">
						<v-btn size="small" variant="outlined" :disabled="!can('rs485.action', { action: 'identify' })" :loading="busy === 'identify'" @click="identify()">{{ $t('plugins.WorkshopRS485.device.identify') }}</v-btn>
						<template v-if="ident">
							<span class="text-body-medium"><b>{{ ident.manufacturer || '?' }}</b> {{ ident.model }}<span v-if="ident.version" class="text-medium-emphasis"> &middot; {{ $t('plugins.WorkshopRS485.device.version_n', { v: ident.version }) }}</span></span>
							<v-btn size="x-small" variant="text" color="primary" @click="$emit('rename', nameIdent)">{{ $t('plugins.WorkshopRS485.device.use_as_name') }}</v-btn>
						</template>
						<span v-else-if="identNo" class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.device.it_did_not_answer_the_identification') }}</span>
						<span v-else class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.device.asks_the_device_for_its_maker') }}</span>
					</div>

					<div class="text-title-small mt-4 mb-1"><v-icon size="small" class="mr-1">mdi-file-document-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.device_profile_json') }}</div>
					<div class="d-flex flex-wrap align-center mt-0" style="gap:8px">
						<v-btn size="small" variant="text" :loading="busy === 'export'" @click="exportProfile()"><v-icon size="small" start>mdi-file-export-outline</v-icon>{{ $t('plugins.WorkshopRS485.device.export_profile_json') }}</v-btn>
						<span class="text-body-small text-medium-emphasis">{{ textExport }}</span>
					</div>

					<!-- explore registers: those that answer, with their current value -->
					<div class="text-title-small mt-4 mb-1"><v-icon size="small" class="mr-1">mdi-magnify-scan</v-icon>{{ $t('plugins.WorkshopRS485.device.explore_registers') }}</div>
					<div class="text-body-small text-medium-emphasis mb-2">{{ $t('plugins.WorkshopRS485.device.reads_a_range_of_registers_and') }}</div>
					<div class="d-flex flex-wrap align-center" style="gap:8px">
						<v-text-field v-model.number="exp.since" type="number" min="0" :label="$t('plugins.WorkshopRS485.common.from')" density="compact" variant="outlined" hide-details style="max-width:100px" />
						<v-text-field v-model.number="exp.until" type="number" min="0" :label="$t('plugins.WorkshopRS485.common.to')" density="compact" variant="outlined" hide-details style="max-width:100px" />
						<v-select v-model="exp.func" :items="functionsExplore" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.device.type')" density="compact" variant="outlined" hide-details style="max-width:220px" />
						<v-btn v-if="!expState.active" size="small" color="primary" :disabled="!can('rs485.action', { action: 'explore' })" :loading="busy === 'explore'" @click="explore()"><v-icon size="small" start>mdi-play</v-icon>{{ $t('plugins.WorkshopRS485.device.explore') }}</v-btn>
						<v-btn v-else size="small" variant="outlined" color="warning" @click="exploreCancel()">{{ $t('plugins.WorkshopRS485.common.cancel') }}</v-btn>
					</div>
					<template v-if="expState.total">
						<v-progress-linear class="mt-2" :model-value="expPct" height="6" rounded :color="expState.error && expState.error !== 'cancelled' ? 'error' : 'primary'" />
						<div class="text-body-small mt-1">
							{{ expState.active ? $t('plugins.WorkshopRS485.device.exploring') : $t('plugins.WorkshopRS485.device.done') }}: {{ $t('plugins.WorkshopRS485.device.explore_progress', { n: expState.done, total: expState.total, found: expList.length }) }}
							<span v-if="expState.error" :class="expState.error === 'cancelled' ? 'text-medium-emphasis' : 'text-error'"> &middot; {{ expState.error }}</span>
						</div>
						<v-table v-if="expList.length" density="compact" class="mt-2 exp-table">
							<thead><tr><th>{{ $t('plugins.WorkshopRS485.common.register') }}</th><th>{{ $t('plugins.WorkshopRS485.device.type') }}</th><th>{{ $t('plugins.WorkshopRS485.common.value') }}</th><th>Hex</th><th /></tr></thead>
							<tbody>
								<tr v-for="x in expList" :key="x.func + '-' + x.record">
									<td>{{ x.record }}</td>
									<td class="text-medium-emphasis">{{ x.func === 3 ? 'holding' : 'input' }}</td>
									<td>{{ x.value }}<span v-if="x.value > 32767" class="text-medium-emphasis"> ({{ x.value - 65536 }})</span></td>
									<td class="text-medium-emphasis">0x{{ x.value.toString(16).toUpperCase().padStart(4, '0') }}</td>
									<td class="text-right">
										<v-btn v-if="!alreadyWatched(x)" size="x-small" variant="text" color="primary" @click="$emit('watch', { record: x.record, func: x.func })">{{ $t('plugins.WorkshopRS485.device.watch') }}</v-btn>
										<span v-else class="text-body-small text-success">{{ $t('plugins.WorkshopRS485.device.watched') }}</span>
									</td>
								</tr>
							</tbody>
						</v-table>
					</template>
				</template>
			</template>
		</v-card-text>
	</v-card>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { i18n } from './dwc-host.js'
import DetailChart from './DetailChart.vue'
import ParamsT3d from './ParamsT3d.vue'
import StatesT3d from './StatesT3d.vue'
import AlarmsT3d from './AlarmsT3d.vue'
import HistoryT3d from './HistoryT3d.vue'
import MachineProfile from './MachineProfile.vue'
import { action, info, deleted as DELETED, states, does, textOf, useCan } from './api.js'

const HIST = 300
const FOLDED = 'workshopRS485Collapsed'

function readCollapsed() {
	try {
		return JSON.parse(localStorage.getItem(FOLDED) || '[]')
	} catch (e) {
		return []
	}
}

const props = defineProps({
	cfg: { type: Object, required: true },
	live: { type: Object, default: null },
	profiles: { type: Array, default: () => [] }
})
defineEmits(['edit', 'absent', 'rename', 'watch'])

const { can } = useCan()
const histTorque = ref([])
const histCurrent = ref([])
const section = ref(0)
const table = ref(null)
const tableError = ref(null)
const armed = ref(null)
let armedTimer = null
const busy = ref(null)
const result = ref(null)
const resultError = ref(false)
const manual = ref({ record: null, func: 3, value: null })
const ident = ref(null)
const identNo = ref(false)
const exp = ref({ since: 0, until: 99, func: 3 })
const expState = ref({})
const expList = ref([])
let expTimer = null
const collapsed = ref(readCollapsed().includes(props.cfg.id))
const lastReading = ref(null) // clock of THIS screen (the system's is shifted)
const now = ref(Date.now())
let clock = null

const v = computed(() => (props.live && props.live.values) || {})
// same values the backend uses: profile defaults + what is configured
const op = computed(() => {
	const p = props.profiles.find(x => x.id === props.cfg.profile)
	return { ...((p && p.options) || {}), ...(props.cfg.options || {}) }
})
const regs = computed(() => op.value.records || [])
const hasProfile = computed(() => {
	const pe = op.value.profile_device
	return !!(pe && ((pe.params || []).length || (pe.alarms || []).length || pe.alarm))
})
const alarmProfile = computed(() => {
	const pe = op.value.profile_device
	if (props.cfg.profile === 't3d' || !pe || !pe.alarm || v.value.alarm == null || v.value.alarm === (pe.alarm.without_alarm || 0)) {
		return null
	}
	return (pe.alarms || []).find(a => a.code === v.value.alarm) || {}
})
const textExport = computed(() => props.cfg.profile === 't3d'
	? i18n.t('plugins.WorkshopRS485.device.the_t3d_parameters_and_alarms_in')
	: i18n.t('plugins.WorkshopRS485.device.data_parameters_and_alarms_of_this'))
const doesText = computed(() => does(props.live && props.live.seen_does_s))
const est = computed(() => states[(props.live && props.live.state) || 'unknown'] || states.unknown)
const nameProfile = computed(() => {
	const p = props.profiles.find(x => x.id === props.cfg.profile)
	return p ? p.name : props.cfg.profile
})
// reading counter: last_ok is no use, DSF rounds the epochs
const mark = computed(() => props.live && props.live.readings)
const isNotice = computed(() => !props.cfg.axis && !!props.live && ['alarm', 'without_communication'].includes(props.live.state))
const colorCab = computed(() => {
	if (isNotice.value) {
		return 'notice'
	}
	return (props.live && props.live.state) || 'unknown'
})
const doesS = computed(() => lastReading.value ? Math.max(0, Math.round((now.value - lastReading.value) / 1000)) : null)
const textReading = computed(() => {
	if (doesS.value == null) {
		return i18n.t('plugins.WorkshopRS485.device.waiting_for_the_first_reading')
	}
	return doesS.value <= 1 ? i18n.t('plugins.WorkshopRS485.device.reading_live') : i18n.t('plugins.WorkshopRS485.device.last_reading_s_ago', { s: doesS.value })
})
const textAction = computed(() => {
	const a = op.value.action_fault || 'pause'
	if (a === 'nothing') {
		return i18n.t('plugins.WorkshopRS485.device.only_shows')
	}
	return !props.cfg.axis || a === 'notify' ? i18n.t('plugins.WorkshopRS485.common.only_warns') : i18n.t('plugins.WorkshopRS485.common.pauses_and_warns')
})
const functionsExplore = computed(() => [
	{ value: 3, text: i18n.t('plugins.WorkshopRS485.common.holding_function_3') },
	{ value: 4, text: i18n.t('plugins.WorkshopRS485.common.input_function_4') },
	{ value: 'both', text: i18n.t('plugins.WorkshopRS485.device.both_types') }
])
const expPct = computed(() => expState.value.total ? Math.round((100 * expState.value.done) / expState.value.total) : 0)
const nameIdent = computed(() => {
	const i = ident.value || {}
	return [i.manufacturer, i.model].filter(Boolean).join(' ').slice(0, 30) || props.cfg.name
})
const alarmInfo = computed(() => {
	const c = v.value.alarm
	return c && table.value ? (table.value.alarms || []).find(a => a.code === c) || null : null
})

watch(mark, (t, old) => {
	if (!t || t === old) {
		return
	}
	const ahora = Date.now()
	lastReading.value = ahora
	if (props.cfg.profile !== 't3d') {
		return
	}
	histTorque.value.push({ t: ahora, y: v.value.torque })
	histCurrent.value.push({ t: ahora, y: v.value.current })
	if (histTorque.value.length > HIST) {
		histTorque.value.splice(0, histTorque.value.length - HIST)
		histCurrent.value.splice(0, histCurrent.value.length - HIST)
	}
})

onMounted(async () => {
	clock = setInterval(() => { now.value = Date.now() }, 1000)
	if (props.cfg.profile !== 't3d') {
		return
	}
	try {
		table.value = await info(props.cfg.id)
	} catch (e) {
		tableError.value = i18n.t('plugins.WorkshopRS485.device.could_not_load_the_servo_table') + (e.message || e)
	}
})
onBeforeUnmount(() => {
	clearTimeout(armedTimer)
	clearInterval(clock)
	clearTimeout(expTimer)
})

function arm(that, fn) {
	if (armed.value === that) {
		armed.value = null
		fn()
		return
	}
	armed.value = that
	clearTimeout(armedTimer)
	armedTimer = setTimeout(() => { armed.value = null }, 4000)
}
function fold(si) {
	collapsed.value = si
	try {
		const l = readCollapsed().filter(x => x !== props.cfg.id)
		if (si) {
			l.push(props.cfg.id)
		}
		localStorage.setItem(FOLDED, JSON.stringify(l))
	} catch (e) {
		// without localStorage: it stays only on this screen
	}
}
function open(s) {
	fold(false)
	section.value = s
}
// points of a mini chart (last 60 values) in a 100x20 viewBox
function line(hist) {
	const h = hist.slice(-60)
	const ys = h.map(p => Number(p.y) || 0)
	const min = Math.min(...ys)
	const span = (Math.max(...ys) - min) || 1
	return h.map((p, i) => `${(i / Math.max(1, h.length - 1) * 100).toFixed(1)},${(18 - ((Number(p.y) || 0) - min) / span * 16).toFixed(1)}`).join(' ')
}
function outsideOfSpan(r) {
	const n = Number(v.value[r.name || `reg ${r.record}`])
	if (Number.isNaN(n)) {
		return false
	}
	return (r.min !== '' && r.min != null && n < Number(r.min)) || (r.max !== '' && r.max != null && n > Number(r.max))
}
function valueFor(r) {
	const n = v.value[r.name || `reg ${r.record}`]
	return n == null ? '--' : n
}
async function run(that, fn) {
	busy.value = that
	result.value = null
	try {
		result.value = await fn()
		resultError.value = false
	} catch (e) {
		result.value = e.message || String(e)
		resultError.value = true
	} finally {
		busy.value = null
	}
}
function deleteAlarm() {
	return run('alarm', async () => {
		const r = await action(props.cfg.id, 'clear_alarm')
		return r.deleted ? i18n.t('plugins.WorkshopRS485.device.alarm_cleared') : i18n.t('plugins.WorkshopRS485.device.alarm_still_active', { n: r.alarm })
	})
}
async function exportProfile() {
	busy.value = 'export'
	try {
		const p = await action(props.cfg.id, 'export_profile')
		const e = p.device || {}
		const nombre = ([e.mark, e.model].filter(Boolean).join('-') || props.cfg.name || props.cfg.id).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
		const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2) + '\n'], { type: 'application/json' }))
		const a = document.createElement('a')
		a.href = url
		a.download = (nombre || 'device') + '.rs485.json'
		document.body.appendChild(a)
		a.click()
		a.remove()
		setTimeout(() => URL.revokeObjectURL(url), 2000)
	} catch (err) {
		result.value = i18n.t('plugins.WorkshopRS485.device.could_not_export', { error: err.message })
		resultError.value = true
	} finally {
		busy.value = null
	}
}
function identify() {
	return run('identify', async () => {
		const r = await action(props.cfg.id, 'identify')
		ident.value = r.identification || null
		identNo.value = !ident.value
		return null
	})
}
function alreadyWatched(x) {
	return regs.value.some(r => Number(r.record) === x.record && Number(r.func || 3) === x.func)
}
async function explore() {
	busy.value = 'explore'
	result.value = null
	try {
		expList.value = []
		expState.value = await action(props.cfg.id, 'explore', { since: exp.value.since, until: exp.value.until, func: exp.value.func })
		followExploring()
	} catch (e) {
		result.value = e.message || String(e)
		resultError.value = true
	} finally {
		busy.value = null
	}
}
// asks every second; the Pi returns only the newly found ones
async function followExploring() {
	clearTimeout(expTimer)
	try {
		const r = await action(props.cfg.id, 'explore_status', { since_n: expList.value.length })
		expList.value = expList.value.concat(r.found || [])
		expState.value = r
	} catch (e) {
		expState.value = { ...expState.value, error: e.message || String(e) }
	}
	if (expState.value.active) {
		expTimer = setTimeout(() => followExploring(), 1000)
	}
}
async function exploreCancel() {
	try {
		await action(props.cfg.id, 'explore_cancel')
	} catch (e) {
		/* the next query shows the state */
	}
}
function readManual() {
	return run('read', async () => {
		const r = await action(props.cfg.id, 'read_register', { record: manual.value.record, func: manual.value.func })
		return i18n.t('plugins.WorkshopRS485.device.register_value', { n: r.record, v: r.values.join(', ') })
	})
}
function writeManual() {
	return run('write', async () => {
		const r = await action(props.cfg.id, 'write_register', { record: manual.value.record, value: manual.value.value })
		return r.verified ? i18n.t('plugins.WorkshopRS485.device.register_value_verified', { n: r.record, v: r.value }) : i18n.t('plugins.WorkshopRS485.device.written_but_reads', { v: r.value })
	})
}
</script>

<style scoped>
.cab {
	display: flex;
	align-items: center;
	gap: 12px;
}
.cab-icon {
	width: 40px;
	height: 40px;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 auto;
	background: #757575;
}
.background-ok {
	background: #43a047;
}
.background-alarm {
	background: #e53935;
}
.background-without_communication {
	background: #fb8c00;
}
.background-notice {
	background: #1976d2;
}
.cab-text {
	flex: 1;
	min-width: 0;
}
.cab-name {
	line-height: 1.3;
}
.cab-buttons {
	display: flex;
	align-items: center;
	flex: 0 0 auto;
}
.alarm-box {
	border-radius: 8px;
	padding: 10px 12px;
	background: rgba(128, 128, 128, 0.1);
	border: 1px solid rgba(239, 83, 80, 0.45);
}
.alarm-box.notice {
	background: rgba(128, 128, 128, 0.1);
	border-color: rgba(30, 136, 229, 0.45);
}
.alarm-solution {
	color: var(--tp-blue-bright, #90caf9);
}
.steps-alarm > div {
	display: grid;
	grid-template-columns: 120px 1fr;
	gap: 8px;
	padding: 3px 0;
	font-size: 0.875rem;
}
.steps-alarm .et {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
	padding-top: 1px;
}
@media (max-width: 600px) {
	.steps-alarm > div {
		grid-template-columns: 1fr;
		gap: 0;
	}
	.cab {
		flex-wrap: wrap;
	}
}
.sections {
	border-bottom: 1px solid rgba(128, 128, 128, 0.25);
}
/* the state of a device is the dot and the word of its chip, not a colored edge of the card (family.css); the edge- classes stay as hooks */
.disp-card,
.edge-ok,
.edge-alarm,
.edge-without_communication,
.disp-card.notice {
	border-left-width: 1px !important;
}
.tiles {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
	gap: 8px;
}
.tile {
	background: rgba(128, 128, 128, 0.09);
	border-radius: 8px;
	padding: 8px 10px;
}
.tile-alarm {
	background: rgba(128, 128, 128, 0.1);
}
.tile-label {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
}
.tile-value {
	font-size: 22px;
	font-weight: 500;
	font-variant-numeric: tabular-nums;
}
.tile-value small {
	font-size: 12px;
	color: var(--tp-faint, #9e9e9e);
}
.tile-value-small {
	font-size: 16px;
	padding: 3px 0;
}
.tile-sub {
	font-size: 11px;
	color: var(--tp-faint, #9e9e9e);
	margin-top: 2px;
}
.mini {
	display: block;
	width: 100%;
	height: 18px;
	margin-top: 2px;
}
.exp-table {
	max-height: 320px;
	overflow-y: auto;
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
