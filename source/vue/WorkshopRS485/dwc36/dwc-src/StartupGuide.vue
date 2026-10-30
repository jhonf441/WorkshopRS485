<template>
	<div>
		<div class="text-body-2 grey--text mb-3">
			{{ $t('plugins.WorkshopRS485.startupGuide.the_steps_tick_themselves_as_the') }}
		</div>
		<div v-for="(p, i) in steps" :key="p.id" class="step" :class="'step-' + p.state">
			<div class="step-icon">
				<v-icon :color="colorOf(p.state)">{{ iconOf(p.state) }}</v-icon>
				<div v-if="i < steps.length - 1" class="step-line" />
			</div>
			<div class="step-body">
				<div class="text-subtitle-2">{{ i + 1 }}. {{ p.title }}</div>
				<div class="text-body-2" :class="p.state === 'ok' ? 'grey--text' : ''">{{ p.detail }}</div>
				<div v-if="p.command && p.state !== 'ok'" class="command mt-1"><code>{{ p.command }}</code></div>
				<div v-if="p.items && p.items.length" class="d-flex flex-wrap mt-1" style="gap:6px">
					<v-chip v-for="it in p.items" :key="it.text" x-small outlined :color="it.color">{{ it.text }}</v-chip>
				</div>
				<v-btn v-if="p.button && p.state !== 'ok'" x-small outlined color="primary" class="mt-2" @click="action(p.button.action)">{{ p.button.text }}</v-btn>
			</div>
		</div>

		<v-expansion-panels flat class="mt-4">
			<v-expansion-panel>
				<v-expansion-panel-header class="px-0"><span><v-icon small left>mdi-book-open-variant</v-icon>{{ $t('plugins.WorkshopRS485.startupGuide.more_details_wiring_several_devices_duet') }}</span></v-expansion-panel-header>
				<v-expansion-panel-content>
					<div class="text-body-2 help">
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.wiring') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.usb_rs485_adapter_e_g_ft232rl') }}
							<b>{{ $t('plugins.WorkshopRS485.startupGuide.a_to_a_d_b_to') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.and_a_common_ground_gnd_if') }}</p>
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.several_devices_on_one_cable') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.all_at_the_same_baud_rate') }}</p>
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.duet_s_rs485') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.the_6hc_v1_02c_and_the') }}</p>
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.connect_another_device') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.another_device_text') }} <b>{{ $t('plugins.WorkshopRS485.common.no_axis') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.and_warns_you_then_you_set') }}</p>
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.another_adapter') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.plug_it_in_and_it_shows') }} <code>/dev/serial/by-id/</code>{{ $t('plugins.WorkshopRS485.startupGuide.which_does_not_change_if_you') }}</p>
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.device_types') }}</b> {{ $t('plugins.WorkshopRS485.startupGuide.t3d_servo_brings_its_own_logic') }}</p>
						<p><b>{{ $t('plugins.WorkshopRS485.startupGuide.from_macros_or_g_code') }}</b> <code>plugins.WorkshopRS485.data.rs485</code> {{ $t(hasActivity ? 'plugins.WorkshopRS485.startupGuide.returns_everything_as_json_faults_go' : 'plugins.WorkshopRS485.startupGuide.returns_everything_as_json_faults_go_no_activity') }}</p>
					</div>
				</v-expansion-panel-content>
			</v-expansion-panel>
		</v-expansion-panels>
	</div>
</template>

<script>
import i18n from '../../i18n'

'use strict'

// Commissioning guide: each step is evaluated with what the plugin publishes
// (config, ports, live state). estado: ok | falla | pendiente | na

import { states } from './api.js'
import { stepsGuide } from './guide-steps.js'
import { pathExists } from './workshop-ids.js' // the Lights and Activity plugins are optional: nothing about them when absent

export default {
	props: {
		cfg: Object,
		state: Object,
		ports: Object,
		backendLive: Boolean
	},
	computed: {
		hasActivity() {
			return pathExists(this.$router, '/Plugins/Activity');
		},
		// the steps are decided in guide-steps.js (the Devices tab card uses the same ones)
		steps() {
			return stepsGuide({
				cfg: this.cfg, state: this.state, ports: this.ports, backendLive: this.backendLive,
				t: (k, p) => i18n.t(k, p), pathExists: path => pathExists(this.$router, path), STATES: states
			});
		}
	},
	methods: {
		// a button of a step: refresh, go to a tab or add a device (the page does it)
		action(a) {
			if (a[0] === 'update') this.$emit('update');
			else if (a[0] === 'add') this.$emit('add');
			else if (a[0] === 'go') this.$emit('go', a[1]);
		},
		iconOf(e) {
			return { ok: 'mdi-check-circle', fault: 'mdi-alert-circle', pending: 'mdi-circle-outline', na: 'mdi-minus-circle-outline' }[e];
		},
		colorOf(e) {
			return { ok: 'success', fault: 'warning', pending: 'grey', na: 'grey' }[e];
		}
	}
};
</script>

<style scoped>
.step {
	display: flex;
	gap: 12px;
}
.step-icon {
	display: flex;
	flex-direction: column;
	align-items: center;
}
.step-line {
	flex: 1;
	width: 2px;
	min-height: 12px;
	margin: 2px 0;
	background: rgba(128, 128, 128, 0.35);
}
.step-body {
	padding-bottom: 16px;
	flex: 1;
	min-width: 0;
}
.step-pending .step-body {
	opacity: 0.6;
}
.command code {
	font-size: 12px;
	white-space: pre-wrap;
	word-break: break-all;
}
.help p {
	margin-bottom: 10px;
}
</style>
