<template>
	<v-container :style="{ '--wf-sec': sectionColor(tab) }" fluid class="pa-0 rs485-page workshop-theme">
		<page-header :lead="$t('plugins.WorkshopRS485.rS485.lead')" icon="mdi-serial-port" :title="$t('plugins.WorkshopRS485.rS485.rs485_devices')" :reasons="headerReasons">
			<v-chip v-for="b in state.buses" :key="b.id" size="small" variant="outlined" :color="b.open ? 'success' : (b.error && b.error_kind !== 'without_port' ? 'warning' : 'grey')">
				<v-icon size="x-small" start>mdi-serial-port</v-icon>{{ b.name }}:
				<span class="ml-1">{{ b.open ? $t('plugins.WorkshopRS485.common.connected') : (b.error_kind === 'no_found' ? $t('plugins.WorkshopRS485.common.adapter_not_found') : (b.error_kind === 'without_port' ? $t('plugins.WorkshopRS485.rS485.not_configured') : b.error ? $t('plugins.WorkshopRS485.rS485.with_a_problem') : $t('plugins.WorkshopRS485.rS485.closed'))) }}</span>
			</v-chip>
			<template #right>
				<v-btn size="small" variant="text" @click="load()"><v-icon size="small" start>mdi-refresh</v-icon>{{ $t('plugins.WorkshopRS485.common.refresh') }}</v-btn>
			</template>
			<template #startup>
				<startup-panel v-if="read" plugin="WorkshopRS485" :defs="rowsStartup" :service-row="false" @action="onActionStartup">
					<v-btn size="x-small" variant="text" color="primary" class="mt-1" @click="tab = 2">{{ $t('plugins.WorkshopRS485.rS485.see_the_steps') }}</v-btn>
				</startup-panel>
			</template>
		</page-header>
		<v-alert v-if="backendDown" density="compact" variant="tonal" type="warning" class="mb-3">
			{{ $t('plugins.WorkshopRS485.rS485.the_plugin_service_isn_t_responding') }}
		</v-alert>
		<div class="mb-3">
				<div class="st-layout">
				<side-tabs v-model="tab" :items="tabItems" />
				<div class="st-body">
				<v-tabs-window v-model="tab">
					<!-- ===== Dispositivos ===== -->
					<v-tabs-window-item :value="0">
						<!-- bus with a problem, in plain language (with what the plugin publishes, without asking anything) -->
						<v-alert v-for="p in problemsBus" :key="'pb-' + p.bus.id" density="compact" variant="tonal" :type="VERDICTS[p.code].kind" class="mb-3">
							<div class="text-body-medium"><b>{{ p.bus.name || p.bus.id }}:</b> <span>{{ VERDICTS[p.code].title }}</span></div>
							<div v-for="d in p.silent" :key="d.id" class="text-body-small">
								<b>{{ d.name || d.id }}</b> <span>{{ $t('plugins.WorkshopRS485.common.not_responding') }}</span>
								<template v-if="d.seen_does_s != null"><span>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.it_did_before') }}</span> {{ does(d.seen_does_s).n }} <span>{{ does(d.seen_does_s).u }}</span>)</template>
								<span v-else>{{ ' ' }}{{ $t('plugins.WorkshopRS485.common.never_answered') }}</span>
							</div>
							<div class="d-flex align-center flex-wrap mt-1" style="gap:8px">
								<v-btn size="x-small" variant="outlined" color="primary" @click="tab = 3"><v-icon size="x-small" start>mdi-stethoscope</v-icon>{{ $t('plugins.WorkshopRS485.common.diagnose') }}</v-btn>
								<v-btn v-if="p.silent.length" size="x-small" variant="text" :loading="saving" :title="$t('plugins.WorkshopRS485.rS485.if_they_are_not_connected_on')" @click="markAbsent(p.silent.map(d => d.id), true)">
									<v-icon size="x-small" start>mdi-eye-off-outline</v-icon>{{ p.silent.length === 1 ? $t('plugins.WorkshopRS485.common.mark_as_absent') : $t('plugins.WorkshopRS485.rS485.mark_all_as_absent') }}
								</v-btn>
							</div>
						</v-alert>
						<v-alert v-if="detected.length" density="compact" variant="tonal" type="info" icon="mdi-radar" class="mb-3">
							<div class="d-flex align-center flex-wrap" style="gap:8px">
								<span>{{ detected.length === 1 ? $t('plugins.WorkshopRS485.rS485.one_new_device') : $t('plugins.WorkshopRS485.rS485.n_new_devices', { n: detected.length }) }}</span>
								<v-btn size="x-small" variant="outlined" color="primary" @click="tab = 1">{{ $t('plugins.WorkshopRS485.rS485.see_and_add') }}</v-btn>
							</div>
						</v-alert>
						<div v-if="!cfg.devices.length" class="text-body-medium text-medium-emphasis mb-3">
							{{ $t('plugins.WorkshopRS485.rS485.no_devices_yet_add_the_first') }}
						</div>
						<device-card
							v-for="d in cfg.devices" :key="d.id"
							:cfg="d" :live="liveOf(d.id)" :profiles="profiles"
							@edit="edit(d)"
							@watch="watchRecord(d, $event)" @rename="renameDisp(d, $event)"
							@absent="markAbsent([d.id], $event)"
							class="mb-3"
						/>
						<v-btn color="primary" size="small" :disabled="!cfg.buses.length || !can('rs485.save')" @click="newItem()"><v-icon size="small" start>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.common.add_device') }}</v-btn>
						<v-btn class="ml-2" size="small" variant="outlined" color="primary" :disabled="!cfg.buses.length || !can('rs485.save')" :title="$t('plugins.WorkshopRS485.rS485.json_profile_hint')" @click="newItem(undefined, undefined, 'generic')"><v-icon size="small" start>mdi-file-import-outline</v-icon>{{ $t('plugins.WorkshopRS485.rS485.add_from_json_profile') }}</v-btn>
						<span v-if="!cfg.buses.length" class="text-body-small text-medium-emphasis ml-2">{{ $t('plugins.WorkshopRS485.rS485.first_create_a_bus_in_buses') }}</span>
					</v-tabs-window-item>

					<!-- ===== Buses y adaptadores ===== -->
					<v-tabs-window-item :value="1">
						<!-- deteccion automatica -->
						<v-sheet variant="outlined" rounded class="pa-3 mb-4 detection">
							<div class="d-flex align-center flex-wrap" style="gap:8px">
								<v-icon :color="det.auto ? 'primary' : 'grey'">mdi-radar</v-icon>
								<span class="text-title-medium font-weight-medium">{{ $t('plugins.WorkshopRS485.rS485.automatic_detection') }}</span>
								<v-spacer />
								<v-btn size="small" variant="outlined" color="primary" :loading="detecting.active" :disabled="detecting.active || !can('rs485.detect')" @click="detect()">
									<v-icon size="small" start>mdi-magnify-scan</v-icon>{{ $t('plugins.WorkshopRS485.rS485.search_everything_now') }}
								</v-btn>
							</div>
							<div class="d-flex flex-wrap mt-1" style="gap:0 24px">
								<v-switch :model-value="det.auto" density="compact" hide-details class="mt-1" :label="$t('plugins.WorkshopRS485.rS485.search_for_new_devices_automatically')" @update:model-value="saveDetection({ auto: $event })" />
								<v-switch :model-value="det.add" :disabled="!det.auto" density="compact" hide-details class="mt-1" :label="$t('plugins.WorkshopRS485.rS485.add_them_automatically_no_axis_they')" @update:model-value="saveDetection({ add: $event })" />
							</div>
							<div class="text-body-small text-medium-emphasis mt-2">
								{{ $t('plugins.WorkshopRS485.rS485.detection_note', { min: Math.round(det.each_s / 60) || 1, max: det.until }) }} <b>{{ $t('plugins.WorkshopRS485.common.no_axis') }}</b>{{ $t(hasActivity ? 'plugins.WorkshopRS485.rS485.its_faults_only_warn_until_you' : 'plugins.WorkshopRS485.rS485.its_faults_only_warn_until_you_no_activity') }}
							</div>
							<template v-if="detecting.active">
								<div class="text-body-small mt-2">{{ textOf(detecting, 'text') }}</div>
								<v-progress-linear :model-value="detecting.progress * 100" height="4" rounded class="mt-1" />
							</template>
							<div v-else-if="state.detection_result" class="text-body-small mt-2" :class="state.detection_result.error ? 'text-warning' : 'text-success'">
								{{ textOf(state.detection_result, 'text') }}
							</div>
							<div v-for="d in detected" :key="d.key" class="detected mt-2">
								<v-icon color="primary">{{ d.profile === 't3d' ? 'mdi-engine' : 'mdi-chip' }}</v-icon>
								<div class="flex-grow-1" style="min-width:0">
									<div class="text-body-medium">
										<b>{{ d.profile === 't3d' ? $t('plugins.WorkshopRS485.rS485.t3d_servo') : $t('plugins.WorkshopRS485.rS485.modbus_device') }}</b> {{ $t('plugins.WorkshopRS485.rS485.at_address', { n: d.address }) }}
									</div>
									<div class="text-body-small text-medium-emphasis text-truncate">
										{{ d.bus ? (nameBus(d.bus) + ' · ') : ($t('plugins.WorkshopRS485.rS485.new_adapter_name', { name: d.port_name || d.port }) + ' · ') }}{{ d.baud }} 8{{ d.parity }}1
										<template v-if="d.detail"> &middot; {{ textOf(d, 'detail') }}</template>
									</div>
								</div>
								<v-btn size="x-small" color="primary" variant="outlined" :disabled="!can('rs485.add_detected')" :loading="busyDet === d.key" @click="addDetected(d)"><v-icon size="x-small" start>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.rS485.add') }}</v-btn>
								<v-btn size="x-small" variant="text" :disabled="!can('rs485.ignore_detected')" @click="ignoreDetected(d)">{{ $t('plugins.WorkshopRS485.rS485.ignore') }}</v-btn>
							</div>
						</v-sheet>

						<!-- adapters the Pi sees -->
						<div class="section-title"><v-icon size="small" start>mdi-usb</v-icon>{{ $t('plugins.WorkshopRS485.rS485.adapters_connected_to_the_system') }}</div>
						<v-alert v-if="ports.group_dialout === false" density="compact" variant="tonal" type="warning" class="mb-2">
							{{ $t('plugins.WorkshopRS485.rS485.the_service_isn_t_allowed_to') }}
							<div class="command mt-1"><code>sudo usermod -aG dialout dsf &amp;&amp; sudo systemctl restart duetpluginservice</code></div>
						</v-alert>
						<div v-if="ports.ports === null" class="text-body-medium text-medium-emphasis mb-3">{{ $t('plugins.WorkshopRS485.rS485.could_not_read_the_list_of') }}</div>
						<div v-else-if="!ports.ports.length" class="text-body-medium text-medium-emphasis mb-3">
							{{ $t('plugins.WorkshopRS485.rS485.no_usb_rs485_adapter_connected_plug') }}
						</div>
						<div v-else class="adapters mb-3">
							<v-sheet v-for="p in ports.ports" :key="p.path" variant="outlined" rounded class="adapter pa-2">
								<v-icon :color="busOfPort(p) ? 'success' : 'grey'">mdi-usb-port</v-icon>
								<div class="adapter-text">
									<div class="text-body-medium text-truncate" :title="p.name">{{ p.name }}</div>
									<div class="text-body-small text-medium-emphasis">
										{{ p.real }}<template v-if="p.chip || p.vid"> &middot; {{ p.chip || (p.vid + ':' + p.pid) }}</template><template v-if="p.driver"> &middot; <span>{{ $t('plugins.WorkshopRS485.common.driver') }}</span> {{ p.driver }}</template>
									</div>
								</div>
								<v-chip v-if="busOfPort(p)" size="x-small" color="success" variant="outlined">{{ $t('plugins.WorkshopRS485.rS485.used_by_bus', { name: busOfPort(p).name }) }}</v-chip>
								<template v-else>
									<v-btn size="x-small" variant="outlined" color="primary" :disabled="detecting.active || !can('rs485.detect')" :title="$t('plugins.WorkshopRS485.rS485.tries_every_speed_and_format')" @click="detect({ U: p.path })"><v-icon size="x-small" start>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.rS485.detect') }}</v-btn>
									<v-btn size="x-small" variant="text" @click="addBus(p.path)">{{ $t('plugins.WorkshopRS485.rS485.create_bus_by_hand') }}</v-btn>
								</template>
							</v-sheet>
						</div>

						<!-- buses -->
						<div class="section-title d-flex align-center">
							<span><v-icon size="small" start>mdi-serial-port</v-icon>{{ $t('plugins.WorkshopRS485.rS485.buses') }}</span>
							<v-spacer />
							<v-btn size="x-small" variant="text" color="primary" @click="addBus()"><v-icon size="x-small" start>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.rS485.another_bus') }}</v-btn>
						</div>
						<div class="text-body-small text-medium-emphasis mb-2">
							{{ $t('plugins.WorkshopRS485.rS485.bus_note') }}
						</div>
						<div v-if="!draftBuses.length" class="text-body-medium text-medium-emphasis mb-3">{{ $t('plugins.WorkshopRS485.rS485.there_are_no_buses_yet') }}</div>

						<v-card v-for="(b, i) in draftBuses" :key="b.id" variant="outlined" class="pa-3 mb-3 bus" :class="{ 'bus-changed': changed(b) }">
							<!-- cabecera: estado + resumen -->
							<div class="d-flex align-center flex-wrap" style="gap:8px">
								<v-icon :color="colorBus(b)">{{ b.kind === 'duet' ? 'mdi-expansion-card' : 'mdi-usb' }}</v-icon>
								<span class="text-title-medium font-weight-medium">{{ b.name || b.id }}</span>
								<v-chip size="x-small" :color="colorBus(b)" variant="flat">{{ textStateBus(b) }}</v-chip>
								<v-chip v-if="changed(b)" size="x-small" variant="outlined" color="warning">{{ $t('plugins.WorkshopRS485.rS485.unsaved') }}</v-chip>
								<v-spacer />
								<span class="text-body-small text-medium-emphasis">{{ b.baud }} &middot; 8{{ b.parity }}{{ b.bits_stop }}</span>
							</div>
							<div v-if="busLive(b.id)" class="text-body-small text-medium-emphasis mt-1">
								<template v-if="busLive(b.id).error && !busLive(b.id).open"><span class="text-warning">{{ textOf(busLive(b.id), 'error') }}</span> &middot; </template>
								{{ $t('plugins.WorkshopRS485.rS485.bus_stats', { ok: busLive(b.id).stats.ok, none: busLive(b.id).stats.without_response, crc: busLive(b.id).stats.crc }) }}
							</div>

							<!-- equipos del bus -->
							<div class="d-flex align-center flex-wrap mt-2" style="gap:6px">
								<span class="text-body-small">{{ $t('plugins.WorkshopRS485.rS485.devices_colon') }}</span>
								<v-chip v-for="d in machinesOf(b.id)" :key="d.id" size="small" :color="colorState(d.id)" variant="flat" @click="edit(d)">
									<v-icon size="x-small" start>mdi-pencil</v-icon>{{ d.name || d.id }} &middot; {{ $t('plugins.WorkshopRS485.rS485.address_short', { n: d.address }) }}
								</v-chip>
								<span v-if="!machinesOf(b.id).length" class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.rS485.none') }}</span>
							</div>

							<!-- lo esencial -->
							<v-row density="compact" class="mt-2">
								<v-col cols="12" sm="4"><v-text-field v-model.trim="b.name" :label="$t('plugins.WorkshopRS485.common.name')" density="compact" variant="outlined" hide-details /></v-col>
								<v-col cols="12" sm="8">
									<v-btn-toggle v-model="b.kind" mandatory density="compact" color="primary">
										<v-btn size="small" value="usb"><v-icon size="small" start>mdi-usb</v-icon>{{ $t('plugins.WorkshopRS485.rS485.usb_adapter') }}</v-btn>
										<v-btn size="small" value="duet"><v-icon size="small" start>mdi-expansion-card</v-icon>{{ $t('plugins.WorkshopRS485.rS485.duet_rs485') }}</v-btn>
									</v-btn-toggle>
								</v-col>
								<v-col cols="12" sm="6" v-if="b.kind !== 'duet'">
									<v-combobox v-model="b.port" :items="optionsPort" :return-object="false" item-title="text" item-value="path" :label="$t('plugins.WorkshopRS485.rS485.adapter_port')" density="compact" variant="outlined" hide-details />
								</v-col>
								<v-col cols="12" sm="6" v-else>
									<v-select v-model="b.port_duet" :items="portDuetItems" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.rS485.duet_serial_port')" density="compact" variant="outlined" hide-details />
								</v-col>
								<v-col cols="6" sm="3"><v-select v-model="b.baud" :items="bauds" :label="$t('plugins.WorkshopRS485.common.speed')" density="compact" variant="outlined" hide-details /></v-col>
								<v-col cols="6" sm="3"><v-select v-model="b.parity" :items="parities" item-title="text" item-value="value" :label="$t('plugins.WorkshopRS485.common.format')" density="compact" variant="outlined" hide-details /></v-col>
							</v-row>

							<!-- buscar equipos -->
							<div class="d-flex align-center flex-wrap mt-3" style="gap:6px">
								<v-btn size="x-small" variant="outlined" :loading="scanning === b.id" :disabled="!!scanning || changed(b) || newWithoutSave(b) || !can('rs485.scan')" @click="scan(b.id)">
									<v-icon size="x-small" start>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.rS485.find_devices_1_32') }}
								</v-btn>
								<span v-if="changed(b) || newWithoutSave(b)" class="text-body-small text-medium-emphasis">{{ $t('plugins.WorkshopRS485.rS485.save_the_changes_to_search_with') }}</span>
								<template v-else-if="found[b.id]">
									<span v-if="!found[b.id].length" class="text-body-small text-warning">{{ $t('plugins.WorkshopRS485.rS485.no_address_answered_check_speed_format') }}</span>
									<template v-else>
										<span class="text-body-small">{{ $t('plugins.WorkshopRS485.common.answering') }}</span>
										<template v-for="a in found[b.id]" :key="a">
											<v-chip v-if="deviceEn(b.id, a)" size="x-small" variant="outlined" color="success">{{ a }} &middot; {{ deviceEn(b.id, a).name || deviceEn(b.id, a).id }}</v-chip>
											<v-chip v-else size="x-small" color="primary" variant="flat" @click="newItem(b.id, a)"><v-icon size="x-small" start>mdi-plus</v-icon>{{ a }} &middot; {{ $t('plugins.WorkshopRS485.rS485.add') }}</v-chip>
										</template>
									</template>
								</template>
							</div>

							<!-- avanzado -->
							<v-expansion-panels flat class="mt-2 advanced">
								<v-expansion-panel>
									<v-expansion-panel-title class="px-0 py-1 text-body-small"><span><v-icon size="x-small" start>mdi-tune</v-icon>{{ $t('plugins.WorkshopRS485.rS485.advanced') }}</span></v-expansion-panel-title>
									<v-expansion-panel-text>
										<v-row density="compact">
											<v-col cols="6" sm="3"><v-select v-model="b.bits_stop" :items="[1, 2]" :label="$t('plugins.WorkshopRS485.rS485.stop_bits')" density="compact" variant="outlined" hide-details /></v-col>
											<v-col cols="6" sm="3"><v-text-field v-model.number="b.timeout_ms" type="number" :label="$t('plugins.WorkshopRS485.rS485.response_timeout_ms')" density="compact" variant="outlined" hide-details /></v-col>
											<v-col cols="6" sm="3"><v-text-field v-model.number="b.wait_ms" type="number" :label="$t('plugins.WorkshopRS485.rS485.gap_between_messages_ms')" density="compact" variant="outlined" hide-details /></v-col>
											<v-col cols="6" sm="3"><v-text-field v-model.number="b.retries" type="number" min="1" :label="$t('plugins.WorkshopRS485.rS485.retries')" density="compact" variant="outlined" hide-details /></v-col>
										</v-row>
										<template v-if="b.kind === 'duet'">
											<div class="text-body-small mt-2">
												{{ $t('plugins.WorkshopRS485.rS485.the_duet_acts_as_the_modbus') }} <code>M261.1</code> / <code>M260.1</code>{{ $t('plugins.WorkshopRS485.rS485.and_the_plugin_asks_it_for') }} <code>{{ lineM575(b) }}</code>{{ $t('plugins.WorkshopRS485.rS485.if_nothing_answers_on_one_port') }}
											</div>
											<v-row density="compact" class="mt-1">
												<v-col cols="12" sm="4"><v-text-field v-model.trim="b.pin_tx" :label="$t('plugins.WorkshopRS485.rS485.transmit_pin_c')" :placeholder="$t('plugins.WorkshopRS485.rS485.empty_built_in')" density="compact" variant="outlined" hide-details /></v-col>
												<v-col cols="12" sm="8"><v-text-field v-model.trim="b.line_m575" :label="$t('plugins.WorkshopRS485.rS485.own_m575_command_replaces_the_one')" density="compact" variant="outlined" hide-details /></v-col>
											</v-row>
										</template>
										<div class="d-flex mt-2">
											<v-spacer />
											<v-btn size="x-small" variant="text" :color="armed === 'bus-' + b.id ? 'error' : 'grey'" :disabled="draftBuses.length < 2 || used(b.id)" @click="arm('bus-' + b.id, () => draftBuses.splice(i, 1))">
												{{ armed === 'bus-' + b.id ? $t('plugins.WorkshopRS485.rS485.tap_again_removed_on_save') : $t('plugins.WorkshopRS485.rS485.remove_bus') }}
											</v-btn>
										</div>
										<div v-if="used(b.id)" class="text-body-small text-medium-emphasis text-right">{{ $t('plugins.WorkshopRS485.rS485.to_remove_it_first_move_or') }}</div>
									</v-expansion-panel-text>
								</v-expansion-panel>
							</v-expansion-panels>
						</v-card>

						<div v-if="hasChangesBuses" class="d-flex align-center flex-wrap bar-save" style="gap:8px">
							<span class="text-body-small text-warning">{{ $t('plugins.WorkshopRS485.rS485.there_are_unsaved_changes_in_the') }}</span>
							<v-spacer />
							<v-btn size="small" variant="text" @click="discardBuses()">{{ $t('plugins.WorkshopRS485.common.discard') }}</v-btn>
							<v-btn size="small" color="primary" :loading="saving" :disabled="!can('rs485.save')" @click="saveBuses()">{{ $t('plugins.WorkshopRS485.rS485.save_buses') }}</v-btn>
						</div>
						<div v-if="msg && !dialog" class="text-body-small mt-2" :class="msgError ? 'text-error' : 'text-success'">{{ msg }}</div>
					</v-tabs-window-item>

					<!-- ===== Como funciona ===== -->
					<v-tabs-window-item :value="2">
						<startup-guide :cfg="cfg" :state="state" :ports="ports" :backend-live="backendLive" @go="tab = $event" @add="newItem()" @update="load()" />
					</v-tabs-window-item>

					<!-- ===== Diagnostico ===== -->
					<v-tabs-window-item :value="3">
						<diagnosis-panel :cfg="cfg" :state="state" :ports="ports"
							@absent="(id, v) => markAbsent([id], v)" @add="(busId, dir) => { tab = 0; newItem(busId, dir); }" />
					</v-tabs-window-item>
				</v-tabs-window>
				</div>
				</div>
		</div>

		<device-editor
			v-model="dialog" :initial="formInitial" :newItem="editingNew"
			:buses="cfg.buses" :devices="cfg.devices" :profiles="profiles"
			:found="found" :scanning="!!scanning" :saving="saving"
			:msg="msg" :msg-error="msgError"
			@scan="scan" @save="saveDisp" @remove="deleteDisp"
		/>
	</v-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { i18n, modelPlugins } from './dwc-host.js'
