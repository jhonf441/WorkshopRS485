<template>
	<div>
		<div class="text-body-small dim mb-3">
			{{ $t('plugins.WorkshopRS485.diagnosis.checks_each_bus_step_by_step') }}
		</div>

		<!-- ===== un bloque por bus ===== -->
		<v-sheet v-for="b in buses" :key="b.id" variant="outlined" rounded class="pa-3 mb-3">
			<div class="d-flex align-center flex-wrap" style="gap:8px">
				<v-icon :color="colorOf(liveSummary(b).code)">{{ b.kind === 'duet' ? 'mdi-expansion-card' : 'mdi-usb' }}</v-icon>
				<span class="text-title-medium font-weight-medium">{{ b.name || b.id }}</span>
				<v-chip size="x-small" variant="outlined" :color="colorOf(liveSummary(b).code)">{{ VERDICTS[liveSummary(b).code].short }}</v-chip>
				<v-spacer />
				<v-btn size="small" variant="outlined" color="primary" :loading="busy === b.id" :disabled="!!busy || !can('rs485.diagnose')" @click="diagnose(b.id)">
					<v-icon size="small" start>mdi-stethoscope</v-icon>{{ $t('plugins.WorkshopRS485.common.diagnose') }}
				</v-btn>
			</div>
			<div v-if="busy === b.id" class="text-body-small mt-2">{{ $t('plugins.WorkshopRS485.diagnosis.checking_the_adapter_and_asking_each') }}</div>

			<template v-if="results[b.id]">
				<template v-for="r in [results[b.id]]" :key="r.ts">
					<v-alert density="compact" variant="tonal" :type="VERDICTS[r.verdict].kind" class="mt-3 mb-2">
						<div class="font-weight-medium">{{ VERDICTS[r.verdict].title }}</div>
						<div class="text-body-medium">{{ VERDICTS[r.verdict].perform }}</div>
						<div v-if="r.verdict === 'without_permission'" class="command mt-1"><code>sudo usermod -aG dialout dsf &amp;&amp; sudo systemctl restart duetpluginservice</code></div>
					</v-alert>

					<div class="steps">
						<!-- 1. adaptador -->
						<div v-if="r.kind !== 'duet'" class="step">
							<v-icon size="small" :color="r.adapter.connected ? 'success' : 'error'">{{ r.adapter.connected ? 'mdi-check-circle' : 'mdi-close-circle' }}</v-icon>
							<div class="step-text">
								<div class="text-body-medium">
									<span>{{ $t('plugins.WorkshopRS485.diagnosis.adapter') }}</span>
									<span v-if="r.adapter.connected">{{ $t('plugins.WorkshopRS485.common.connected') }}</span>
									<span v-else>{{ $t('plugins.WorkshopRS485.diagnosis.not_found') }}</span>
									<code class="ml-1">{{ r.port || '--' }}</code>
								</div>
								<div v-if="r.adapter.connected && (r.adapter.chip || r.adapter.vid || r.adapter.driver)" class="text-body-small dim">
									<template v-if="r.adapter.chip">{{ r.adapter.chip }} &middot; </template>
									<template v-if="r.adapter.vid">VID:PID {{ r.adapter.vid }}:{{ r.adapter.pid }} &middot; </template>
									<template v-if="r.adapter.driver"><span>{{ $t('plugins.WorkshopRS485.common.driver') }}</span> {{ r.adapter.driver }}</template>
									<template v-if="r.adapter.producto"> &middot; {{ r.adapter.manufacturer }} {{ r.adapter.producto }}</template>
								</div>
								<div v-if="!r.adapter.connected && r.others_adapters.length" class="text-body-small">
									<span>{{ $t('plugins.WorkshopRS485.diagnosis.another_adapter_is_connected') }}</span>
									<code v-for="o in r.others_adapters" :key="o.path" class="ml-1">{{ o.name }}</code>.
									<span>{{ $t('plugins.WorkshopRS485.diagnosis.if_it_is_the_same_one') }}</span>
								</div>
							</div>
						</div>
						<!-- 2. puerto -->
						<div class="step">
							<v-icon size="small" :color="r.opens ? 'success' : 'error'">{{ r.opens ? 'mdi-check-circle' : 'mdi-close-circle' }}</v-icon>
							<div class="step-text">
								<div class="text-body-medium">
									<template v-if="r.kind === 'duet'">
										<span v-if="r.opens">{{ $t('plugins.WorkshopRS485.diagnosis.the_duet_accepted_the_port_setup') }}</span>
										<span v-else>{{ $t('plugins.WorkshopRS485.diagnosis.the_duet_did_not_accept_the') }}</span>
									</template>
									<span v-else-if="r.opens">{{ $t('plugins.WorkshopRS485.diagnosis.the_port_opens') }}</span>
									<span v-else>{{ $t('plugins.WorkshopRS485.diagnosis.the_port_does_not_open') }}</span>
									<span class="dim"> &middot; {{ r.baud }} {{ r.format }}</span>
								</div>
								<div v-if="!r.opens && r.error" class="text-body-small dim">{{ r.error }}</div>
							</div>
						</div>
						<!-- 3. trafico -->
						<div v-if="r.opens && r.kind !== 'duet'" class="step">
							<v-icon size="small" :color="r.noise_bytes ? 'warning' : 'success'">{{ r.noise_bytes ? 'mdi-alert-circle' : 'mdi-check-circle' }}</v-icon>
							<div class="step-text">
								<div v-if="!r.noise_bytes" class="text-body-medium">{{ $t('plugins.WorkshopRS485.diagnosis.cable_is_quiet_nobody_else_is') }}</div>
								<template v-else>
									<div class="text-body-medium"><span>{{ $t('plugins.WorkshopRS485.diagnosis.data_arrives_without_asking') }}</span> {{ r.noise_bytes }} <span>{{ $t('plugins.WorkshopRS485.diagnosis.bytes_in_0_3_s') }}</span></div>
									<div class="text-body-small dim">{{ $t('plugins.WorkshopRS485.diagnosis.it_may_be_another_program_or') }}</div>
								</template>
							</div>
						</div>
						<!-- 4. equipos -->
						<div v-if="r.opens" class="step">
							<v-icon size="small" :color="colorMachines(r)">{{ colorMachines(r) === 'success' ? 'mdi-check-circle' : 'mdi-lan-disconnect' }}</v-icon>
							<div class="step-text">
								<div class="text-body-medium">{{ $t('plugins.WorkshopRS485.diagnosis.configured_devices') }}</div>
								<div v-if="!r.devices.length" class="text-body-small dim">{{ $t('plugins.WorkshopRS485.diagnosis.none_on_this_bus') }}</div>
								<div v-for="d in r.devices" :key="d.id" class="device">
									<span class="text-body-medium"><b>{{ d.name }}</b> <span class="dim">&middot; {{ $t('plugins.WorkshopRS485.diagnosis.address_short', { n: d.address }) }}</span></span>
									<v-chip v-if="!d.active" size="x-small" variant="outlined">{{ $t('plugins.WorkshopRS485.diagnosis.disabled') }}</v-chip>
									<v-chip v-else-if="d.answers" size="x-small" variant="outlined" color="success">{{ $t('plugins.WorkshopRS485.diagnosis.answers') }}</v-chip>
									<v-chip v-else-if="d.absent" size="x-small" variant="outlined">{{ $t('plugins.WorkshopRS485.diagnosis.absent_on_purpose') }}</v-chip>
									<v-chip v-else size="x-small" variant="outlined" color="warning">{{ $t('plugins.WorkshopRS485.common.not_responding') }}</v-chip>
									<span v-if="!d.answers && d.active && !d.absent" class="text-body-small dim">
										<template v-if="d.seen_does_s != null"><span>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.it_did_before') }}</span> {{ does(d.seen_does_s).n }} <span>{{ does(d.seen_does_s).u }}</span>)</template>
										<span v-else>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.never_answered') }}</span>
									</span>
									<span v-if="d.answers && d.absent" class="text-body-small text-info">{{ $t('plugins.WorkshopRS485.diagnosis.it_answers_now_you_can_watch') }}</span>
									<v-spacer />
									<v-btn v-if="d.active && !d.absent && !d.answers" size="x-small" variant="text" @click="$emit('absent', d.id, true)" :title="$t('plugins.WorkshopRS485.common.if_it_is_not_connected_on')">
										<v-icon size="x-small" start>mdi-eye-off-outline</v-icon>{{ $t('plugins.WorkshopRS485.diagnosis.mark_absent') }}
									</v-btn>
									<v-btn v-if="d.absent" size="x-small" variant="text" color="primary" @click="$emit('absent', d.id, false)">
										<v-icon size="x-small" start>mdi-eye-outline</v-icon>{{ $t('plugins.WorkshopRS485.common.watch_again') }}
									</v-btn>
								</div>
							</div>
						</div>
						<div class="text-body-small dim mt-1">
							<span>{{ $t('plugins.WorkshopRS485.diagnosis.since_the_service_started') }}</span> <span>{{ $t('plugins.WorkshopRS485.diagnosis.good_answers') }}</span> {{ r.stats.ok || 0 }} &middot; <span>{{ $t('plugins.WorkshopRS485.common.no_response') }}</span> {{ r.stats.without_response || 0 }} &middot; CRC {{ r.stats.crc || 0 }}
							<template v-if="r.response_does_s != null"> &middot; <span>{{ $t('plugins.WorkshopRS485.diagnosis.last_answer') }}</span> {{ does(r.response_does_s).n }} <span>{{ does(r.response_does_s).u }}</span></template>
						</div>
					</div>
				</template>
			</template>
		</v-sheet>
		<div v-if="!buses.length" class="text-body-medium dim mb-3">{{ $t('plugins.WorkshopRS485.diagnosis.no_buses_yet_create_one_in') }}</div>
		<div v-if="error" class="text-body-small text-error mb-3">{{ error }}</div>

		<!-- ===== barrido ===== -->
		<v-sheet variant="outlined" rounded class="pa-3">
			<div class="d-flex align-center flex-wrap" style="gap:8px">
				<v-icon color="primary">mdi-radar</v-icon>
				<span class="text-title-medium font-weight-medium">{{ $t('plugins.WorkshopRS485.diagnosis.search_all_addresses') }}</span>
			</div>
			<div class="text-body-small dim mt-1 mb-2">
				{{ $t('plugins.WorkshopRS485.diagnosis.asks_address_by_address_whether_anyone') }}
			</div>
			<v-row density="compact">
				<v-col cols="12" sm="4">
					<v-select v-model="where" :items="optionsWhere" :label="$t('plugins.WorkshopRS485.diagnosis.where')" density="compact" variant="outlined" hide-details :disabled="sweep.active" />
				</v-col>
				<v-col cols="6" sm="4">
					<v-select v-model="baud" :items="optionsBaud" :label="$t('plugins.WorkshopRS485.common.speed')" density="compact" variant="outlined" hide-details :disabled="sweep.active || isDuet" />
				</v-col>
				<v-col cols="6" sm="4">
					<v-select v-model="parity" :items="optionsParity" :label="$t('plugins.WorkshopRS485.common.format')" density="compact" variant="outlined" hide-details :disabled="sweep.active || isDuet" />
				</v-col>
				<v-col cols="4" sm="2"><v-text-field v-model.number="since" type="number" min="1" max="247" :label="$t('plugins.WorkshopRS485.common.from')" density="compact" variant="outlined" hide-details :disabled="sweep.active" /></v-col>
				<v-col cols="4" sm="2"><v-text-field v-model.number="until" type="number" min="1" max="247" :label="$t('plugins.WorkshopRS485.common.to')" density="compact" variant="outlined" hide-details :disabled="sweep.active" /></v-col>
				<v-col cols="4" sm="3"><v-text-field v-model.number="timeoutMs" type="number" min="30" max="2000" :label="$t('plugins.WorkshopRS485.diagnosis.wait_ms')" density="compact" variant="outlined" hide-details :disabled="sweep.active" /></v-col>
				<v-col cols="12" sm="5" class="d-flex align-center" style="gap:8px">
					<v-btn v-if="!sweep.active" size="small" color="primary" :disabled="!where || !!sending || !can('rs485.sweep')" :loading="sending" @click="start()">
						<v-icon size="small" start>mdi-magnify-scan</v-icon>{{ $t('plugins.WorkshopRS485.diagnosis.find') }}
					</v-btn>
					<v-btn v-else size="small" variant="text" @click="cancel()">{{ $t('plugins.WorkshopRS485.common.cancel') }}</v-btn>
					<span class="text-body-small dim"><span>{{ $t('plugins.WorkshopRS485.diagnosis.takes_up_to') }}</span> {{ estimated }}</span>
				</v-col>
			</v-row>
			<div v-if="isDuet" class="text-body-small dim mt-1">{{ $t('plugins.WorkshopRS485.diagnosis.on_the_duet_s_rs485_the') }}</div>

			<template v-if="sweep.total">
				<div class="text-body-small mt-3">
					<template v-if="sweep.active"><span>{{ $t('plugins.WorkshopRS485.diagnosis.searching') }}</span> {{ textOf(sweep, 'text') }} &middot; </template>
					<template v-else-if="sweep.cancelled"><span>{{ $t('plugins.WorkshopRS485.diagnosis.cancelled') }}</span> &middot; </template>
					<template v-else><span>{{ $t('plugins.WorkshopRS485.diagnosis.finished') }}</span> &middot; </template>
					{{ $t('plugins.WorkshopRS485.diagnosis.n_of_total', { n: sweep.done, total: sweep.total }) }}
				</div>
				<v-progress-linear :model-value="sweep.total ? sweep.done / sweep.total * 100 : 0" height="4" rounded class="mt-1" />
				<div v-if="sweep.error" class="text-body-small text-error mt-1">{{ textOf(sweep, 'error') }}</div>
				<div v-if="!sweep.active && !(sweep.found || []).length && !sweep.error" class="text-body-small text-warning mt-2">
					{{ $t('plugins.WorkshopRS485.diagnosis.no_address_answered_check_that_the') }}
				</div>
				<div v-if="(sweep.found || []).length" class="d-flex align-center flex-wrap mt-2" style="gap:6px">
					<span class="text-body-small">{{ $t('plugins.WorkshopRS485.common.answering') }}</span>
					<template v-for="e in sweep.found" :key="key(e)">
						<v-chip v-if="e.configured" size="x-small" variant="outlined" color="success">{{ e.address }} &middot; {{ e.baud }} 8{{ e.parity }}1 &middot; {{ nameDisp(e.configured) }}</v-chip>
						<v-chip v-else-if="sweep.bus && sameFormat(e)" size="x-small" color="primary" variant="flat" @click="$emit('add', sweep.bus, e.address)">
							<v-icon size="x-small" start>mdi-plus</v-icon>{{ e.address }} &middot; {{ e.baud }} 8{{ e.parity }}1 &middot; <span>{{ $t('plugins.WorkshopRS485.diagnosis.add') }}</span>
						</v-chip>
						<v-chip v-else size="x-small" variant="outlined" color="warning" :title="sweep.bus ? $t('plugins.WorkshopRS485.diagnosis.it_answers_with_a_different_format') : $t('plugins.WorkshopRS485.diagnosis.create_a_bus_with_this_adapter')">
							{{ e.address }} &middot; {{ e.baud }} 8{{ e.parity }}1
						</v-chip>
					</template>
				</div>
			</template>
		</v-sheet>
	</div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { i18n } from './dwc-host.js'
