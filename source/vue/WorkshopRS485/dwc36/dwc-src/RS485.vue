<template>
	<v-container :style="{ '--wf-sec': secColor }" fluid class="pa-0 rs485-page workshop-theme">
		<page-header :lead="$t('plugins.WorkshopRS485.rS485.lead')" icon="mdi-serial-port" :title="$t('plugins.WorkshopRS485.rS485.rs485_devices')" :reasons="headerReasons">
			<v-chip v-for="b in state.buses" :key="b.id" small outlined :color="b.open ? 'success' : (b.error && b.error_kind !== 'without_port' ? 'warning' : 'grey')">
				<v-icon x-small left>mdi-serial-port</v-icon>{{ b.name }}:
				<span class="ml-1">{{ b.open ? $t('plugins.WorkshopRS485.common.connected') : (b.error_kind === 'no_found' ? $t('plugins.WorkshopRS485.common.adapter_not_found') : (b.error_kind === 'without_port' ? $t('plugins.WorkshopRS485.rS485.not_configured') : b.error ? $t('plugins.WorkshopRS485.rS485.with_a_problem') : $t('plugins.WorkshopRS485.rS485.closed'))) }}</span>
			</v-chip>
			<template v-slot:right>
				<v-btn small text @click="load()"><v-icon small left>mdi-refresh</v-icon>{{ $t('plugins.WorkshopRS485.common.refresh') }}</v-btn>
			</template>
			<template v-slot:startup>
				<startup-panel v-if="read" plugin="WorkshopRS485" :defs="rowsStartup" :service-row="false" @action="onActionStartup">
					<v-btn x-small text color="primary" class="mt-1" @click="tab = 2">{{ $t('plugins.WorkshopRS485.rS485.see_the_steps') }}</v-btn>
				</startup-panel>
			</template>
		</page-header>
		<v-alert v-if="backendDown" dense text type="warning" class="mb-3">
			{{ $t('plugins.WorkshopRS485.rS485.the_plugin_service_isn_t_responding') }}
		</v-alert>
		<v-card class="mb-3">
			<v-card-text>
				<div class="st-layout">
				<side-tabs v-model="tab" :items="tabItems" />
				<div class="st-body">
				<v-tabs-items v-model="tab" class="transparent">
					<!-- ===== Dispositivos ===== -->
					<v-tab-item>
						<!-- bus with a problem, in plain language (with what the plugin publishes, without asking anything) -->
						<v-alert v-for="p in problemsBus" :key="'pb-' + p.bus.id" dense text :type="VERDICTS[p.code].kind" class="mb-3">
							<div class="text-body-2"><b>{{ p.bus.name || p.bus.id }}:</b> <span>{{ VERDICTS[p.code].title }}</span></div>
							<div v-for="d in p.silent" :key="d.id" class="text-caption">
								<b>{{ d.name || d.id }}</b> <span>{{ $t('plugins.WorkshopRS485.common.not_responding') }}</span>
								<template v-if="d.seen_does_s != null"><span>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.it_did_before') }}</span> {{ does(d.seen_does_s).n }} <span>{{ does(d.seen_does_s).u }}</span>)</template>
								<span v-else>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.never_answered') }}</span>
							</div>
							<div class="d-flex align-center flex-wrap mt-1" style="gap:8px">
								<v-btn x-small outlined color="primary" @click="tab = 3"><v-icon x-small left>mdi-stethoscope</v-icon>{{ $t('plugins.WorkshopRS485.common.diagnose') }}</v-btn>
								<v-btn v-if="p.silent.length" x-small text :loading="saving" :title="$t('plugins.WorkshopRS485.rS485.if_they_are_not_connected_on')" @click="markAbsent(p.silent.map(d => d.id), true)">
									<v-icon x-small left>mdi-eye-off-outline</v-icon>{{ p.silent.length === 1 ? $t('plugins.WorkshopRS485.common.mark_as_absent') : $t('plugins.WorkshopRS485.rS485.mark_all_as_absent') }}
								</v-btn>
							</div>
						</v-alert>
						<v-alert v-if="detected.length" dense text type="info" icon="mdi-radar" class="mb-3">
							<div class="d-flex align-center flex-wrap" style="gap:8px">
								<span>{{ detected.length === 1 ? $t('plugins.WorkshopRS485.rS485.one_new_device') : $t('plugins.WorkshopRS485.rS485.n_new_devices', { n: detected.length }) }}</span>
								<v-btn x-small outlined color="primary" @click="tab = 1">{{ $t('plugins.WorkshopRS485.rS485.see_and_add') }}</v-btn>
							</div>
						</v-alert>
						<div v-if="!cfg.devices.length" class="text-body-2 grey--text mb-3">
							{{ $t('plugins.WorkshopRS485.rS485.no_devices_yet_add_the_first') }}
						</div>
						<dispositivo
							v-for="d in cfg.devices" :key="d.id"
							:cfg="d" :live="liveOf(d.id)" :profiles="profiles"
							@edit="edit(d)"
							@watch="watchRecord(d, $event)" @rename="renameDisp(d, $event)"
							@absent="markAbsent([d.id], $event)"
							class="mb-3"
						/>
						<v-btn color="primary" small :disabled="!cfg.buses.length || !can('rs485.save')" @click="newItem()"><v-icon small left>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.common.add_device') }}</v-btn>
						<v-btn class="ml-2" small outlined color="primary" :disabled="!cfg.buses.length || !can('rs485.save')" :title="$t('plugins.WorkshopRS485.rS485.json_profile_hint')" @click="newItem(undefined, undefined, 'generic')"><v-icon small left>mdi-file-import-outline</v-icon>{{ $t('plugins.WorkshopRS485.rS485.add_from_json_profile') }}</v-btn>
						<span v-if="!cfg.buses.length" class="text-caption grey--text ml-2">{{ $t('plugins.WorkshopRS485.rS485.first_create_a_bus_in_buses') }}</span>
					</v-tab-item>

					<!-- ===== Buses y adaptadores ===== -->
					<v-tab-item>
						<!-- deteccion automatica -->
						<v-sheet outlined rounded class="pa-3 mb-4 detection">
							<div class="d-flex align-center flex-wrap" style="gap:8px">
								<v-icon :color="det.auto ? 'primary' : 'grey'">mdi-radar</v-icon>
								<span class="text-subtitle-1 font-weight-medium">{{ $t('plugins.WorkshopRS485.rS485.automatic_detection') }}</span>
								<v-spacer />
								<v-btn small outlined color="primary" :loading="detecting.active" :disabled="detecting.active || !can('rs485.detect')" @click="detect()">
									<v-icon small left>mdi-magnify-scan</v-icon>{{ $t('plugins.WorkshopRS485.rS485.search_everything_now') }}
								</v-btn>
							</div>
							<div class="d-flex flex-wrap mt-1" style="gap:0 24px">
								<v-switch :input-value="det.auto" dense hide-details class="mt-1" :label="$t('plugins.WorkshopRS485.rS485.search_for_new_devices_automatically')" @change="saveDetection({ auto: $event })" />
								<v-switch :input-value="det.add" :disabled="!det.auto" dense hide-details class="mt-1" :label="$t('plugins.WorkshopRS485.rS485.add_them_automatically_no_axis_they')" @change="saveDetection({ add: $event })" />
							</div>
							<div class="text-caption grey--text mt-2">
								{{ $t('plugins.WorkshopRS485.rS485.detection_note', { min: Math.round(det.each_s / 60) || 1, max: det.until }) }} <b>{{ $t('plugins.WorkshopRS485.common.no_axis') }}</b>{{ $t(hasActivity ? 'plugins.WorkshopRS485.rS485.its_faults_only_warn_until_you' : 'plugins.WorkshopRS485.rS485.its_faults_only_warn_until_you_no_activity') }}
							</div>
							<template v-if="detecting.active">
								<div class="text-caption mt-2">{{ textOf(detecting, 'text') }}</div>
								<v-progress-linear :value="detecting.progress * 100" height="4" rounded class="mt-1" />
							</template>
							<div v-else-if="state.detection_result" class="text-caption mt-2" :class="state.detection_result.error ? 'warning--text' : 'success--text'">
								{{ textOf(state.detection_result, 'text') }}
							</div>
							<div v-for="d in detected" :key="d.key" class="detected mt-2">
								<v-icon color="primary">{{ d.profile === 't3d' ? 'mdi-engine' : 'mdi-chip' }}</v-icon>
								<div class="flex-grow-1" style="min-width:0">
									<div class="text-body-2">
										<b>{{ d.profile === 't3d' ? $t('plugins.WorkshopRS485.rS485.t3d_servo') : $t('plugins.WorkshopRS485.rS485.modbus_device') }}</b> {{ $t('plugins.WorkshopRS485.rS485.at_address', { n: d.address }) }}
									</div>
									<div class="text-caption grey--text text-truncate">
										{{ d.bus ? (nameBus(d.bus) + ' · ') : ($t('plugins.WorkshopRS485.rS485.new_adapter_name', { name: d.port_name || d.port }) + ' · ') }}{{ d.baud }} 8{{ d.parity }}1
										<template v-if="d.detail"> &middot; {{ textOf(d, 'detail') }}</template>
									</div>
								</div>
								<v-btn x-small color="primary" outlined :disabled="!can('rs485.add_detected')" :loading="busyDet === d.key" @click="addDetected(d)"><v-icon x-small left>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.rS485.add') }}</v-btn>
								<v-btn x-small text :disabled="!can('rs485.ignore_detected')" @click="ignoreDetected(d)">{{ $t('plugins.WorkshopRS485.rS485.ignore') }}</v-btn>
							</div>
						</v-sheet>

						<!-- adapters the Pi sees -->
						<div class="section-title"><v-icon small left>mdi-usb</v-icon>{{ $t('plugins.WorkshopRS485.rS485.adapters_connected_to_the_system') }}</div>
						<v-alert v-if="ports.group_dialout === false" dense text type="warning" class="mb-2">
							{{ $t('plugins.WorkshopRS485.rS485.the_service_isn_t_allowed_to') }}
							<div class="command mt-1"><code>sudo usermod -aG dialout dsf &amp;&amp; sudo systemctl restart duetpluginservice</code></div>
						</v-alert>
						<div v-if="ports.ports === null" class="text-body-2 grey--text mb-3">{{ $t('plugins.WorkshopRS485.rS485.could_not_read_the_list_of') }}</div>
						<div v-else-if="!ports.ports.length" class="text-body-2 grey--text mb-3">
							{{ $t('plugins.WorkshopRS485.rS485.no_usb_rs485_adapter_connected_plug') }}
						</div>
						<div v-else class="adapters mb-3">
							<v-sheet v-for="p in ports.ports" :key="p.path" outlined rounded class="adapter pa-2">
								<v-icon :color="busOfPort(p) ? 'success' : 'grey'">mdi-usb-port</v-icon>
								<div class="adapter-text">
									<div class="text-body-2 text-truncate" :title="p.name">{{ p.name }}</div>
									<div class="text-caption grey--text">
										{{ p.real }}<template v-if="p.chip || p.vid"> &middot; {{ p.chip || (p.vid + ':' + p.pid) }}</template><template v-if="p.driver"> &middot; <span>{{ $t('plugins.WorkshopRS485.common.driver') }}</span> {{ p.driver }}</template>
									</div>
								</div>
								<v-chip v-if="busOfPort(p)" x-small color="success" outlined>{{ $t('plugins.WorkshopRS485.rS485.used_by_bus', { name: busOfPort(p).name }) }}</v-chip>
								<template v-else>
									<v-btn x-small outlined color="primary" :disabled="detecting.active || !can('rs485.detect')" :title="$t('plugins.WorkshopRS485.rS485.tries_every_speed_and_format')" @click="detect({ U: p.path })"><v-icon x-small left>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.rS485.detect') }}</v-btn>
									<v-btn x-small text @click="addBus(p.path)">{{ $t('plugins.WorkshopRS485.rS485.create_bus_by_hand') }}</v-btn>
								</template>
							</v-sheet>
						</div>

						<!-- buses -->
						<div class="section-title d-flex align-center">
							<span><v-icon small left>mdi-serial-port</v-icon>{{ $t('plugins.WorkshopRS485.rS485.buses') }}</span>
							<v-spacer />
							<v-btn x-small text color="primary" @click="addBus()"><v-icon x-small left>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.rS485.another_bus') }}</v-btn>
						</div>
						<div class="text-caption grey--text mb-2">
							{{ $t('plugins.WorkshopRS485.rS485.bus_note') }}
						</div>
						<div v-if="!draftBuses.length" class="text-body-2 grey--text mb-3">{{ $t('plugins.WorkshopRS485.rS485.there_are_no_buses_yet') }}</div>

						<v-card v-for="(b, i) in draftBuses" :key="b.id" outlined class="pa-3 mb-3 bus" :class="{ 'bus-changed': changed(b) }">
							<!-- cabecera: estado + resumen -->
							<div class="d-flex align-center flex-wrap" style="gap:8px">
								<v-icon :color="colorBus(b)">{{ b.kind === 'duet' ? 'mdi-expansion-card' : 'mdi-usb' }}</v-icon>
								<span class="text-subtitle-1 font-weight-medium">{{ b.name || b.id }}</span>
								<v-chip x-small :color="colorBus(b)" text-color="white">{{ textStateBus(b) }}</v-chip>
								<v-chip v-if="changed(b)" x-small outlined color="warning">{{ $t('plugins.WorkshopRS485.rS485.unsaved') }}</v-chip>
								<v-spacer />
								<span class="text-caption grey--text">{{ b.baud }} &middot; 8{{ b.parity }}{{ b.bits_stop }}</span>
							</div>
							<div v-if="busLive(b.id)" class="text-caption grey--text mt-1">
								<template v-if="busLive(b.id).error && !busLive(b.id).open"><span class="warning--text">{{ textOf(busLive(b.id), 'error') }}</span> &middot; </template>
								{{ $t('plugins.WorkshopRS485.rS485.bus_stats', { ok: busLive(b.id).stats.ok, none: busLive(b.id).stats.without_response, crc: busLive(b.id).stats.crc }) }}
							</div>

							<!-- equipos del bus -->
							<div class="d-flex align-center flex-wrap mt-2" style="gap:6px">
								<span class="text-caption">{{ $t('plugins.WorkshopRS485.rS485.devices_colon') }}</span>
								<v-chip v-for="d in machinesOf(b.id)" :key="d.id" small :color="colorState(d.id)" text-color="white" @click="edit(d)">
									<v-icon x-small left>mdi-pencil</v-icon>{{ d.name || d.id }} &middot; {{ $t('plugins.WorkshopRS485.rS485.address_short', { n: d.address }) }}
								</v-chip>
								<span v-if="!machinesOf(b.id).length" class="text-caption grey--text">{{ $t('plugins.WorkshopRS485.rS485.none') }}</span>
							</div>

							<!-- lo esencial -->
							<v-row dense class="mt-2">
								<v-col cols="12" sm="4"><v-text-field v-model.trim="b.name" :label="$t('plugins.WorkshopRS485.common.name')" dense outlined hide-details /></v-col>
								<v-col cols="12" sm="8">
									<v-btn-toggle v-model="b.kind" mandatory dense color="primary">
										<v-btn small value="usb"><v-icon small left>mdi-usb</v-icon>{{ $t('plugins.WorkshopRS485.rS485.usb_adapter') }}</v-btn>
										<v-btn small value="duet"><v-icon small left>mdi-expansion-card</v-icon>{{ $t('plugins.WorkshopRS485.rS485.duet_rs485') }}</v-btn>
									</v-btn-toggle>
								</v-col>
								<v-col cols="12" sm="6" v-if="b.kind !== 'duet'">
									<v-combobox v-model="b.port" :items="optionsPort" :return-object="false" item-text="text" item-value="path" :label="$t('plugins.WorkshopRS485.rS485.adapter_port')" dense outlined hide-details />
								</v-col>
								<v-col cols="12" sm="6" v-else>
									<v-select v-model="b.port_duet" :items="[{ text: $t('plugins.WorkshopRS485.rS485.port_1_io0'), value: 1 }, { text: $t('plugins.WorkshopRS485.rS485.port_2_io1'), value: 2 }]" :label="$t('plugins.WorkshopRS485.rS485.duet_serial_port')" dense outlined hide-details />
								</v-col>
								<v-col cols="6" sm="3"><v-select v-model="b.baud" :items="bauds" :label="$t('plugins.WorkshopRS485.common.speed')" dense outlined hide-details /></v-col>
								<v-col cols="6" sm="3"><v-select v-model="b.parity" :items="parities" :label="$t('plugins.WorkshopRS485.common.format')" dense outlined hide-details /></v-col>
							</v-row>

							<!-- buscar equipos -->
							<div class="d-flex align-center flex-wrap mt-3" style="gap:6px">
								<v-btn x-small outlined :loading="scanning === b.id" :disabled="!!scanning || changed(b) || newWithoutSave(b) || !can('rs485.scan')" @click="scan(b.id)">
									<v-icon x-small left>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.rS485.find_devices_1_32') }}
								</v-btn>
								<span v-if="changed(b) || newWithoutSave(b)" class="text-caption grey--text">{{ $t('plugins.WorkshopRS485.rS485.save_the_changes_to_search_with') }}</span>
								<template v-else-if="found[b.id]">
									<span v-if="!found[b.id].length" class="text-caption warning--text">{{ $t('plugins.WorkshopRS485.rS485.no_address_answered_check_speed_format') }}</span>
									<template v-else>
										<span class="text-caption">{{ $t('plugins.WorkshopRS485.common.answering') }}</span>
										<template v-for="a in found[b.id]">
											<v-chip v-if="deviceEn(b.id, a)" :key="a" x-small outlined color="success">{{ a }} &middot; {{ deviceEn(b.id, a).name || deviceEn(b.id, a).id }}</v-chip>
											<v-chip v-else :key="a" x-small color="primary" @click="newItem(b.id, a)"><v-icon x-small left>mdi-plus</v-icon>{{ a }} &middot; {{ $t('plugins.WorkshopRS485.rS485.add') }}</v-chip>
										</template>
									</template>
								</template>
							</div>

							<!-- avanzado -->
							<v-expansion-panels flat class="mt-2 advanced">
								<v-expansion-panel>
									<v-expansion-panel-header class="px-0 py-1 text-caption"><span><v-icon x-small left>mdi-tune</v-icon>{{ $t('plugins.WorkshopRS485.rS485.advanced') }}</span></v-expansion-panel-header>
									<v-expansion-panel-content>
										<v-row dense>
											<v-col cols="6" sm="3"><v-select v-model="b.bits_stop" :items="[1, 2]" :label="$t('plugins.WorkshopRS485.rS485.stop_bits')" dense outlined hide-details /></v-col>
											<v-col cols="6" sm="3"><v-text-field v-model.number="b.timeout_ms" type="number" :label="$t('plugins.WorkshopRS485.rS485.response_timeout_ms')" dense outlined hide-details /></v-col>
											<v-col cols="6" sm="3"><v-text-field v-model.number="b.wait_ms" type="number" :label="$t('plugins.WorkshopRS485.rS485.gap_between_messages_ms')" dense outlined hide-details /></v-col>
											<v-col cols="6" sm="3"><v-text-field v-model.number="b.retries" type="number" min="1" :label="$t('plugins.WorkshopRS485.rS485.retries')" dense outlined hide-details /></v-col>
										</v-row>
										<template v-if="b.kind === 'duet'">
											<div class="text-caption mt-2">
												{{ $t('plugins.WorkshopRS485.rS485.the_duet_acts_as_the_modbus') }} <code>M261.1</code> / <code>M260.1</code>{{ $t('plugins.WorkshopRS485.rS485.and_the_plugin_asks_it_for') }} <code>{{ lineM575(b) }}</code>{{ $t('plugins.WorkshopRS485.rS485.if_nothing_answers_on_one_port') }}
											</div>
											<v-row dense class="mt-1">
												<v-col cols="12" sm="4"><v-text-field v-model.trim="b.pin_tx" :label="$t('plugins.WorkshopRS485.rS485.transmit_pin_c')" :placeholder="$t('plugins.WorkshopRS485.rS485.empty_built_in')" dense outlined hide-details /></v-col>
												<v-col cols="12" sm="8"><v-text-field v-model.trim="b.line_m575" :label="$t('plugins.WorkshopRS485.rS485.own_m575_command_replaces_the_one')" dense outlined hide-details /></v-col>
											</v-row>
										</template>
										<div class="d-flex mt-2">
											<v-spacer />
											<v-btn x-small text :color="armed === 'bus-' + b.id ? 'error' : 'grey'" :disabled="draftBuses.length < 2 || used(b.id)" @click="arm('bus-' + b.id, () => draftBuses.splice(i, 1))">
												{{ armed === 'bus-' + b.id ? $t('plugins.WorkshopRS485.rS485.tap_again_removed_on_save') : $t('plugins.WorkshopRS485.rS485.remove_bus') }}
											</v-btn>
										</div>
										<div v-if="used(b.id)" class="text-caption grey--text text-right">{{ $t('plugins.WorkshopRS485.rS485.to_remove_it_first_move_or') }}</div>
									</v-expansion-panel-content>
								</v-expansion-panel>
							</v-expansion-panels>
						</v-card>

						<div v-if="hasChangesBuses" class="d-flex align-center flex-wrap bar-save" style="gap:8px">
							<span class="text-caption warning--text">{{ $t('plugins.WorkshopRS485.rS485.there_are_unsaved_changes_in_the') }}</span>
							<v-spacer />
							<v-btn small text @click="discardBuses()">{{ $t('plugins.WorkshopRS485.common.discard') }}</v-btn>
							<v-btn small color="primary" :loading="saving" :disabled="!can('rs485.save')" @click="saveBuses()">{{ $t('plugins.WorkshopRS485.rS485.save_buses') }}</v-btn>
						</div>
						<div v-if="msg && !dialog" class="text-caption mt-2" :class="msgError ? 'error--text' : 'success--text'">{{ msg }}</div>
					</v-tab-item>

					<!-- ===== Como funciona ===== -->
					<v-tab-item>
						<startup-guide :cfg="cfg" :state="state" :ports="ports" :backend-live="backendLive" @go="tab = $event" @add="newItem()" @update="load()" />
					</v-tab-item>

					<!-- ===== Diagnostico ===== -->
					<v-tab-item>
						<diagnostico :cfg="cfg" :state="state" :ports="ports" :send-code="sendCode"
							@absent="(id, v) => markAbsent([id], v)" @add="(busId, dir) => { tab = 0; newItem(busId, dir); }" />
					</v-tab-item>
				</v-tabs-items>
				</div>
				</div>
			</v-card-text>
		</v-card>

		<device-editor
			v-model="dialog" :initial="formInitial" :newItem="editingNew"
			:buses="cfg.buses" :devices="cfg.devices" :profiles="profiles"
			:found="found" :scanning="!!scanning" :saving="saving"
			:msg="msg" :msg-error="msgError"
			@scan="scan" @save="saveDisp" @remove="deleteDisp"
		/>
	</v-container>