import DeviceCard from './Device.vue'
import DeviceEditor from './DeviceEditor.vue'
import StartupGuide from './StartupGuide.vue'
import StartupPanel from './StartupPanel.vue' // start-up card (vue/_shared)
import { signedOut } from './workshop-auth.js'
import { whoami } from './workshop-api.js'
import PageHeader from './PageHeader.vue' // header of every page (vue/_shared)
import SideTabs from './SideTabs.vue'
import { sectionColor } from './section-colors.js' // the color of each section (--wf-sec)
import { stepsGuide } from './guide-steps.js'
import { rowsRS485 } from './startup-rows.js'
import DiagnosisPanel from './Diagnosis.vue'
import { verdicts as VERDICTS, summaryLive } from './diagnosis-verdicts.js'
import { callService, states, BAUDS_T3D, optionsOf, does, textOf, useCan } from './api.js'
import { pluginOf, dataOf, pathExists } from './workshop-ids.js'

function copy(o) {
	return JSON.parse(JSON.stringify(o))
}

const BUS_NEW = { kind: 'usb', port_duet: 1, pin_tx: '', line_m575: '', name: '', port: '', baud: 9600, parity: 'N', bits_stop: 1, timeout_ms: 300, wait_ms: 15, retries: 3 }

function withDefaults(buses) {
	return copy(buses || []).map(b => ({ ...copy(BUS_NEW), ...b, kind: b.kind || 'usb' }))
}