import { callService, BAUDS_T3D, does, textOf, useCan } from './api.js'
import { verdicts as VERDICTS, summaryLive } from './diagnosis-verdicts.js'

const colors = { success: 'success', warning: 'warning', error: 'error', info: 'grey' }

const props = defineProps({
	cfg: Object,
	state: Object,
	ports: Object
})
defineEmits(['absent', 'add'])

const { can } = useCan()
const results = reactive({})
const busy = ref(null)
const error = ref(null)
const sending = ref(false)
const where = ref(null)
const baud = ref(0)
const parity = ref('*')
const since = ref(1)
const until = ref(32)
const timeoutMs = ref(150)

const buses = computed(() => props.cfg.buses || [])
const sweep = computed(() => props.state.sweep || { active: false })
const free = computed(() => {
	const used = buses.value.filter(b => (b.kind || 'usb') === 'usb').map(b => b.port)
	return (props.ports.ports || []).filter(p => !used.includes(p.path) && !used.includes(p.real))
})
const optionsWhere = computed(() => [
	...buses.value.map(b => ({ text: b.name || b.id, value: 'bus:' + b.id })),
	...free.value.map(p => ({ text: p.name + (p.chip ? ' (' + p.chip + ')' : ''), value: 'port:' + p.path }))
])
const optionsBaud = computed(() => [{ text: i18n.t('plugins.WorkshopRS485.diagnosis.all'), value: 0 }, ...BAUDS_T3D.map(b => ({ text: String(b), value: b }))])
const optionsParity = computed(() => [{ text: i18n.t('plugins.WorkshopRS485.common.all'), value: '*' }, { text: i18n.t('plugins.WorkshopRS485.common.8n1_none'), value: 'N' }, { text: i18n.t('plugins.WorkshopRS485.common.8e1_even'), value: 'E' }, { text: i18n.t('plugins.WorkshopRS485.common.8o1_odd'), value: 'O' }])
const busChosen = computed(() => where.value && where.value.startsWith('bus:') ? buses.value.find(b => 'bus:' + b.id === where.value) : null)
const isDuet = computed(() => !!busChosen.value && busChosen.value.kind === 'duet')
const estimated = computed(() => {
	const n = Math.max(0, (Number(until.value) || 0) - (Number(since.value) || 0) + 1)
	const combos = isDuet.value ? 1 : (baud.value ? 1 : BAUDS_T3D.length) * (parity.value === '*' ? 3 : 1)
	// without a response each address waits for the timeout (+ ~20 ms of the frame and the pause)
	const s = Math.round(n * combos * ((Number(timeoutMs.value) || 150) + 20) / 1000)
	const h = does(s)
	return h.n + ' ' + h.u
})

