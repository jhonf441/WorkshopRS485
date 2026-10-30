<template>
	<v-dialog :value="value" max-width="780" scrollable persistent :fullscreen="$vuetify.breakpoint.xsOnly" @input="$emit('input', $event)">
		<v-card v-if="form" class="editor-disp">
			<v-card-title class="py-3">
				<v-icon left>{{ newItem ? 'mdi-plus-circle-outline' : 'mdi-pencil' }}</v-icon>
				{{ newItem ? $t('plugins.WorkshopRS485.common.add_device') : $t('plugins.WorkshopRS485.common.edit') + (form.name || form.id) }}
				<v-spacer />
				<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_close')" icon small @click="$emit('input', false)"><v-icon>mdi-close</v-icon></v-btn>
			</v-card-title>
			<v-divider />
			<v-card-text class="pt-3">
				<!-- ===== Equipo ===== -->
				<div class="block">
					<div class="block-title"><v-icon small left>mdi-chip</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.device') }}</div>
					<v-row dense>
						<v-col cols="12" sm="5"><v-text-field v-model.trim="form.name" :label="$t('plugins.WorkshopRS485.deviceEditor.name_e_g_z_axis_servo')" dense outlined hide-details /></v-col>
						<v-col cols="12" sm="4">
							<v-select v-model="form.profile" :items="profiles" item-value="id" item-text="name" :label="$t('plugins.WorkshopRS485.deviceEditor.device_type')" dense outlined hide-details :disabled="!newItem" @change="changeProfile" />
						</v-col>
						<v-col cols="12" sm="3">
							<v-select v-model="form.axis" :items="optionsAxis" :label="$t('plugins.WorkshopRS485.deviceEditor.axis_it_moves')" dense outlined hide-details />
						</v-col>
					</v-row>
					<div v-if="descProfile" class="text-caption grey--text mt-1">{{ descProfile }}</div>
					<div v-if="newItem && form.profile === 't3d'" class="text-caption grey--text mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.other_device_json_hint') }}
						<a href="#" @click.prevent="form.profile = 'generic'; changeProfile('generic')">{{ $t('plugins.WorkshopRS485.deviceEditor.use_generic_modbus') }}</a>
					</div>
					<div v-if="form.axis" class="text-caption mt-1">
						<template v-if="form.axis">
							{{ $t('plugins.WorkshopRS485.deviceEditor.if_this_device_fails_the_job') }} <b>{{ $t('plugins.WorkshopRS485.deviceEditor.fault_word') }}</b> {{ $t(hasLights ? 'plugins.WorkshopRS485.deviceEditor.fault_explain' : 'plugins.WorkshopRS485.deviceEditor.fault_explain_no_lights', { axis: form.axis }) }}
						</template>
					</div>
				</div>

				<!-- ===== Conexion ===== -->
				<div class="block">
					<div class="block-title"><v-icon small left>mdi-serial-port</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.connection') }}</div>
					<v-row dense>
						<v-col cols="12" sm="6">
							<v-select v-model="form.bus" :items="buses" item-value="id" :item-text="textBus" :label="$t('plugins.WorkshopRS485.deviceEditor.bus_adapter')" dense outlined hide-details />
						</v-col>
						<v-col cols="6" sm="3"><v-text-field v-model.number="form.address" type="number" min="1" max="247" :label="$t('plugins.WorkshopRS485.deviceEditor.address')" dense outlined hide-details /></v-col>
					</v-row>
					<div v-if="!buses.length" class="text-caption warning--text mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.there_are_no_buses_yet_create') }} <b>{{ $t('plugins.WorkshopRS485.common.buses_and_adapters') }}</b>.
					</div>
					<div v-if="crashAddress" class="text-caption warning--text mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.address_used_by', { n: form.address }) }} <b>{{ crashAddress.name || crashAddress.id }}</b> {{ $t('plugins.WorkshopRS485.deviceEditor.on_this_bus') }}
					</div>
					<div class="d-flex align-center flex-wrap mt-2" style="gap:8px">
						<v-btn x-small outlined :loading="scanning" :disabled="!form.bus" @click="$emit('scan', form.bus)">
							<v-icon x-small left>mdi-radar</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.scan_bus_addresses_1_32') }}
						</v-btn>
						<template v-if="found[form.bus]">
							<span class="text-caption">{{ $t('plugins.WorkshopRS485.common.answering') }}</span>
							<v-chip v-for="a in found[form.bus]" :key="a" x-small :color="a === form.address ? 'primary' : ''" @click="form.address = a">{{ a }}</v-chip>
							<span v-if="!found[form.bus].length" class="text-caption warning--text">{{ $t('plugins.WorkshopRS485.common.none') }}</span>
						</template>
					</div>

					<!-- exact values for the T3D panel -->
					<v-sheet v-if="form.profile === 't3d' && busSel" outlined rounded class="pa-2 mt-3 t3d-panel">
						<div class="text-caption mb-1">{{ $t('plugins.WorkshopRS485.deviceEditor.on_the_servo_panel_set_exactly') }}</div>
						<div class="t3d-values">
							<div><span class="p">P-181</span><span class="v">{{ form.address || '?' }}</span><span class="d">{{ $t('plugins.WorkshopRS485.deviceEditor.address_lower') }}</span></div>
							<div><span class="p">P-182</span><span class="v">{{ t3dBaud.value }}</span><span class="d">{{ t3dBaud.text }}</span></div>
							<div><span class="p">P-183</span><span class="v">{{ t3dFormat.value }}</span><span class="d">{{ t3dFormat.text }}</span></div>
						</div>
						<div v-if="t3dBaud.value === '?' || t3dFormat.value === '?'" class="text-caption warning--text mt-1">
							{{ $t('plugins.WorkshopRS485.deviceEditor.the_t3d_servo_only_supports_4800') }}
						</div>
						<div class="text-caption grey--text mt-1">{{ $t('plugins.WorkshopRS485.deviceEditor.after_changing_them_on_the_panel') }}</div>
					</v-sheet>
				</div>

				<!-- ===== Vigilancia ===== -->
				<div class="block">
					<div class="block-title"><v-icon small left>mdi-shield-check-outline</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.monitoring') }}</div>
					<v-row dense>
						<v-col cols="12" sm="6">
							<v-select v-model="form.options.action_fault" :items="actionsFault" :label="$t('plugins.WorkshopRS485.deviceEditor.on_a_fault')" dense outlined hide-details />
						</v-col>
						<v-col cols="12" sm="6" v-if="form.options.action_fault === 'pause'">
							<v-select v-model="form.options.in_live" :items="actionsLive" :label="$t('plugins.WorkshopRS485.deviceEditor.if_the_job_is_live_no')" dense outlined hide-details />
						</v-col>
						<v-col cols="12" sm="6" v-if="form.axis && form.options.action_fault !== 'nothing'">
							<v-select v-model="form.options.in_motion" :items="actionsMotion" :label="$t('plugins.WorkshopRS485.deviceEditor.if_fails_while_axis_moves', { axis: form.axis })" dense outlined hide-details />
						</v-col>
						<v-col cols="12" sm="6" class="d-flex align-center">
							<v-switch v-model="form.options.pause_without_com" :label="$t('plugins.WorkshopRS485.deviceEditor.losing_communication_is_also_a_fault')" dense hide-details class="mt-0" />
						</v-col>
					</v-row>
					<div class="text-caption grey--text mt-1">
						{{ $t('plugins.WorkshopRS485.deviceEditor.a_job_run_from_a_file') }}
					</div>
					<v-row dense class="mt-2">
						<v-col cols="6" sm="3"><v-text-field v-model.number="form.options.poll_s" type="number" step="0.1" min="0.1" :label="$t('plugins.WorkshopRS485.deviceEditor.read_every_s')" dense outlined hide-details /></v-col>
						<v-col cols="6" sm="3"><v-text-field v-model.number="form.options.faults_com_limit" type="number" min="1" :label="$t('plugins.WorkshopRS485.deviceEditor.consecutive_comm_failures')" dense outlined hide-details /></v-col>
						<template v-if="form.profile === 't3d'">
							<v-col cols="6" sm="3"><v-text-field v-model.number="form.options.torque_max" type="number" :label="$t('plugins.WorkshopRS485.deviceEditor.max_torque')" dense outlined hide-details /></v-col>
							<v-col cols="6" sm="3"><v-text-field v-model="form.options.current_max" type="number" step="0.1" :label="$t('plugins.WorkshopRS485.deviceEditor.max_current_a')" :placeholder="$t('plugins.WorkshopRS485.deviceEditor.empty_means_no')" dense outlined hide-details /></v-col>
						</template>
					</v-row>

					<!-- JSON equipment profile (2026-10-10): optional; fills the tables
					     of parameters and alarms and the watched registers -->
					<template v-if="form.profile === 'generic'">
						<div class="text-subtitle-2 mt-3 mb-1">{{ $t('plugins.WorkshopRS485.common.device_profile') }} <span class="grey--text font-weight-regular">{{ $t('plugins.WorkshopRS485.deviceEditor.optional') }}</span></div>
						<div class="text-caption grey--text mb-2">
							{{ $t('plugins.WorkshopRS485.deviceEditor.a_json_file_with_the_device') }}
						</div>
						<div class="d-flex flex-wrap align-center" style="gap:8px">
							<v-btn small outlined :loading="profileBusy === 'import'" @click="$refs.fileProfile.click()"><v-icon small left>mdi-file-import-outline</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.import_json') }}</v-btn>
							<v-btn small text :loading="profileBusy === 'example'" @click="exampleProfile()"><v-icon small left>mdi-file-eye-outline</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.example_t3d_servo') }}</v-btn>
							<v-btn v-if="form.options.profile_device" small text :color="armedProfile ? 'error' : ''" @click="removeProfile()">
								{{ armedProfile ? $t('plugins.WorkshopRS485.deviceEditor.tap_again_to_remove_it') : $t('plugins.WorkshopRS485.deviceEditor.remove_profile') }}
							</v-btn>
							<input ref="fileProfile" type="file" accept=".json,application/json" style="display:none" @change="importProfile">
						</div>
						<div v-if="form.options.profile_device" class="text-body-2 mt-2">
							<v-icon small color="success" class="mr-1">mdi-check-circle</v-icon>{{ summaryProfile }}
						</div>
						<div v-if="crashBus" class="text-caption warning--text mt-1">{{ crashBus }}</div>
						<div v-if="profileMsg" class="text-caption mt-1" :class="profileError ? 'error--text' : 'grey--text'">{{ profileMsg }}</div>
						<ul v-if="profileNotices.length" class="text-caption warning--text mt-1 profile-notices">
							<li v-for="(a, i) in profileNotices.slice(0, 12)" :key="i">{{ a }}</li>
							<li v-if="profileNotices.length > 12">{{ $t('plugins.WorkshopRS485.deviceEditor.and_n_more_warnings', { n: profileNotices.length - 12 }) }}</li>
						</ul>
					</template>

					<!-- registros del generico -->
					<template v-if="form.profile === 'generic'">
						<div class="text-subtitle-2 mt-3 mb-1">{{ $t('plugins.WorkshopRS485.deviceEditor.registers_to_read') }}</div>
						<div v-for="(r, i) in form.options.records" :key="i" class="reg-row">
							<v-text-field v-model.trim="r.name" :label="$t('plugins.WorkshopRS485.common.name')" dense outlined hide-details />
							<v-text-field v-model.number="r.record" type="number" :label="$t('plugins.WorkshopRS485.common.register')" dense outlined hide-details />
							<v-select v-model="r.func" :items="[{ text: '3 holding', value: 3 }, { text: '4 input', value: 4 }]" :label="$t('plugins.WorkshopRS485.common.function')" dense outlined hide-details />
							<v-text-field v-model.number="r.scale" type="number" step="any" :label="$t('plugins.WorkshopRS485.deviceEditor.scale')" dense outlined hide-details />
							<v-text-field v-model.trim="r.unit" :label="$t('plugins.WorkshopRS485.deviceEditor.unit')" dense outlined hide-details />
							<v-text-field v-model="r.min" type="number" :label="$t('plugins.WorkshopRS485.deviceEditor.min')" dense outlined hide-details />
							<v-text-field v-model="r.max" type="number" :label="$t('plugins.WorkshopRS485.deviceEditor.max')" dense outlined hide-details />
							<v-checkbox v-model="r.with_sign" label="±" dense hide-details class="mt-0" />
							<v-checkbox v-model="r.writable" :label="$t('plugins.WorkshopRS485.common.write')" dense hide-details class="mt-0" />
							<v-btn :aria-label="$t('plugins.WorkshopRS485.shared.aria_delete')" icon small @click="form.options.records.splice(i, 1)"><v-icon small>mdi-delete</v-icon></v-btn>
						</div>
						<v-btn x-small text color="primary" @click="form.options.records.push({ name: '', record: null, func: 3, scale: 1, unit: '', with_sign: false, writable: false })">
							<v-icon x-small left>mdi-plus</v-icon>{{ $t('plugins.WorkshopRS485.deviceEditor.add_register') }}
						</v-btn>
					</template>
				</div>
				<div v-if="msg" class="text-caption mt-2" :class="msgError ? 'error--text' : 'success--text'">{{ msg }}</div>
			</v-card-text>
			<v-divider />
			<v-card-actions class="flex-wrap" style="gap:6px">
				<v-switch v-model="form.active" :label="$t('plugins.WorkshopRS485.deviceEditor.active')" dense hide-details class="mt-0 ml-2 mr-4" />
				<v-switch :input-value="!!form.absent" :disabled="!form.active" :label="$t('plugins.WorkshopRS485.deviceEditor.absent_on_purpose')" dense hide-details class="mt-0 mr-4"
					:title="$t('plugins.WorkshopRS485.deviceEditor.absent_hint')" @change="putAbsent" />
				<v-spacer />
				<v-btn v-if="!newItem" small text :disabled="!can('rs485.save')" :color="armed ? 'error' : 'grey'" @click="armDelete">
					{{ armed ? $t('plugins.WorkshopRS485.deviceEditor.tap_again_to_remove_it') : $t('plugins.WorkshopRS485.deviceEditor.remove_device') }}
				</v-btn>
				<v-btn small text @click="$emit('input', false)">{{ $t('plugins.WorkshopRS485.common.cancel') }}</v-btn>
				<v-btn small color="primary" :loading="saving" :disabled="!valid || !can('rs485.save')" @click="$emit('save', copy(form))">{{ $t('plugins.WorkshopRS485.common.save') }}</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script>