const router = useRouter()
const { can } = useCan()

const tab = ref(0)
const cfg = ref({ buses: [], devices: [] })
const profiles = ref([])
const ports = ref({ ports: null, group_dialout: null })
const draftBuses = ref([])
const dialog = ref(false)
const editingNew = ref(false)
const formInitial = ref(null)
const saving = ref(false)
const scanning = ref(null) // id of the bus being searched
const busyDet = ref(null)
const found = reactive({})
const msg = ref(null)
const msgError = ref(false)
const armed = ref(null)
let armedTimer = null
const backendLive = ref(true)
const needsLogin = ref(false)
const read = ref(false) // the first read of the config ended (the start-up card says nothing before)
const bauds = BAUDS_T3D
const parities = [{ text: i18n.t('plugins.WorkshopRS485.common.8n1_none'), value: 'N' }, { text: i18n.t('plugins.WorkshopRS485.common.8e1_even'), value: 'E' }, { text: i18n.t('plugins.WorkshopRS485.common.8o1_odd'), value: 'O' }]
const portDuetItems = [{ text: i18n.t('plugins.WorkshopRS485.rS485.port_1_io0'), value: 1 }, { text: i18n.t('plugins.WorkshopRS485.rS485.port_2_io1'), value: 2 }]

const backendDown = computed(() => !backendLive.value && !needsLogin.value)
// what the page header counts: the plugin service and the buses with a problem (the session is added by the header)
const headerReasons = computed(() => {
	const r = []
	if (backendDown.value) r.push({ level: 'error', text: i18n.t('plugins.WorkshopRS485.rS485.the_plugin_service_isn_t_responding') })
	;(state.value.buses || []).forEach(b => {
		if (!b.open && b.error && b.error_kind !== 'without_port') r.push({ level: 'warn', text: b.name + ': ' + (b.error_kind === 'no_found' ? i18n.t('plugins.WorkshopRS485.common.adapter_not_found') : i18n.t('plugins.WorkshopRS485.rS485.with_a_problem')) })
	})
	return r
})
// the Activity page is another plugin: the hint names it only when it is there
const hasActivity = computed(() => pathExists(router, '/Plugins/Activity'))
// the tabs, as the side bar (SideTabs); the v-model keeps the index of the v-tabs-window-item
const tabItems = computed(() => [
	{ icon: 'mdi-chip', label: i18n.t('plugins.WorkshopRS485.rS485.devices') },
	{ icon: 'mdi-serial-port', label: i18n.t('plugins.WorkshopRS485.common.buses_and_adapters') },
	{ icon: 'mdi-clipboard-check-outline', label: i18n.t('plugins.WorkshopRS485.rS485.how_it_works') },
	{ icon: 'mdi-stethoscope', label: i18n.t('plugins.WorkshopRS485.rS485.diagnostics') }
])
const state = computed(() => {
	const pl = pluginOf(modelPlugins(), 'rs485')
	return dataOf(pl, 'rs485') || { buses: [], devices: [] }
})
const det = computed(() => ({ auto: true, add: true, each_s: 120, until: 16, ...(cfg.value.detection || {}) }))
const detecting = computed(() => state.value.detecting || { active: false, text: '', progress: 0 })
const detected = computed(() => state.value.detected || [])
const cfgV = computed(() => state.value.cfg_v)
const optionsPort = computed(() => (ports.value.ports || []).map(p => ({ path: p.path, text: `${p.name} (${p.real})` })))
const savedNorm = computed(() => withDefaults(cfg.value.buses))
const hasChangesBuses = computed(() => JSON.stringify(draftBuses.value) !== JSON.stringify(savedNorm.value))
// start-up card: the same steps as the guide (guide-steps.js), as rows
const rowsStartup = computed(() => rowsRS485({
	backendLive: backendLive.value,
	steps: stepsGuide({
		cfg: cfg.value, state: state.value, ports: ports.value, backendLive: backendLive.value,
		t: (k, p) => i18n.t(k, p), pathExists: path => pathExists(router, path), STATES: states
	})
}))
// buses with a problem to be counted above (missing adapter, mute devices)
const problemsBus = computed(() => {
	const malos = ['adapter_no_found', 'without_permission', 'busy', 'no_opens', 'without_pyserial', 'nobody_answers', 'some_no_answer']
	const out = []
	for (const b of cfg.value.buses || []) {
		if (!cfg.value.devices.some(d => d.bus === b.id && d.active !== false && !d.absent)) {
			continue // no devices to watch: nothing to warn about
		}
		const r = summaryLive(b, busLive(b.id), cfg.value.devices, state.value.devices || [])
		if (malos.includes(r.code)) {
			out.push({ bus: b, ...r })
		}
	}
	return out
})