watch(optionsWhere, l => {
	if (!l.some(o => o.value === where.value)) {
		where.value = l.length ? l[0].value : null
	}
}, { immediate: true })

function colorOf(code) {
	return colors[(VERDICTS[code] || VERDICTS.unknown).kind] || 'grey'
}
function liveSummary(b) {
	const r = summaryLive(b, (props.state.buses || []).find(x => x.id === b.id), props.cfg.devices || [], props.state.devices || [])
	if (!VERDICTS[r.code]) {
		r.code = 'unknown'
	}
	return r
}
function colorMachines(r) {
	const vig = r.devices.filter(d => d.active && !d.absent)
	if (!vig.length || vig.every(d => d.answers)) {
		return 'success'
	}
	return 'warning'
}
async function diagnose(busId) {
	busy.value = busId
	error.value = null
	try {
		const r = await callService({ P: 'diagnose', B: busId })
		for (const d of r.diagnostics || []) {
			results[d.bus] = d
		}
	} catch (e) {
		error.value = i18n.t('plugins.WorkshopRS485.diagnosis.could_not_diagnose') + (e.message || e)
	} finally {
		busy.value = null
	}
}
async function start() {
	sending.value = true
	error.value = null
	const p = { baud: baud.value, parity: parity.value, since: since.value, until: until.value, timeout_ms: timeoutMs.value }
	if (where.value.startsWith('bus:')) {
		p.bus = where.value.slice(4)
	} else {
		p.port = where.value.slice(7)
	}
	try {
		await callService({ P: 'sweep', J: p })
	} catch (e) {
		error.value = i18n.t('plugins.WorkshopRS485.common.could_not_search') + (e.message || e)
	} finally {
		sending.value = false
	}
}
async function cancel() {
	try {
		await callService({ P: 'sweep_cancel' })
	} catch (e) {
		error.value = i18n.t('plugins.WorkshopRS485.diagnosis.could_not_cancel') + (e.message || e)
	}
}
function key(e) {
	return e.address + '-' + e.baud + e.parity
}
function sameFormat(e) {
	const b = buses.value.find(x => x.id === sweep.value.bus)
	return !!b && Number(b.baud) === Number(e.baud) && String(b.parity || 'N') === e.parity
}
function nameDisp(id) {
	const d = (props.cfg.devices || []).find(x => x.id === id)
	return d ? (d.name || d.id) : id
}
</script>

<style scoped>
.dim {
	color: var(--tp-faint);
}
.steps .step {
	display: flex;
	align-items: flex-start;
	gap: 8px;
	padding: 4px 0;
}
.step-text {
	flex: 1;
	min-width: 0;
}
.device {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 6px;
	min-height: 32px;
}
.command code {
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
}
</style>