</template>

<script>
import i18n from '../../i18n'

'use strict'

import { mapActions } from 'vuex'
import device from './Device.vue'
import DeviceEditor from './DeviceEditor.vue'
import StartupGuide from './StartupGuide.vue'
import StartupPanel from './StartupPanel.vue' // start-up card (vue/_shared)
import { signedOut } from './workshop-auth.js'
import { whoami } from './workshop-api.js'
import PageHeader from './PageHeader.vue' // header of every page (vue/_shared)
import { stepsGuide } from './guide-steps.js'
import { rowsRS485 } from './startup-rows.js'
import diagnosis, { verdicts, summaryLive } from './Diagnosis.vue'
import { callService, states, BAUDS_T3D, optionsOf, does, textOf, canMixin } from './api.js'
import { pluginOf, pathExists } from './workshop-ids.js' // Id nuevo o viejo del plugin

function copy(o) {
	return JSON.parse(JSON.stringify(o));
}

const BUS_NEW = { kind: 'usb', port_duet: 1, pin_tx: '', line_m575: '', name: '', port: '', baud: 9600, parity: 'N', bits_stop: 1, timeout_ms: 300, wait_ms: 15, retries: 3 };

function withDefaults(buses) {
	return copy(buses || []).map(b => ({ ...copy(BUS_NEW), ...b, kind: b.kind || 'usb' }));
}

