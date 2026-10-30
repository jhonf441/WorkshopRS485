<template>
	<!-- Start-up (2026-10-16): a quiet strip on the page; the card itself is a dialog with one card per FUNCTION.
	     The files and things this page expects from the machine, and the state of each:
	     green = configured, orange = only the example, red = missing, grey = does not apply to your machine.
	     The texts are the ones of the plugin that uses it: plugins.<plugin>.startup.* (generic ones + the labels of the rows).
	     Nothing here overwrites a file: "Create the example" asks the service, which never overwrites.
	     Assistant (2026-10-15): a row may carry que / paraQue / siFalta (plain explanation) and asistente (questions +
	     template). The pure decisions are in startup-wizard.js; the format is in docs-internal/STARTUP-WIZARD.md.
	     A row may carry grupo (id) + grupoEtiqueta / grupoDescripcion (keys) + grupoIcono (mdi icon): rows of one group are one card. -->
	<span v-if="visible" class="startup-panel">
		<!-- the entry is a chip for the page header (2026-10-18): rocket + name, green when ready, orange with the number of pending
		     items; the tooltip says it in full. It opens the dialog. -->
		<!-- 2026-10-23: only while something is pending it is a chip; when everything is ready it is a quiet icon (same dialog) -->
		<v-chip v-if="!summary.ready" small outlined color="warning" class="startup-chip" :title="chipHelp" @click="openDialog">
			<v-icon small left>mdi-rocket-launch-outline</v-icon>{{ tt('chip_pending', { n: summary.pending }) }}
		</v-chip>
		<v-btn v-else icon small class="startup-chip" :title="chipHelp" @click="openDialog">
			<v-icon small color="success">mdi-rocket-launch-outline</v-icon>
		</v-btn>

		<v-dialog v-model="dialog" max-width="600" scrollable :fullscreen="$vuetify.breakpoint.xsOnly">
			<v-card class="startup-dialog">
				<v-card-title class="d-flex align-center pb-2 startup-title">
					<v-avatar size="42" tile class="rounded-lg mr-3 startup-icon-title"><v-icon color="primary">mdi-rocket-launch-outline</v-icon></v-avatar>
					<div class="flex-grow-1" style="min-width: 0">
						<div class="text-h6">{{ tt('title') }}</div>
						<div class="text-caption startup-sub">{{ tt('modal_sub') }}</div>
					</div>
					<v-btn icon class="flex-shrink-0" :title="tt('close')" :aria-label="tt('close')" @click="dialog = false"><v-icon>mdi-close</v-icon></v-btn>
				</v-card-title>
				<v-divider />
				<v-card-text class="pt-4 startup-body">

		<!-- the assistant: one pending row at a time -->
		<div v-if="wizard" class="startup-wizard">
			<template v-if="wizard.est.end">
				<div class="text-subtitle-2">{{ tt('assist_done_title') }}</div>
				<div class="text-body-2">{{ summaryWizard.ready ? tt('assist_done_ready') : tt('assist_done_left', { n: summaryWizard.pending.length }) }}</div>
				<div v-if="summaryWizard.lists.length" class="text-body-2">{{ tt('assist_done_ok', { n: summaryWizard.lists.length }) }}</div>
				<div v-if="summaryWizard.skipped.length" class="text-body-2">{{ tt('assist_done_skipped', { n: summaryWizard.skipped.length }) }}</div>
				<div v-if="wizard.created.length" class="text-body-2">{{ tt('assist_done_created') }} <code v-for="p in wizard.created" :key="p" class="startup-path mr-1">{{ wrapPath(p) }}</code></div>
				<div class="d-flex flex-wrap mt-2 startup-buttons">
					<v-btn small @click="move('previous')">{{ tt('assist_prev') }}</v-btn>
					<v-btn small @click="refresh(false)">{{ tt('assist_recheck') }}</v-btn>
					<v-btn small @click="closeWizard">{{ tt('assist_close') }}</v-btn>
				</div>
			</template>
			<template v-else-if="stepCurrent">
				<div class="d-flex align-center flex-wrap">
					<v-icon x-small :color="color(stepCurrent.state)" class="mr-2">mdi-circle</v-icon>
					<span class="text-subtitle-2 flex-grow-1">{{ stepCurrent.def.title || tt(stepCurrent.def.label) }} <span class="startup-sub">- {{ textState(stepCurrent) }}</span></span>
					<span class="text-caption startup-sub">{{ tt('assist_step', { i: wizard.est.i + 1, n: wizard.est.ids.length }) }}</span>
				</div>
				<v-progress-linear :value="stepPct" color="primary" rounded height="6" class="my-2" />
				<div v-if="missingKey(stepCurrent)" class="text-body-2 mb-1"><b>{{ missingSentence(stepCurrent) }}</b></div>
				<code v-if="destination(stepCurrent)" class="startup-path">{{ wrapPath(destination(stepCurrent)) }}</code>
				<div v-if="explanation(stepCurrent.def)" class="startup-exp text-body-2">
					<div v-for="par in paragraphs(stepCurrent.def)" :key="par.key"><b>{{ tt(par.key) }}:</b> {{ tt(par.text) }}</div>
				</div>

				<!-- result of a write -->
				<div v-if="wizard.view === 'result'" class="mt-2">
					<div v-for="m in wizard.msgs" :key="m.key" class="text-body-2">{{ ts(m.key, m.params) }}</div>
					<div class="d-flex flex-wrap mt-2 startup-buttons">
						<v-btn v-if="!isApply(stepCurrent)" small @click="editPath(wizard.plan ? wizard.plan.path : destination(stepCurrent))">{{ tt('edit') }}</v-btn>
						<v-btn small @click="refresh(false)">{{ tt('assist_recheck') }}</v-btn>
					</div>
				</div>

				<!-- preview of the file -->
				<div v-else-if="wizard.view === 'preview' && stepCurrent.def.wizard" class="mt-2">
					<div class="text-subtitle-2">{{ tt('preview_title', { file: destination(stepCurrent) }) }}</div>
					<pre class="startup-pre"><div v-for="(l, i) in codeLines(wizard.prev.text)" :key="i" class="startup-line" :class="l.active ? 'startup-line-active' : 'startup-line-comment'">{{ l.text || ' ' }}</div></pre>
					<div v-if="wizard.prev.commented" class="warning--text text-body-2">{{ tt('warn_moves', { n: wizard.prev.commented }) }}</div>
					<div v-if="wizard.prev.active" class="text-body-2">{{ tt('warn_active') }}</div>
					<div class="text-body-2">{{ ts(wizard.plan.reason, { file: destination(stepCurrent), backup: wizard.plan.backup || '', target: wizard.plan.path }) }}</div>
					<div v-if="wizard.failure" class="error--text text-body-2">{{ wizard.failure }}</div>
					<div class="d-flex flex-wrap mt-2 startup-buttons">
						<v-btn small @click="wizard.view = 'question'; wizard.failure = null">{{ tt('back') }}</v-btn>
						<v-btn small color="success" :disabled="wizard.writing" @click="save(stepCurrent)">{{ wizard.writing ? tt('saving') : tt('save') }}</v-btn>
					</div>
				</div>

				<!-- questions -->
				<div v-else-if="stepCurrent.def.wizard" class="mt-2">
					<div class="text-body-2 mb-2">{{ tt('questions_intro') }}</div>
					<template v-for="q in questionsVisible">
						<div :key="q.id" class="mb-1">
							<v-select v-if="q.kind === 'list'" v-model="wizard.resp[q.id]" :items="options(q)" :label="tt(q.label)" :hint="q.help ? tt(q.help) : ''" persistent-hint dense outlined :error-messages="errorOf(q)" />
							<div v-else-if="q.kind === 'si_no'">
								<div class="text-body-2">{{ tt(q.label) }}</div>
								<div class="d-flex startup-buttons">
									<v-btn small :color="wizard.resp[q.id] ? 'success' : ''" @click="$set(wizard.resp, q.id, true)">{{ tt('yes') }}</v-btn>
									<v-btn small :color="!wizard.resp[q.id] ? 'success' : ''" @click="$set(wizard.resp, q.id, false)">{{ tt('no') }}</v-btn>
								</div>
								<div v-if="q.help" class="text-caption grey--text">{{ tt(q.help) }}</div>
							</div>
							<v-text-field v-else v-model="wizard.resp[q.id]" :label="tt(q.label)" :hint="q.help ? tt(q.help) : ''" persistent-hint dense outlined :inputmode="q.kind === 'number' ? 'decimal' : 'text'" enterkeyhint="done" :error-messages="errorOf(q)" @keydown.enter="$event.target.blur()" />
						</div>
					</template>
					<div v-if="wizard.failure" class="error--text text-body-2">{{ wizard.failure }}</div>
				</div>

				<!-- a row without assistant: the example, the editor, or only the explanation -->
				<div v-else class="mt-2 d-flex flex-wrap align-center startup-buttons">
					<v-btn v-if="stepCurrent.file && stepCurrent.state === 'missing' && stepCurrent.exists" small color="primary" :title="tt('make_tip')" @click="create(stepCurrent)">{{ tt('make') }}</v-btn>
					<v-btn v-else-if="stepCurrent.file && stepCurrent.state !== 'missing'" small color="primary" :title="tt('edit_tip')" @click="edit(stepCurrent)">{{ tt('edit') }}</v-btn>
					<div v-else-if="manual(stepCurrent)" style="width: 100%">
						<div class="text-subtitle-2 mb-1">{{ tt('manual_title') }}</div>
						<ol class="text-body-2 startup-steps"><li v-for="s in manual(stepCurrent).steps" :key="s">{{ tt(s) }}</li></ol>
						<pre v-if="manual(stepCurrent).copy" class="startup-pre"><div class="startup-line startup-line-active">{{ manual(stepCurrent).copy }}</div></pre>
						<div class="d-flex flex-wrap startup-buttons mt-1">
							<v-btn v-if="manual(stepCurrent).copy" small outlined @click="copyText(manual(stepCurrent).copy)">{{ copied ? tt('copied') : tt('copy') }}</v-btn>
							<v-btn small color="primary" :disabled="wizard.writing" @click="checkManual(stepCurrent)">{{ wizard.writing ? tt('checking') : tt('manual_done') }}</v-btn>
						</div>
						<div v-if="wizard.failure" class="error--text text-body-2 mt-1">{{ wizard.failure }}</div>
					</div>
					<template v-else>
						<span class="text-body-2">{{ tt('assist_no_action') }}</span>
						<v-btn small @click="refresh(false)">{{ tt('assist_recheck') }}</v-btn>
					</template>
				</div>

				<div class="d-flex flex-wrap mt-3 startup-buttons startup-nav">
					<v-btn v-if="wizard.view === 'question' && stepCurrent.def.wizard && !isApply(stepCurrent)" small color="primary" class="startup-btn" @click="viewPreview(stepCurrent)">{{ tt('preview') }}</v-btn>
					<v-btn v-if="wizard.view === 'question' && isApply(stepCurrent)" small color="primary" class="startup-btn" :disabled="wizard.writing" @click="applyStep(stepCurrent)">{{ wizard.writing ? tt('saving') : tt('apply_save') }}</v-btn>
					<v-btn v-if="notUsing(stepCurrent)" small outlined class="startup-btn" :title="tt('not_using_tip')" @click="skipNotUsing(stepCurrent)">{{ tt('not_using', { name: notUsingName(stepCurrent) }) }}</v-btn>
					<v-btn small text class="startup-btn" :title="tt('assist_pause_tip')" @click="dialog = false">{{ tt('assist_pause') }}</v-btn>
					<v-btn v-if="wizard.est.ids.length > 1" small :disabled="wizard.est.i === 0" @click="move('previous')">{{ tt('assist_prev') }}</v-btn>
					<v-btn v-if="wizard.est.ids.length > 1" small @click="move('skip')">{{ tt('assist_skip') }}</v-btn>
					<v-btn v-if="wizard.est.ids.length > 1" small @click="move(isPending(stepCurrent) ? 'next' : 'done')">{{ tt('assist_next') }}</v-btn>
					<v-btn small :color="wizard.est.ids.length > 1 ? '' : 'primary'" @click="closeWizard">{{ tt(wizard.est.ids.length > 1 ? 'assist_close' : 'assist_back_list') }}</v-btn>
				</div>
			</template>
		</div>

		<div v-else>
			<!-- progress -->
			<div class="d-flex align-baseline mb-1">
				<span class="text-subtitle-1 font-weight-medium flex-grow-1">{{ summary.ready ? tt('modal_all_ready') : tt('modal_progress', { a: summary.total - summary.pending, b: summary.total }) }}</span>
				<span class="text-caption" :class="summary.ready ? 'success--text' : 'warning--text'">{{ summary.ready ? tt('summary_ready') : tt('summary_pending', { n: summary.pending }) }}</span>
			</div>
			<v-progress-linear :value="percentage" :color="summary.ready ? 'success' : 'primary'" rounded height="8" class="mb-2" />
			<div class="text-caption startup-sub mb-3">{{ summary.ready ? tt('modal_ready_hint') : tt('modal_hint') }}</div>
			<div v-if="missingList.length" class="startup-missing mb-3">
				<div class="text-subtitle-2 mb-1">{{ tt('missing_title') }}</div>
				<ul class="text-body-2 startup-missing-list">
					<li v-for="m in missingList" :key="m.id">{{ missingSentence(m) }}</li>
				</ul>
			</div>
			<v-btn v-if="stepsPending.length" block large color="primary" class="mb-4 startup-btn" :title="tt('assist_tip')" @click="startWizard(null)"><v-icon small left>mdi-map-marker-path</v-icon>{{ wizard ? tt('guide_resume') : tt('guide_button') }}</v-btn>

			<v-card v-for="g in groupsShown" :key="g.id" outlined class="mb-3 startup-group" :class="'startup-g-' + g.state">
				<div class="d-flex align-start pa-3">
					<v-avatar size="44" tile class="rounded-lg mr-3 flex-shrink-0 startup-icon" :class="'startup-icon-' + g.state"><v-icon :color="color(g.state)">{{ g.icon }}</v-icon></v-avatar>
					<div class="flex-grow-1" style="min-width: 0">
						<div class="text-subtitle-1 font-weight-medium">{{ g.title || tt(g.label) }}</div>
						<div v-if="g.description" class="text-caption startup-sub">{{ tt(g.description) }}</div>
					</div>
					<v-chip small label outlined :color="color(g.state)" class="ml-2 flex-shrink-0 font-weight-medium" :class="'startup-state-' + g.state">{{ tt('chip_' + g.state) }}</v-chip>
				</div>
				<div class="px-3 pb-1">
					<div v-for="f in g.rows" :key="f.id" class="d-flex align-center flex-wrap startup-row rounded px-2" :title="f.def.help && g.rows.length === 1 ? tt(f.def.help) : ''">
						<v-icon x-small :color="color(f.state)" class="mr-2">mdi-circle</v-icon>
						<span class="text-body-2 flex-grow-1 startup-rowtext"><template v-if="g.rows.length > 1">{{ f.def.title || tt(f.def.label) }} - </template><span :class="'startup-text-' + f.state">{{ textState(f) }}</span></span>
						<v-btn v-if="f.def.action && f.state !== 'configured' && f.state !== 'na'" small outlined color="primary" @click="$emit('action', f.def.action)">{{ f.def.actionText }}</v-btn>
						<v-btn v-if="f.file && (f.state === 'configured' || f.state === 'example')" small outlined :title="tt('edit_tip')" @click="edit(f)">{{ tt('edit') }}</v-btn>
						<v-btn v-else-if="f.file && f.state === 'missing' && f.exists && !f.def.wizard" small outlined :title="tt('make_tip')" @click="create(f)">{{ tt('make') }}</v-btn>
					</div>
				</div>
				<div class="d-flex align-center flex-wrap px-2 pb-2 pt-1 startup-buttons">
					<v-btn v-if="idsWizard(g).length" color="primary" class="startup-btn" :title="tt('create_help_tip')" @click="startWizard(idsWizard(g))">{{ tt('create_help') }}</v-btn>
					<v-btn v-if="g.rows.some(f => explanation(f.def))" text small color="primary" @click="$set(explained, g.id, !explained[g.id])">{{ explained[g.id] ? tt('what_is_hide') : tt('what_is') }}</v-btn>
					<v-spacer />
					<v-btn text small :title="tt('hide_tip')" @click="hideGroup(g)">{{ tt('hide') }}</v-btn>
				</div>
				<div v-if="explained[g.id]" class="px-3 pb-3">
					<div v-for="f in g.rows.filter(x => explanation(x.def)).slice(0, 1)" :key="f.id + '-exp'" class="startup-exp text-body-2">
						<div v-for="par in paragraphs(f.def)" :key="par.key"><b>{{ tt(par.key) }}:</b> {{ tt(par.text) }}</div>
					</div>
				</div>
			</v-card>

			<div v-if="groupsReady.length" class="d-flex align-center flex-wrap mb-3 startup-readyline">
				<v-icon small class="mr-2 startup-text-configured">mdi-check-circle</v-icon>
				<span class="text-body-2 flex-grow-1">{{ tt('ready_n', { n: groupsReady.length }) }}</span>
				<v-btn small text color="primary" @click="showReady = !showReady">{{ showReady ? tt('ready_hide') : tt('ready_show') }}</v-btn>
			</div>
			<div v-if="nOcultas" class="text-caption startup-sub text-center">
				{{ tt('hidden_n', { n: nOcultas }) }}
				<v-btn x-small text color="primary" @click="show()">{{ tt('show_again') }}</v-btn>
			</div>
			<slot />
		</div>
				</v-card-text>
			</v-card>
		</v-dialog>
		<file-edit-dialog :shown.sync="editing" :filename="editFilename" :value="editText" @input="editText = $event" />
	</span>