import i18n from '../../i18n'

'use strict'

// Editor de un dispositivo RS485 en un dialogo: Equipo / Conexion / Vigilancia.
// El padre guarda (API rs485.save) y hace la busqueda de direcciones.

import { mapActions } from 'vuex'
import { BAUDS_T3D, PARITY_T3D, optionsOf, callService, canMixin } from './api.js'
import { pathExists } from './workshop-ids.js' // the Lights plugin is optional: nothing about it when absent

function copy(o) {
	return JSON.parse(JSON.stringify(o));
}

export default {
	mixins: [canMixin],
	props: {
		value: Boolean,
		initial: Object,	// dispositivo a editar (copia) o borrador del nuevo
		newItem: Boolean,
		buses: Array,
		devices: Array,
		profiles: Array,
		found: Object,
		scanning: Boolean,
		saving: Boolean,
		msg: String,
		msgError: Boolean
	},
	data() {
		return {
			form: null,
			armed: false,
			armedTimer: null,
			armedProfile: false,
			profileBusy: null,
			profileMsg: '',
			profileError: false,
			profileNotices: [],
			actionsFault: [
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.pause_the_job_and_warn'), value: 'pause' },
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.just_warn'), value: 'notify' },
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.nothing_just_show'), value: 'nothing' }
			],
			actionsMotion: [
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.just_warn'), value: 'notify' },
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.emergency_stop_m112'), value: 'emergency' }
			],
			actionsLive: [
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.just_warn_you_pause_in_the'), value: 'notify' },
				{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.emergency_stop_m112'), value: 'emergency' }
			]
		};
	},
	computed: {
		hasLights() {
			return pathExists(this.$router, '/Plugins/Lights');
		},
		optionsAxis() {
			const ejes = ((this.$store.state.machine.model.move || {}).axes || []).filter(a => a && a.visible !== false).map(a => a.letter);
			const current = this.form && this.form.axis;
			if (current && !ejes.includes(current)) {
				ejes.push(current);
			}
			return [{ text: i18n.t('plugins.WorkshopRS485.deviceEditor.none'), value: '' }, ...ejes.map(l => ({ text: i18n.t('plugins.WorkshopRS485.deviceEditor.axis_name', { axis: l }), value: l }))];
		},
		descProfile() {
			const p = this.profiles.find(x => x.id === (this.form && this.form.profile));
			return p ? p.description : '';
		},
		busSel() {
			return this.buses.find(b => b.id === this.form.bus) || null;
		},
		t3dBaud() {
			const i = BAUDS_T3D.indexOf(Number(this.busSel.baud));
			return i < 0 ? { value: '?', text: i18n.t('plugins.WorkshopRS485.deviceEditor.baud_not_possible', { baud: this.busSel.baud }) } : { value: i, text: i18n.t('plugins.WorkshopRS485.deviceEditor.baud_n', { baud: this.busSel.baud }) };
		},
		t3dFormat() {
			const par = this.busSel.parity || 'N';
			const v = PARITY_T3D[par];
			if (v == null || Number(this.busSel.bits_stop || 1) !== 1) {
				return { value: '?', text: i18n.t('plugins.WorkshopRS485.deviceEditor.format_not_possible', { format: '8' + par + (this.busSel.bits_stop || 1) }) };
			}
			return { value: v, text: `8${par}1` };
		},
		crashAddress() {
			const f = this.form;
			return this.devices.find(d => d.id !== f.id && d.bus === f.bus && Number(d.address) === Number(f.address)) || null;
		},
		summaryProfile() {
			const pe = this.form.options.profile_device || {};
			const e = pe.device || {};
			const nombre = [e.mark, e.model].filter(Boolean).join(' ') || i18n.t('plugins.WorkshopRS485.deviceEditor.profile_loaded');
			const p = pe.params || [];
			const vig = p.filter(r => r.watch).length;
			return i18n.t('plugins.WorkshopRS485.deviceEditor.profile_summary', { name: nombre, n: p.length, watched: vig, alarms: (pe.alarms || []).length }) +
				(pe.alarm ? ', ' + i18n.t('plugins.WorkshopRS485.deviceEditor.alarm_code_in_register', { n: pe.alarm.record }) : ', ' + i18n.t('plugins.WorkshopRS485.deviceEditor.no_alarm_register'));
		},
		crashBus() {
			const e = ((this.form.options.profile_device || {}).device) || {};
			const b = this.busSel;
			if (!b || !e.baud) {
				return '';
			}
			const asks = `${e.baud} 8${e.parity || 'N'}${e.bits_stop || 1}`;
			const tiene = `${b.baud} 8${b.parity || 'N'}${b.bits_stop || 1}`;
			return asks === tiene ? '' : i18n.t('plugins.WorkshopRS485.deviceEditor.bus_mismatch', { wants: asks, has: tiene });
		},
		valid() {
			const f = this.form;
			return !!(f && f.profile && f.bus && f.address >= 1 && f.address <= 247 && !this.crashAddress);
		}
	},
	watch: {
		value: {
			immediate: true,
			handler(v) {
				if (v && this.initial) {
					this.form = copy(this.initial);
					this.armed = false;
				}
			}
		}
	},
	beforeDestroy() {
		clearTimeout(this.armedTimer);
	},
	methods: {
		putAbsent(v) {
			if (v) {
				this.$set(this.form, 'absent', true);
			} else {
				this.$delete(this.form, 'absent');
			}
		},
		copy: copy,
		textBus(b) {
			return `${b.name || b.id} (${b.baud} 8${b.parity || 'N'}${b.bits_stop || 1})`;
		},
		...mapActions('machine', ['sendCode']),
		applyProfile(r, origen) {
			const o = this.form.options;
			const vig = (r.options && r.options.records) || [];
			const key = x => (x.func || 3) + '-' + x.record;
			const del = new Set(vig.map(key));
			// those loaded by hand that the profile does not bring stay
			const manuales = (o.records || []).filter(x => x.record !== null && x.record !== '' && !del.has(key(x)));
			this.$set(o, 'profile_device', r.profile);
			this.$set(o, 'records', [...vig, ...manuales]);
			const e = r.profile.device || {};
			if (this.newItem && e.address) {
				this.form.address = e.address;
			}
			if (this.newItem && !this.form.name && (e.mark || e.model)) {
				this.form.name = [e.mark, e.model].filter(Boolean).join(' ');
			}
			this.profileNotices = r.notices || [];
			this.profileError = false;
			this.profileMsg = i18n.t('plugins.WorkshopRS485.deviceEditor.profile_applied', { origin: origen }) + (manuales.length ? ' ' + i18n.t('plugins.WorkshopRS485.deviceEditor.n_registers_kept', { n: manuales.length }) : '');
		},
		async importProfile(ev) {
			const f = ev.target.files && ev.target.files[0];
			ev.target.value = '';
			if (!f) {
				return;
			}
			this.profileBusy = 'import';
			this.profileNotices = [];
			try {
				if (f.size > 2 * 1024 * 1024) {
					throw new Error(i18n.t('plugins.WorkshopRS485.deviceEditor.file_over_2mb'));
				}
				let data;
				try {
					data = JSON.parse(await f.text());
				} catch (e) {
					throw new Error(i18n.t('plugins.WorkshopRS485.deviceEditor.not_valid_json', { error: e.message }));
				}
				const r = await callService(this.sendCode, { P: 'profile_check', J: data });
				this.applyProfile(r, i18n.t('plugins.WorkshopRS485.deviceEditor.profile_imported_from', { file: f.name }));
			} catch (e) {
				this.profileError = true;
				this.profileMsg = i18n.t('plugins.WorkshopRS485.deviceEditor.could_not_import', { error: e.message });
			} finally {
				this.profileBusy = null;
			}
		},
		async exampleProfile() {
			this.profileBusy = 'example';
			try {
				const r = await callService(this.sendCode, { P: 'profile_example' });
				const url = URL.createObjectURL(new Blob([JSON.stringify(r.profile, null, 2) + '\n'], { type: 'application/json' }));
				const a = document.createElement('a');
				a.href = url;
				a.download = 'example-servo-T3D.rs485.json';
				document.body.appendChild(a);
				a.click();
				a.remove();
				setTimeout(() => URL.revokeObjectURL(url), 2000);
				this.profileError = false;
				this.profileMsg = i18n.t('plugins.WorkshopRS485.deviceEditor.the_example_was_downloaded_open_it');
			} catch (e) {
				this.profileError = true;
				this.profileMsg = i18n.t('plugins.WorkshopRS485.deviceEditor.could_not_build_example', { error: e.message });
			} finally {
				this.profileBusy = null;
			}
		},
		removeProfile() {
			if (!this.armedProfile) {
				this.armedProfile = true;
				setTimeout(() => { this.armedProfile = false; }, 4000);
				return;
			}
			this.armedProfile = false;
			this.$delete(this.form.options, 'profile_device');
			this.profileNotices = [];
			this.profileError = false;
			this.profileMsg = i18n.t('plugins.WorkshopRS485.deviceEditor.profile_removed_the_watched_registers_stay');
		},
		changeProfile(p) {
			this.form.options = optionsOf(this.profiles, p);
		},
		armDelete() {
			if (this.armed) {
				this.armed = false;
				this.$emit('remove', this.form.id);
				return;
			}
			this.armed = true;
			clearTimeout(this.armedTimer);
			this.armedTimer = setTimeout(() => { this.armed = false; }, 4000);
		}
	}
};
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