import SideTabs from './SideTabs.vue'
import { sectionColor } from './section-colors.js' // the color of each section (--wf-sec)

export default {
	mixins: [canMixin],
	components: { PageHeader, SideTabs, Dispositivo: device, DeviceEditor: DeviceEditor, StartupGuide: StartupGuide, StartupPanel: StartupPanel, Diagnostico: diagnosis },
	data() {
		return {
			tab: 0,
			cfg: { buses: [], devices: [] },
			profiles: [],
			ports: { ports: null, group_dialout: null },
			draftBuses: [],
			dialog: false,
			editingNew: false,
			formInitial: null,
			saving: false,
			scanning: null,	// id of the bus being searched
			busyDet: null,
			found: {},
			msg: null,
			msgError: false,
			armed: null,
			armedTimer: null,
			backendLive: true,
			needsLogin: false,
			read: false,	// the first read of the config ended (the start-up card says nothing before)
			VERDICTS: verdicts,
			bauds: BAUDS_T3D,
			parities: [{ text: i18n.t('plugins.WorkshopRS485.common.8n1_none'), value: 'N' }, { text: i18n.t('plugins.WorkshopRS485.common.8e1_even'), value: 'E' }, { text: i18n.t('plugins.WorkshopRS485.common.8o1_odd'), value: 'O' }]
		};
	},
	computed: {
		secColor() {
			return sectionColor(this.tab)
		},
		backendDown() {
			return !this.backendLive && !this.needsLogin;
		},
		// what the page header counts: the plugin service and the buses with a problem (the session is added by the header)
		headerReasons() {
			const r = [];
			if (this.backendDown) r.push({ level: 'error', text: this.$t('plugins.WorkshopRS485.rS485.the_plugin_service_isn_t_responding') });
			(this.state.buses || []).forEach(b => {
				if (!b.open && b.error && b.error_kind !== 'without_port') r.push({ level: 'warn', text: b.name + ': ' + (b.error_kind === 'no_found' ? this.$t('plugins.WorkshopRS485.common.adapter_not_found') : this.$t('plugins.WorkshopRS485.rS485.with_a_problem')) });
			});
			return r;
		},
		// the Activity page is another plugin: the hint names it only when it is there
		hasActivity() {
			return pathExists(this.$router, '/Plugins/Activity');
		},
		// the tabs, as the side bar (SideTabs); the v-model keeps the index of the v-tab-item
		tabItems() {
			return [
			{ icon: 'mdi-chip', label: this.$t('plugins.WorkshopRS485.rS485.devices') },
			{ icon: 'mdi-serial-port', label: this.$t('plugins.WorkshopRS485.common.buses_and_adapters') },
			{ icon: 'mdi-clipboard-check-outline', label: this.$t('plugins.WorkshopRS485.rS485.how_it_works') },
			{ icon: 'mdi-stethoscope', label: this.$t('plugins.WorkshopRS485.rS485.diagnostics') },
			];
		},
		state() {
			const p = this.$store.state.machine.model.plugins;
			const pl = pluginOf(p, 'rs485');
			const d = pl && pl.data;
			const v = d && (typeof d.get === 'function' ? d.get('rs485') : d.rs485);
			return v || { buses: [], devices: [] };
		},
		det() {
			return { auto: true, add: true, each_s: 120, until: 16, ...(this.cfg.detection || {}) };
		},
		detecting() {
			return this.state.detecting || { active: false, text: '', progress: 0 };
		},
		detected() {
			return this.state.detected || [];
		},
		cfgV() {
			return this.state.cfg_v;
		},
		optionsPort() {
			return (this.ports.ports || []).map(p => ({ path: p.path, text: `${p.name} (${p.real})` }));
		},
		savedNorm() {
			return withDefaults(this.cfg.buses);
		},
		hasChangesBuses() {
			return JSON.stringify(this.draftBuses) !== JSON.stringify(this.savedNorm);
		},
		// start-up card: the same steps as the guide (guide-steps.js), as rows
		rowsStartup() {
			return rowsRS485({
				backendLive: this.backendLive,
				steps: stepsGuide({
					cfg: this.cfg, state: this.state, ports: this.ports, backendLive: this.backendLive,
					t: (k, p) => i18n.t(k, p), pathExists: path => pathExists(this.$router, path), STATES: states
				})
			});
		},
		// buses with a problem to be counted above (missing adapter, mute devices)
		problemsBus() {
			const malos = ['adapter_no_found', 'without_permission', 'busy', 'no_opens', 'without_pyserial', 'nobody_answers', 'some_no_answer'];
			const out = [];
			for (const b of this.cfg.buses || []) {
				if (!this.cfg.devices.some(d => d.bus === b.id && d.active !== false && !d.absent)) {
					continue;	// no devices to watch: nothing to warn about
				}
				const r = summaryLive(b, this.busLive(b.id), this.cfg.devices, this.state.devices || []);
				if (malos.includes(r.code)) {
					out.push({ bus: b, ...r });
				}
			}
			return out;
		}
	},
	watch: {
		// the Pi changed the config by itself (automatic detection): bring the new one
		cfgV(v, old) {
			if (old != null && v !== old && !this.saving && !this.dialog) {
				this.load();
			}
		}
	},
	mounted() {
		this.load();
	},
	beforeDestroy() {
		clearTimeout(this.armedTimer);
	},
	methods: {
		...mapActions('machine', ['sendCode']),
		does: does,
		textOf: textOf,
		// device not connected on purpose: it is not watched nor counted as a failure
		async markAbsent(ids, value) {
			const cfg = copy(this.cfg);
			for (const d of cfg.devices) {
				if (ids.includes(d.id)) {
					if (value) {
						d.absent = true;
					} else {
						delete d.absent;
					}
				}
			}
			if (await this.saveConfig(cfg)) {
				this.msg = value ? i18n.t('plugins.WorkshopRS485.rS485.marked_as_absent_it_no_longer') : i18n.t('plugins.WorkshopRS485.rS485.it_is_watched_again');
			}
		},
		async load() {
			try {
				const r = await callService(this.sendCode, { P: 'config' });
				this.cfg = r.config;
				this.profiles = r.profiles;
				if (!this.hasChangesBuses || !this.draftBuses.length) {
					this.draftBuses = withDefaults(this.cfg.buses);
				}
				this.backendLive = true;
				this.needsLogin = false;
			} catch (e) {
				this.backendLive = false;
				// a missing or expired session is not a plugin that does not answer: ask the service who is signed in
				const who = await whoami().catch(() => null);
				this.needsLogin = signedOut() || !!(who && who.configured && who.login_required);
				this.read = true;
				return;
			}
			try {
				this.ports = await callService(this.sendCode, { P: 'ports' });
			} catch (e) {
				this.ports = { ports: null, group_dialout: null };
			}
			this.read = true;
		},
		// a button of a row of the start-up card (same actions as the buttons of the guide)
		onActionStartup(a) {
			if (a[0] === 'update') this.load();
			else if (a[0] === 'add') this.newItem();
			else if (a[0] === 'go') this.tab = a[1];
		},
		liveOf(id) {
			return (this.state.devices || []).find(d => d.id === id) || null;
		},
		busLive(id) {
			return (this.state.buses || []).find(b => b.id === id) || null;
		},
		colorBus(b) {
			const v = this.busLive(b.id);
			if (!v) {
				return 'grey';
			}
			return v.open ? 'success' : (v.error && v.error_kind !== 'without_port' ? 'warning' : 'grey');
		},
		textStateBus(b) {
			const v = this.busLive(b.id);
			if (!v) {
				return i18n.t('plugins.WorkshopRS485.rS485.unsaved');
			}
			return v.open ? i18n.t('plugins.WorkshopRS485.rS485.open_m') : (v.error_kind === 'no_found' ? i18n.t('plugins.WorkshopRS485.common.adapter_not_found') : (v.error_kind === 'without_port' ? i18n.t('plugins.WorkshopRS485.rS485.not_configured') : v.error ? i18n.t('plugins.WorkshopRS485.rS485.with_a_problem') : i18n.t('plugins.WorkshopRS485.rS485.closed_m')));
		},
		colorState(dispId) {
			const v = this.liveOf(dispId);
			return (states[(v && v.state) || 'unknown'] || states.unknown).color;
		},
		machinesOf(busId) {
			return this.cfg.devices.filter(d => d.bus === busId);
		},
		deviceEn(busId, dir) {
			return this.cfg.devices.find(d => d.bus === busId && Number(d.address) === Number(dir)) || null;
		},
		busOfPort(p) {
			return this.cfg.buses.find(b => (b.kind || 'usb') === 'usb' && (b.port === p.path || b.port === p.real)) || null;
		},
		changed(b) {
			const g = this.savedNorm.find(x => x.id === b.id);
			return !!g && JSON.stringify(g) !== JSON.stringify(b);
		},
		newWithoutSave(b) {
			return !this.cfg.buses.some(x => x.id === b.id);
		},
		lineM575(b) {
			if (b.line_m575) {
				return b.line_m575;
			}
			return `M575 P${b.port_duet || 1} B${b.baud || 9600} S7` + (b.pin_tx ? ` C"${b.pin_tx}"` : '');
		},
		used(busId) {
			return this.cfg.devices.some(d => d.bus === busId);
		},
		arm(that, fn) {
			if (this.armed === that) {
				this.armed = null;
				fn();
				return;
			}
			this.armed = that;
			clearTimeout(this.armedTimer);
			this.armedTimer = setTimeout(() => { this.armed = null; }, 4000);
		},
		newItem(busId, address, type) {
			const profile = type || 't3d';
			this.formInitial = {
				id: '', name: '', axis: '', profile: profile,
				bus: busId || (this.cfg.buses[0] || {}).id,
				address: address || 1,
				active: true,
				options: optionsOf(this.profiles, profile)
			};
			this.editingNew = true;
			this.msg = null;
			this.dialog = true;
		},
		edit(d) {
			const f = copy(d);
			f.options = optionsOf(this.profiles, d.profile, d.options);
			if (f.active == null) {
				f.active = true;
			}
			if (f.axis == null) {
				f.axis = '';
			}
			this.formInitial = f;
			this.editingNew = false;
			this.msg = null;
			this.dialog = true;
		},
		idNew(nombre) {
			const base = (nombre || 'device').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device';
			let id = base;
			let n = 2;
			while (this.cfg.devices.some(d => d.id === id)) {
				id = `${base}-${n++}`;
			}
			return id;
		},
		async saveConfig(cfg) {
			this.saving = true;
			this.msg = null;
			try {
				const r = await callService(this.sendCode, { P: 'save', J: cfg });
				this.cfg = r.config;
				this.draftBuses = withDefaults(this.cfg.buses);
				this.msg = i18n.t('plugins.WorkshopRS485.rS485.saved_and_applied');
				this.msgError = false;
				return true;
			} catch (e) {
				this.msg = i18n.t('plugins.WorkshopRS485.common.could_not_save') + (e.message || e);
				this.msgError = true;
				return false;
			} finally {
				this.saving = false;
			}
		},
		// devices are saved over the buses ALREADY saved (they do not drag half-done
		// changes from the Buses tab)
		async saveDisp(f) {
			const cfg = copy(this.cfg);
			if (f.options.current_max === '' || f.options.current_max == null) {
				f.options.current_max = null;
			} else {
				f.options.current_max = Number(f.options.current_max);
			}
			if (this.editingNew) {
				f.id = this.idNew(f.name);
				cfg.devices.push(f);
			} else {
				const i = cfg.devices.findIndex(d => d.id === f.id);
				cfg.devices.splice(i, 1, f);
			}
			const pending = this.hasChangesBuses ? copy(this.draftBuses) : null;
			if (await this.saveConfig(cfg)) {
				this.dialog = false;
				if (pending) {
					this.draftBuses = pending;
				}
			}
		},
		// Explore registers > Watch: adds it to the generic's registers
		async watchRecord(d, x) {
			const cfg = copy(this.cfg);
			const disp = cfg.devices.find(z => z.id === d.id);
			if (!disp) {
				return;
			}
			disp.options = disp.options || {};
			disp.options.records = disp.options.records || [];
			if (disp.options.records.some(r => Number(r.record) === x.record && Number(r.func || 3) === x.func)) {
				return;
			}
			disp.options.records.push({ name: 'reg ' + x.record, record: x.record, func: x.func, scale: 1, unit: '', with_sign: false, writable: false });
			if (await this.saveConfig(cfg)) {
				this.msg = i18n.t('plugins.WorkshopRS485.rS485.register_added', { n: x.record, name: disp.name });
			}
		},
		async renameDisp(d, nombre) {
			const cfg = copy(this.cfg);
			const disp = cfg.devices.find(z => z.id === d.id);
			if (disp && nombre) {
				disp.name = nombre;
				await this.saveConfig(cfg);
			}
		},
		async deleteDisp(id) {
			const cfg = copy(this.cfg);
			cfg.devices = cfg.devices.filter(d => d.id !== id);
			if (await this.saveConfig(cfg)) {
				this.dialog = false;
			}
		},
		addBus(port) {
			let n = this.draftBuses.length + 1;
			while (this.draftBuses.some(b => b.id === `bus${n}`)) {
				n++;
			}
			this.draftBuses.push({ ...copy(BUS_NEW), id: `bus${n}`, name: `RS485 ${n}`, port: port || '' });
		},
		discardBuses() {
			this.draftBuses = withDefaults(this.cfg.buses);
		},
		async saveBuses() {
			const cfg = copy(this.cfg);
			cfg.buses = copy(this.draftBuses);
			if (await this.saveConfig(cfg)) {
				this.load();
			}
		},
		nameBus(id) {
			const b = this.cfg.buses.find(x => x.id === id);
			return b ? (b.name || b.id) : id;
		},
		async saveDetection(changes) {
			const cfg = copy(this.cfg);
			cfg.detection = { ...this.det, ...changes };
			await this.saveConfig(cfg);
		},
		async detect(params) {
			this.msg = null;
			try {
				await callService(this.sendCode, { P: 'detect', ...(params || {}) });
			} catch (e) {
				this.msg = i18n.t('plugins.WorkshopRS485.common.could_not_search') + (e.message || e);
				this.msgError = true;
			}
		},
		async addDetected(d) {
			this.busyDet = d.key;
			this.msg = null;
			try {
				const r = await callService(this.sendCode, { P: 'add_detected', C: d.key });
				await this.load();
				const nuevo = this.cfg.devices.find(x => x.id === r.id);
				if (nuevo) {
					this.tab = 0;
					this.edit(nuevo);	// so that you give it a name and axis
				}
			} catch (e) {
				this.msg = i18n.t('plugins.WorkshopRS485.rS485.could_not_add') + (e.message || e);
				this.msgError = true;
			} finally {
				this.busyDet = null;
			}
		},
		async ignoreDetected(d) {
			try {
				await callService(this.sendCode, { P: 'ignore_detected', C: d.key });
			} catch (e) {
				this.msg = i18n.t('plugins.WorkshopRS485.rS485.couldn_t') + (e.message || e);
				this.msgError = true;
			}
		},
		async scan(busId) {
			this.scanning = busId;
			try {
				const r = await callService(this.sendCode, { P: 'scan', B: busId, D: 1, H: 32 });
				this.$set(this.found, busId, r.found);
			} catch (e) {
				this.msg = i18n.t('plugins.WorkshopRS485.common.could_not_search') + (e.message || e);
				this.msgError = true;
			} finally {
				this.scanning = null;
			}
		}
	}
};
</script>

<style scoped>
.section-title {
	font-size: 0.95rem;
	font-weight: 500;
	margin-bottom: 6px;
}
.detected {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 6px 8px;
	border-radius: 6px;
	background: rgba(128, 128, 128, 0.1);
}
.adapters {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 8px;
}
.adapter {
	display: flex;
	align-items: center;
	gap: 8px;
}
.adapter-text {
	flex: 1;
	min-width: 0;
}
.bus-changed {
	border-color: rgba(255, 152, 0, 0.6) !important;
}
.advanced >>> .v-expansion-panel-content__wrap {
	padding: 0 0 8px;
}
.advanced >>> .v-expansion-panel-header {
	min-height: 32px;
}
.bar-save {
	position: sticky;
	bottom: 0;
	padding: 8px 0;
	background: var(--v-background-base, inherit);
	z-index: 1;
}
.command code {
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
}
</style>