</template>

<script>
'use strict'

import i18n from '../../i18n'
import { api } from './workshop-api.js'
import { startupRows, startupSummary } from './startup.js'
import {
	startupExplanation, startupSteps, startupWizardStart, startupWizardMove, startupWizardSummary, startupVisible,
	startupAnswersInitial, startupViewPreview, startupDestination, startupPlanWriting, startupVerify,
	startupValidate, startupMissingList, startupStepKind, startupManual, startupNotUsing, startupWalkWithout
} from './startup-wizard.js'

// props:
//   plugin         plugin Id: it owns the texts (plugins.<plugin>.startup.*) and the examples (examples.list { plugin })
//   defs           rows (see startup.js); the labels are keys under plugins.<plugin>.startup.
//                  A row may add que / paraQue / siFalta (keys) and asistente { preguntas, plantilla(valores), destino }:
//                  the keys of its questions are under plugins.<plugin>.startup too.
//   filaServicio   false = no "System service" row (default: it is shown)
//   crearAlInicio  true = asks the service for the examples that were never made (once, when the page opens)
export default {
	props: {
		plugin: { type: String, required: true },
		defs: { type: Array, default: () => [] },
		serviceRow: { type: Boolean, default: true },
		createOnStart: { type: Boolean, default: false },
		// async function the page gives to read its own checks again (config.g...) each time the card refreshes
		recheck: { type: Function, default: null }
	},
	data() {
		return { list: null, hidden: [], open: null, loaded: false, editing: false, editFilename: '', editText: '', explained: {}, wizard: null, dialog: false, reported: '', showReady: false, copied: false };
	},
	computed: {
		// full sentence of the chip (tooltip)
		chipHelp() {
			const r = this.summary;
			return this.tt('title') + ' - ' + (r.ready ? this.tt('strip_ready') : this.tt('strip_pending', { n: r.pending })) + ' - ' + (r.ready ? this.tt('strip_open') : this.tt('strip_setup'));
		},
		key() {
			return 'workshop' + this.plugin + 'StartupHidden';
		},
		allDefs() {
			const service = this.serviceRow
				? [{
					id: 'service',
					state: this.list === null ? 'missing' : 'configured',
					label: 'service',
					help: 'service_tip',
					what: 'service_what',
					why: 'service_for',
					ifMissing: 'service_missing',
					texts: { missing: 'service_not_running' }
				}]
				: [];
			return service.concat(this.defs);
		},
		rows() {
			return startupRows(this.allDefs, this.list, this.hidden);
		},
		rowsVisible() {
			return this.rows.filter(f => !f.hidden && !f.withoutData);
		},
		nOcultas() {
			return this.rows.filter(f => f.hidden).length;
		},
		summary() {
			return startupSummary(this.rows);
		},
		opens() {
			return this.open === null ? !this.summary.ready : this.open;
		},
		visible() {
			return this.loaded && this.$store.getters.isConnected;
		},
		percentage() {
			return this.summary.total ? Math.round(((this.summary.total - this.summary.pending) / this.summary.total) * 100) : 100;
		},
		stepPct() {
			return this.wizard ? Math.round(((this.wizard.est.i + 1) / this.wizard.est.ids.length) * 100) : 0;
		},
		// one card per FUNCTION: rows with the same grupo go together; a row without grupo is a card of its own
		groups() {
			const order = ['missing', 'example', 'configured', 'na'];
			const by = {};
			const out = [];
			this.rowsVisible.forEach(f => {
				const id = f.def.group || 'row:' + f.id;
				let g = by[id];
				if (!g) {
					g = by[id] = {
						id,
						title: f.def.groupTitle || (f.def.group ? null : f.def.title) || null,
						label: f.def.groupLabel || f.def.label,
						description: f.def.groupDescription || (f.def.group ? null : f.def.help) || null,
						icon: f.def.groupIcon || (f.id === 'service' ? 'mdi-server' : 'mdi-file-document-outline'),
						rows: [],
						state: 'na'
					};
					out.push(g);
				}
				g.rows.push(f);
			});
			out.forEach(g => {
				g.state = g.rows.reduce((m, f) => (order.indexOf(f.state) < order.indexOf(m) ? f.state : m), 'na');
			});
			return out;
		},
		stepsPending() {
			return startupSteps(this.rows);
		},
		// cards with something to do first; the ready ones collapse in one line
		groupsPending() {
			return this.groups.filter(g => g.state === 'missing' || g.state === 'example');
		},
		groupsReady() {
			return this.groups.filter(g => g.state !== 'missing' && g.state !== 'example');
		},
		groupsShown() {
			return this.showReady ? this.groupsPending.concat(this.groupsReady) : this.groupsPending;
		},
		// what is missing, in plain words, in order
		missingList() {
			return startupMissingList(this.rows);
		},
		stepCurrent() {
			if (!this.wizard || this.wizard.est.end) return null;
			return this.rows.filter(f => f.id === this.wizard.est.ids[this.wizard.est.i])[0] || null;
		},
		summaryWizard() {
			return this.wizard ? startupWizardSummary(this.wizard.est, this.rows) : null;
		},
		questionsVisible() {
			const as = this.stepCurrent && this.stepCurrent.def.wizard;
			return as && this.wizard.resp ? as.questions.filter(q => startupVisible(q, this.wizard.resp)) : [];
		}
	},
	watch: {
		summary(r) {
			this.$emit('state', r);
			this.report(r);
		},
		loaded() {
			this.report(this.summary);
		}
	},
	created() {
		try {
			const v = JSON.parse(localStorage.getItem(this.key) || '[]');
			this.hidden = Array.isArray(v) ? v : [];
		} catch (e) {
			this.hidden = [];
		}
	},
	mounted() {
		this.refresh(this.createOnStart);
	},
	methods: {
		// the preview of a file: the lines that really run (no ";" in front) are highlighted, the comments dimmed (startupLinesActive rule)
		codeLines(text) {
			return String(text || '').split(/\r?\n/).map(l => ({ text: l, active: l.trim() !== '' && l.trim().charAt(0) !== ';' }));
		},
		// text of the plugin: plugins.<plugin>.startup.<key>; the labels of the rows are keys of the same area
		tt(key, params) {
			// the plugin's own text first; the generic texts and the ones of the mode rows live in the shared catalog
			const own = 'plugins.' + this.plugin + '.startup.' + key;
			const k = i18n.te(own) ? own : 'plugins.' + this.plugin + '.shared.startup_' + key;
			return params ? i18n.t(k, params) : i18n.t(k);
		},
		// ---- the guide: plain sentences, steps that apply an answer, manual steps, "I do not use it" ----
		missingKey(f) {
			return f && f.def ? f.def.missingText || null : null;
		},
		missingSentence(m) {
			const def = m.def || m;
			if (def.missingText) return this.tt(def.missingText);
			return this.tt('missing_generic', { name: def.title || (def.label ? this.tt(def.label) : '') });
		},
		isApply(f) {
			return !!f && startupStepKind(f.def) === 'apply';
		},
		manual(f) {
			return f ? startupManual(f.def) : null;
		},
		notUsing(f) {
			return f ? startupNotUsing(f.def) : null;
		},
		notUsingName(f) {
			const id = this.notUsing(f);
			return id ? this.tt('mode_name_' + id) : '';
		},
		// a path where the line can break after each "/" (a zero-width space: only for showing, never for copying a path)
		wrapPath(p) {
			return String(p || '').replace(/\//g, '/\u200b');
		},
		copyText(text) {
			try {
				navigator.clipboard.writeText(text).then(() => {
					this.copied = true;
					setTimeout(() => {
						this.copied = false;
					}, 2000);
				});
			} catch (e) {
				/* the line is shown in the box: it can be selected by hand */
			}
		},
		// A step that saves an answer instead of a file (the mode question): validated, applied, then the walk takes in the rows it brought.
		async applyStep(f) {
			const as = f.def.wizard;
			const v = startupValidate(as.questions, this.wizard.resp);
			this.wizard.errors = v.errors;
			this.wizard.failure = null;
			if (!v.ok) return;
			this.wizard.writing = true;
			try {
				await as.apply(v.values);
				await this.$nextTick();
				await this.refresh(false);
				if (this.wizard.all) {
					const est = this.wizard.est;
					const keep = est.ids.slice(0, est.i + 1);
					const more = startupSteps(this.rows).filter(id => keep.indexOf(id) < 0 && est.done.indexOf(id) < 0 && est.skipped.indexOf(id) < 0);
					this.wizard.est = { ids: keep.concat(more), i: est.i, end: false, done: est.done.slice(), skipped: est.skipped.slice() };
				}
				this.wizard.msgs = [{ key: 'startup.apply_ok', params: {} }];
				this.wizard.view = 'result';
			} catch (e) {
				this.wizard.failure = this.ts('startup.verify_fail', { error: e && e.message ? e.message : '?' });
			} finally {
				if (this.wizard) this.wizard.writing = false;
			}
		},
		// A manual step: the person did it by hand; the machine is read again and the walk goes on only if it is really there now.
		async checkManual(f) {
			this.wizard.writing = true;
			this.wizard.failure = null;
			try {
				await this.refresh(false);
				const row = this.rows.filter(x => x.id === f.id)[0];
				if (row && !this.isPending(row)) this.move('done');
				else this.wizard.failure = this.ts('startup.manual_still');
			} finally {
				if (this.wizard) this.wizard.writing = false;
			}
		},
		// "I do not use it": the page that owns the setting is told and the rows of that setting leave the walk
		skipNotUsing(f) {
			const id = this.notUsing(f);
			if (!id) return;
			this.$emit('not-using', id);
			this.wizard.est = startupWalkWithout(this.wizard.est, this.rows, [id]);
			Object.assign(this.wizard, { view: 'question', errors: null, prev: null, plan: null, msgs: null, failure: null });
			this.prepareStep();
		},
		// a generic key written as in the JS pages ("startup.verify_ok")
		ts(key, params) {
			return this.tt(String(key).replace(/^startup\./, ''), params);
		},
		textState(f) {
			if (f.def.text) return f.def.text; // already translated by the page (RS485 takes it from its guide)
			const o = f.def.texts && f.def.texts[f.state];
			return this.tt(o || 'state_' + f.state, f.def.params);
		},
		color(state) {
			return { configured: 'success', example: 'warning', missing: 'error', na: 'grey' }[state] || 'grey';
		},
		explanation(def) {
			return startupExplanation(def);
		},
		// the paragraphs of an explanation: [{clave, texto}]
		paragraphs(def) {
			const e = startupExplanation(def);
			if (!e) return [];
			return [['what_label', e.what], ['for_label', e.why], ['missing_label', e.ifMissing]]
				.filter(p => p[1])
				.map(p => ({ key: p[0], text: p[1] }));
		},
		isPending(f) {
			return !!f && !f.hidden && !f.withoutData && (f.state === 'missing' || f.state === 'example');
		},
		destination(f) {
			return startupDestination(f.def);
		},
		options(q) {
			return (q.options || []).map(o => ({ text: this.tt(o.label), value: o.value }));
		},
		errorOf(q) {
			const e = this.wizard && this.wizard.errors && this.wizard.errors[q.id];
			return e ? [this.ts(e)] : [];
		},
		// The service keeps one line per plugin so its page can list what is left in all of them. Only after the files were
		// read (a card that did not hear from the service must not say "ready"), only when the numbers changed, and never
		// asking for a PIN: a background report is not worth a dialog.
		report(r) {
			if (!this.loaded || this.list === null) return;
			const key = r.pending + '/' + r.total;
			if (this.reported === key) return;
			this.reported = key;
			api('readiness.report', { plugin: this.plugin, pending: r.pending, total: r.total }, { noLogin: true, quiet: true }).catch(() => {
				this.reported = '';
			});
		},
		async refresh(create) {
			if (create) {
				try {
					await api('examples.create', { plugin: this.plugin });
				} catch (e) {
					/* the service is not running: the service row says so */
				}
			}
			try {
				const r = await api('examples.list', { plugin: this.plugin });
				this.list = r && Array.isArray(r.files) ? r.files : null;
			} catch (e) {
				this.list = null;
			}
			if (this.recheck) {
				try {
					await this.recheck();
				} catch (e) {
					/* the page keeps what it had */
				}
				await this.$nextTick();
			}
			this.loaded = true; // after the page's own checks: the counter reported to the service must not start from a half picture
		},
		async create(f) {
			try {
				await api('examples.create', { plugin: this.plugin, file: f.file });
			} catch (e) {
				/* the service is not running */
			}
			await this.refresh(false);
		},
		async edit(f) {
			await this.editPath('0:/' + f.file);
		},
		async editPath(path) {
			this.editFilename = path;
			try {
				this.editText = (await this.readFile(path)) || '';
			} catch (e) {
				this.editText = '';
			}
			this.editing = true;
		},
		hide(f) {
			if (this.hidden.indexOf(f.id) < 0) this.saveHidden(this.hidden.concat([f.id]));
		},
		show() {
			this.saveHidden([]);
		},
		saveHidden(list) {
			this.hidden = list;
			try {
				localStorage.setItem(this.key, JSON.stringify(list));
			} catch (e) {
				/* not critical */
			}
		},

		// ---- files of the machine (the assistant writes nothing the plan does not say) ----
		urlFile(p) {
			return '/machine/file/' + encodeURI(p).replace(/#/g, '%23');
		},
		// text of the file; null when it does not exist; throws on any other error (then nothing is written)
		async readFile(p) {
			const r = await fetch(this.urlFile(p), { cache: 'no-store' });
			if (r.status === 404) return null;
			if (!r.ok) throw new Error('HTTP ' + r.status);
			return r.text();
		},
		async writeFile(p, text) {
			const r = await fetch(this.urlFile(p), { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: text });
			if (!r.ok) throw new Error('HTTP ' + r.status);
		},
		// the text of the file now and the plan: which side names are already taken
		async readPlan(path) {
			const side = ['.example', '.new', '.nuevo2', '.nuevo3', '.nuevo4'].map(s => path + s);
			const r = await Promise.all([this.readFile(path)].concat(side.map(p => this.readFile(p))));
			const busy = side.filter((p, i) => r[i + 1] !== null);
			return { existing: r[0], plan: startupPlanWriting(path, r[0], busy) };
		},

		// ---- the assistant ----
		openDialog() {
			this.dialog = true;
		},
		// the rows of a card that the assistant can walk (pending and with an assistant)
		idsWizard(g) {
			return g.rows.filter(f => this.isPending(f) && f.def.wizard).map(f => f.id);
		},
		hideGroup(g) {
			this.saveHidden(this.hidden.concat(g.rows.map(f => f.id).filter(id => this.hidden.indexOf(id) < 0)));
		},
		// id: one row (string), several rows (array) or null = every pending row
		startWizard(id) {
			const ids = Array.isArray(id) ? id : id ? [id] : null;
			const est = ids ? { ids, i: 0, end: false, done: [], skipped: [] } : startupWizardStart(this.rows);
			this.dialog = true;
			this.wizard = { all: !id, created: [], est, view: 'question', resp: null, errors: null, prev: null, plan: null, existing: null, msgs: null, writing: false, failure: null };
			this.open = true;
			this.prepareStep();
		},
		closeWizard() {
			this.wizard = null;
		},
		move(action) {
			this.wizard.est = startupWizardMove(this.wizard.est, action);
			Object.assign(this.wizard, { view: 'question', errors: null, prev: null, plan: null, msgs: null, failure: null });
			this.prepareStep();
		},
		// the answers of the step that is shown start with their default values
		prepareStep() {
			this.wizard.resp = null;
			this.$nextTick(() => {
				const f = this.stepCurrent;
				const as = f && f.def.wizard;
				this.wizard.resp = as ? startupAnswersInitial(as.questions) : null;
			});
		},
		async viewPreview(f) {
			const as = f.def.wizard;
			const v = startupViewPreview(as, this.wizard.resp);
			this.wizard.errors = v.errors;
			this.wizard.failure = null;
			if (!v.ok) return;
			try {
				const p = await this.readPlan(startupDestination(f.def));
				this.wizard.prev = v;
				this.wizard.plan = p.plan;
				this.wizard.existing = p.existing;
				this.wizard.view = 'preview';
			} catch (e) {
				this.wizard.failure = this.ts('startup.verify_fail', { error: e && e.message ? e.message : '?' });
			}
		},
		// Writes ONLY what the plan says. The file is read again right before: if it changed while the person was
		// answering, the new plan is shown and nothing is written. Then it reads the file back and the row again.
		async save(f) {
			const as = f.def.wizard;
			const destination = startupDestination(f.def);
			this.wizard.writing = true;
			this.wizard.failure = null;
			try {
				const p = await this.readPlan(destination);
				const seen = this.wizard.plan;
				this.wizard.plan = p.plan;
				if (seen && (seen.mode !== p.plan.mode || seen.path !== p.plan.path)) {
					this.wizard.failure = this.ts('startup.plan_changed');
					return;
				}
				const v = startupViewPreview(as, this.wizard.resp);
				if (!v.ok) throw new Error('answers');
				if (p.plan.backup) await this.writeFile(p.plan.backup, p.existing);
				await this.writeFile(p.plan.path, v.text);
				if (this.wizard.created.indexOf(p.plan.path) < 0) this.wizard.created.push(p.plan.path);
				const read = await this.readFile(p.plan.path);
				await this.refresh(false);
				const row = this.rows.filter(x => x.id === f.id)[0] || null;
				this.wizard.msgs = startupVerify(read, row, p.plan).messages;
				this.wizard.view = 'result';
			} catch (e) {
				this.wizard.failure = this.ts('startup.verify_fail', { error: e && e.message ? e.message : '?' });
			} finally {
				if (this.wizard) this.wizard.writing = false;
			}
		}
	}
}
</script>

<style scoped>
.startup-icon-title {
	background: rgba(25, 118, 210, 0.2);
}
.startup-group {
	border-left-width: 4px !important;
}
.startup-g-configured { border-left-color: #43a047 !important; }
.startup-g-example { border-left-color: #fb8c00 !important; }
.startup-g-missing { border-left-color: #e53935 !important; }
.startup-g-na { border-left-color: #78909c !important; }
.startup-icon-configured { background: rgba(46, 125, 50, 0.2); }
.startup-icon-example { background: rgba(230, 81, 0, 0.2); }
.startup-icon-missing { background: rgba(198, 40, 40, 0.22); }
.startup-icon-na { background: rgba(69, 90, 100, 0.3); }
.startup-body {
	-webkit-overflow-scrolling: touch;
}
.startup-row {
	min-height: 30px;
	gap: 2px;
}
/* touch: 40 px high at least */
.startup-row .v-btn,
.startup-wizard .v-btn,
.startup-btn {
	min-height: 40px;
}
.startup-buttons {
	gap: 8px;
}
.startup-exp {
	margin: 0 0 6px 14px;
	padding: 4px 10px;
	border-left: 2px solid #455a64;
}
.startup-pre {
	margin: 4px 0;
	padding: 6px 0;
	max-height: 220px;
	overflow: auto;
	border-radius: 4px;
	background: rgba(0, 0, 0, 0.35);
	font: 12px/1.35 monospace;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.startup-line {
	padding: 0 8px 0 11px;
}
.startup-line-comment {
	opacity: 0.6;
}
.startup-line-active {
	padding-left: 8px;
	background: rgba(102, 187, 106, 0.22);
	color: #c8e6c9;
	font-weight: 600;
	box-shadow: inset 3px 0 0 #66bb6a;
}

.startup-title {
	white-space: normal !important;
	align-items: flex-start !important;
	flex-wrap: nowrap !important; /* the close button stays in the row, at the right of the title block (Vuetify 2 wraps the title) */
	word-break: normal !important; /* ... and words are not cut in the middle */
	overflow-wrap: break-word;
	hyphens: manual;
}
.startup-sub {
	color: rgba(0, 0, 0, 0.74);
}
.startup-text-configured { color: #1b5e20; }
.startup-text-example { color: #8a3b00; }
.startup-text-missing { color: #b71c1c; }
.startup-text-na { color: #455a64; }
.startup-state-configured { color: #1b5e20 !important; border-color: #1b5e20 !important; }
.startup-state-example { color: #8a3b00 !important; border-color: #8a3b00 !important; }
.startup-state-missing { color: #b71c1c !important; border-color: #b71c1c !important; }
.startup-state-na { color: #455a64 !important; border-color: #455a64 !important; }
.theme--dark .startup-sub { color: rgba(255, 255, 255, 0.78); }
.theme--dark .startup-text-configured, .theme--dark .startup-state-configured { color: #a5d6a7 !important; border-color: #a5d6a7 !important; }
.theme--dark .startup-text-example, .theme--dark .startup-state-example { color: #ffcc80 !important; border-color: #ffcc80 !important; }
.theme--dark .startup-text-missing, .theme--dark .startup-state-missing { color: #ef9a9a !important; border-color: #ef9a9a !important; }
.theme--dark .startup-text-na, .theme--dark .startup-state-na { color: #b0bec5 !important; border-color: #b0bec5 !important; }
.startup-path {
	display: inline-block;
	max-width: 100%;
	padding: 1px 6px;
	border-radius: 4px;
	background: rgba(127, 127, 127, 0.2);
	font: 12px/1.4 monospace;
	white-space: normal;
	overflow-wrap: anywhere;
}
.startup-rowtext {
	min-width: 0;
	overflow-wrap: anywhere;
}
.startup-missing-list, .startup-steps {
	padding-left: 20px;
}
@media (max-width: 480px) {
	.startup-icon-title, .startup-icon { display: none !important; }
}
</style>