// the Pi changed the config by itself (automatic detection): bring the new one
watch(cfgV, (v, old) => {
	if (old != null && v !== old && !saving.value && !dialog.value) {
		load()
	}
})

onMounted(() => {
	load()
})
onBeforeUnmount(() => {
	clearTimeout(armedTimer)
})

// device not connected on purpose: it is not watched nor counted as a failure
async function markAbsent(ids, value) {
	const c = copy(cfg.value)
	for (const d of c.devices) {
		if (ids.includes(d.id)) {
			if (value) {
				d.absent = true
			} else {
				delete d.absent
			}
		}
	}
	if (await saveConfig(c)) {
		msg.value = value ? i18n.t('plugins.WorkshopRS485.rS485.marked_as_absent_it_no_longer') : i18n.t('plugins.WorkshopRS485.rS485.it_is_watched_again')
	}
}
async function load() {
	try {
		const r = await callService({ P: 'config' })
		cfg.value = r.config
		profiles.value = r.profiles
		if (!hasChangesBuses.value || !draftBuses.value.length) {
			draftBuses.value = withDefaults(cfg.value.buses)
		}
		backendLive.value = true
		needsLogin.value = false
	} catch (e) {
		backendLive.value = false
		// a missing or expired session is not a plugin that does not answer: ask the service who is signed in
		const who = await whoami().catch(() => null)
		needsLogin.value = signedOut() || !!(who && who.configured && who.login_required)
		read.value = true
		return
	}
	try {
		ports.value = await callService({ P: 'ports' })
	} catch (e) {
		ports.value = { ports: null, group_dialout: null }
	}
	read.value = true
}
// a button of a row of the start-up card (same actions as the buttons of the guide)
function onActionStartup(a) {
	if (a[0] === 'update') load()
	else if (a[0] === 'add') newItem()
	else if (a[0] === 'go') tab.value = a[1]
}
function liveOf(id) {
	return (state.value.devices || []).find(d => d.id === id) || null
}
function busLive(id) {
	return (state.value.buses || []).find(b => b.id === id) || null
}
function colorBus(b) {
	const v = busLive(b.id)
	if (!v) {
		return 'grey'
	}
	return v.open ? 'success' : (v.error && v.error_kind !== 'without_port' ? 'warning' : 'grey')
}
function textStateBus(b) {
	const v = busLive(b.id)
	if (!v) {
		return i18n.t('plugins.WorkshopRS485.rS485.unsaved')
	}
	return v.open ? i18n.t('plugins.WorkshopRS485.rS485.open_m') : (v.error_kind === 'no_found' ? i18n.t('plugins.WorkshopRS485.common.adapter_not_found') : (v.error_kind === 'without_port' ? i18n.t('plugins.WorkshopRS485.rS485.not_configured') : v.error ? i18n.t('plugins.WorkshopRS485.rS485.with_a_problem') : i18n.t('plugins.WorkshopRS485.rS485.closed_m')))
}
function colorState(dispId) {
	const v = liveOf(dispId)
	return (states[(v && v.state) || 'unknown'] || states.unknown).color
}
function machinesOf(busId) {
	return cfg.value.devices.filter(d => d.bus === busId)
}
function deviceEn(busId, dir) {
	return cfg.value.devices.find(d => d.bus === busId && Number(d.address) === Number(dir)) || null
}
function busOfPort(p) {
	return cfg.value.buses.find(b => (b.kind || 'usb') === 'usb' && (b.port === p.path || b.port === p.real)) || null
}
function changed(b) {
	const g = savedNorm.value.find(x => x.id === b.id)
	return !!g && JSON.stringify(g) !== JSON.stringify(b)
}
function newWithoutSave(b) {
	return !cfg.value.buses.some(x => x.id === b.id)
}
function lineM575(b) {
	if (b.line_m575) {
		return b.line_m575
	}
	return `M575 P${b.port_duet || 1} B${b.baud || 9600} S7` + (b.pin_tx ? ` C"${b.pin_tx}"` : '')
}
function used(busId) {
	return cfg.value.devices.some(d => d.bus === busId)
}
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
function newItem(busId, address, type) {
	const profile = type || 't3d'
	formInitial.value = {
		id: '', name: '', axis: '', profile: profile,
		bus: busId || (cfg.value.buses[0] || {}).id,
		address: address || 1,
		active: true,
		options: optionsOf(profiles.value, profile)
	}
	editingNew.value = true
	msg.value = null
	dialog.value = true
}
function edit(d) {
	const f = copy(d)
	f.options = optionsOf(profiles.value, d.profile, d.options)
	if (f.active == null) {
		f.active = true
	}
	if (f.axis == null) {
		f.axis = ''
	}
	formInitial.value = f
	editingNew.value = false
	msg.value = null
	dialog.value = true
}
function idNew(nombre) {
	const base = (nombre || 'device').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device'
	let id = base
	let n = 2
	while (cfg.value.devices.some(d => d.id === id)) {
		id = `${base}-${n++}`
	}
	return id
}
async function saveConfig(c) {
	saving.value = true
	msg.value = null
	try {
		const r = await callService({ P: 'save', J: c })
		cfg.value = r.config
		draftBuses.value = withDefaults(cfg.value.buses)
		msg.value = i18n.t('plugins.WorkshopRS485.rS485.saved_and_applied')
		msgError.value = false
		return true
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.common.could_not_save') + (e.message || e)
		msgError.value = true
		return false
	} finally {
		saving.value = false
	}
}
// devices are saved over the buses ALREADY saved (they do not drag half-done
// changes from the Buses tab)
async function saveDisp(f) {
	const c = copy(cfg.value)
	if (f.options.current_max === '' || f.options.current_max == null) {
		f.options.current_max = null
	} else {
		f.options.current_max = Number(f.options.current_max)
	}
	if (editingNew.value) {
		f.id = idNew(f.name)
		c.devices.push(f)
	} else {
		const i = c.devices.findIndex(d => d.id === f.id)
		c.devices.splice(i, 1, f)
	}
	const pendingBuses = hasChangesBuses.value ? copy(draftBuses.value) : null
	if (await saveConfig(c)) {
		dialog.value = false
		if (pendingBuses) {
			draftBuses.value = pendingBuses
		}
	}
}
// Explore registers > Watch: adds it to the generic's registers
async function watchRecord(d, x) {
	const c = copy(cfg.value)
	const disp = c.devices.find(z => z.id === d.id)
	if (!disp) {
		return
	}
	disp.options = disp.options || {}
	disp.options.records = disp.options.records || []
	if (disp.options.records.some(r => Number(r.record) === x.record && Number(r.func || 3) === x.func)) {
		return
	}
	disp.options.records.push({ name: 'reg ' + x.record, record: x.record, func: x.func, scale: 1, unit: '', with_sign: false, writable: false })
	if (await saveConfig(c)) {
		msg.value = i18n.t('plugins.WorkshopRS485.rS485.register_added', { n: x.record, name: disp.name })
	}
}
async function renameDisp(d, nombre) {
	const c = copy(cfg.value)
	const disp = c.devices.find(z => z.id === d.id)
	if (disp && nombre) {
		disp.name = nombre
		await saveConfig(c)
	}
}
async function deleteDisp(id) {
	const c = copy(cfg.value)
	c.devices = c.devices.filter(d => d.id !== id)
	if (await saveConfig(c)) {
		dialog.value = false
	}
}
function addBus(port) {
	let n = draftBuses.value.length + 1
	while (draftBuses.value.some(b => b.id === `bus${n}`)) {
		n++
	}
	draftBuses.value.push({ ...copy(BUS_NEW), id: `bus${n}`, name: `RS485 ${n}`, port: port || '' })
}
function discardBuses() {
	draftBuses.value = withDefaults(cfg.value.buses)
}
async function saveBuses() {
	const c = copy(cfg.value)
	c.buses = copy(draftBuses.value)
	if (await saveConfig(c)) {
		load()
	}
}
function nameBus(id) {
	const b = cfg.value.buses.find(x => x.id === id)
	return b ? (b.name || b.id) : id
}
async function saveDetection(changes) {
	const c = copy(cfg.value)
	c.detection = { ...det.value, ...changes }
	await saveConfig(c)
}
async function detect(params) {
	msg.value = null
	try {
		await callService({ P: 'detect', ...(params || {}) })
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.common.could_not_search') + (e.message || e)
		msgError.value = true
	}
}
async function addDetected(d) {
	busyDet.value = d.key
	msg.value = null
	try {
		const r = await callService({ P: 'add_detected', C: d.key })
		await load()
		const nuevo = cfg.value.devices.find(x => x.id === r.id)
		if (nuevo) {
			tab.value = 0
			edit(nuevo) // so that you give it a name and axis
		}
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.rS485.could_not_add') + (e.message || e)
		msgError.value = true
	} finally {
		busyDet.value = null
	}
}
async function ignoreDetected(d) {
	try {
		await callService({ P: 'ignore_detected', C: d.key })
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.rS485.couldn_t') + (e.message || e)
		msgError.value = true
	}
}
async function scan(busId) {
	scanning.value = busId
	try {
		const r = await callService({ P: 'scan', B: busId, D: 1, H: 32 })
		found[busId] = r.found
	} catch (e) {
		msg.value = i18n.t('plugins.WorkshopRS485.common.could_not_search') + (e.message || e)
		msgError.value = true
	} finally {
		scanning.value = null
	}
}
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
.advanced :deep(.v-expansion-panel-text__wrap) {
	padding: 0 0 8px;
}
.advanced :deep(.v-expansion-panel-title) {
	min-height: 32px;
}
.bar-save {
	position: sticky;
	bottom: 0;
	padding: 8px 0;
	background: rgb(var(--v-theme-background));
	z-index: 1;
}
.command code {
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
}
</style>
