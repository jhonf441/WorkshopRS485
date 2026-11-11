'use strict';

// Which modes this machine uses (FFF / Laser / CNC): ONE source of truth for every start-up card and for the
// "Machine modes" section of the Machine plugin. Pure (no imports): tests/machine-modes.test.js loads it in node.
//
// Where the answer lives: the machine profile of the service (profile.get / profile.set), field
// mode_policies.<FFF|Laser|CNC>.enabled (it already existed in profile schema 3: no service change). An absent entry
// means "not answered yet". When the service has no profile op (or the role cannot write it) the answer is kept in
// the browser (machine-modes-store.js); the cards ask the question either way.
// What the board shows (extruders, spindles, mode files, laser) only PRESELECTS the question: it never decides.
//
// Rule of the rows: a person who uses one mode only (a 3D printer) has no mode macros to maintain, so there are no mode
// rows at all. With two or more modes the rows of EACH enabled mode appear (mode macro, settings file) plus the check
// of config.g. A mode that is off never has rows and its files are never deleted.

export const MODES = ['fff', 'laser', 'cnc'];
export const MODE_NAMES = { fff: 'FFF', laser: 'Laser', cnc: 'CNC' };
export const MODE_CODES = { fff: 'M451', laser: 'M452', cnc: 'M453' };
export const MODE_MACROS = { fff: 'macros/mode/selectfff.g', laser: 'macros/mode/selectlaser.g', cnc: 'macros/mode/selectcnc.g' };
// WHERE THE MODE SYSTEM LIVES ON THE SD (SD layout phase 4). The ONE place in the plugins that spells these paths: everything else imports them
// (tests/test_mode_paths.py fails on a literal). The service has the same strings in dsf/mode_paths.py.
export const MODES_DIR = 'sys/workshop/modes';
export const MODE_FILES = { fff: MODES_DIR + '/modefff.g', laser: MODES_DIR + '/modelaser.g', cnc: MODES_DIR + '/modecnc.g' };
export const AUTO_MODE_FILE = MODES_DIR + '/automodeselect.g';
export const MODE_STATE_FILE = 'sys/workshop/data/modestate.g';
// path of a file of the SD in the form G-code and the file API use
export const sdPath = rel => '0:/' + rel;
// a mode file by its name, to read one that is not the one being edited: 'modelaser.g' -> '0:/sys/workshop/modes/modelaser.g'
export const modeFilePath = name => sdPath(MODES_DIR + '/' + name);

// answer: { fff, laser, cnc } with true / false / null (null = not answered)
function emptyAnswer() {
	return { fff: null, laser: null, cnc: null };
}

// What the board suggests. caps = the answer of capabilities.get ({capabilities: {...}}) or null.
// -> { fff, laser, cnc } booleans, and `known` = false when there is nothing to look at.
export function detectModes(caps) {
	const c = (caps && caps.capabilities) || null;
	if (!c) return { fff: true, laser: false, cnc: false, known: false };
	const present = k => !!(c[k] && c[k].present);
	const listed = (c.modes && c.modes.available) || [];
	const has = n => listed.indexOf(n) >= 0;
	return {
		fff: present('extruder') || has('FFF'),
		laser: present('laser') || has('Laser'),
		cnc: present('spindle') || has('CNC'),
		known: true
	};
}

// The answer stored in the profile (profile.get -> .profile). null entries when absent.
export function modesFromProfile(profile) {
	const out = emptyAnswer();
	const pol = (profile && profile.mode_policies) || {};
	MODES.forEach(m => {
		const p = pol[MODE_NAMES[m]];
		if (p && typeof p.enabled === 'boolean') out[m] = p.enabled;
	});
	return out;
}

export function isAnswered(answer) {
	return !!answer && MODES.some(m => typeof answer[m] === 'boolean');
}

// a mode with no entry counts as off once the person has answered
function fill(a) {
	const out = emptyAnswer();
	MODES.forEach(m => {
		out[m] = a[m] === true;
	});
	return out;
}

// The profile answer wins; then the one kept in the browser; else nothing. -> { answer, answered, source }
export function modesState(profileAnswer, localAnswer) {
	if (isAnswered(profileAnswer)) return { answer: fill(profileAnswer), answered: true, source: 'profile' };
	if (isAnswered(localAnswer)) return { answer: fill(localAnswer), answered: true, source: 'local' };
	return { answer: emptyAnswer(), answered: false, source: 'none' };
}

export function enabledList(state) {
	return state && state.answered ? MODES.filter(m => state.answer[m]) : [];
}

// "FFF, Laser" for the texts
export function enabledNames(state) {
	return enabledList(state).map(m => MODE_NAMES[m]).join(', ');
}

// True when the machine switches between modes: the mode macros and files only make sense then.
export function usesSeveralModes(state) {
	return enabledList(state).length >= 2;
}

// Does any mode other than FFF run on this machine? (the cards that only print never mention the others)
export function usesExtraModes(state) {
	return enabledList(state).some(m => m !== 'fff');
}

// The `changes` of profile.set for a new answer, keeping the min_role the profile may already hold.
export function profileChanges(answer, currentProfile) {
	const cur = (currentProfile && currentProfile.mode_policies) || {};
	const pol = {};
	MODES.forEach(m => {
		const old = cur[MODE_NAMES[m]];
		pol[MODE_NAMES[m]] = { enabled: answer[m] === true, min_role: old && old.min_role ? old.min_role : null };
	});
	return { mode_policies: pol };
}

// Switch ONE mode on or off keeping the others. state = modesState(...). -> new answer { fff, laser, cnc }
export function withMode(state, mode, on, detected) {
	const base = state && state.answered ? state.answer : { fff: !!(detected && detected.fff), laser: false, cnc: false };
	const out = fill(base);
	out[mode] = !!on;
	return out;
}

// ---- the assistants of a mode (moved here from Printing's startup-rows.js; texts are in the shared catalog) ----

// Assistant of a mode macro: asks how THIS machine gets into the mode (RepRapFirmware's own mode, a tool of config.g, or a
// macro of its own) and writes the macro. Nothing assumes the owner's tool numbers or macro names.
// The default (RRF's mode) also sets global.selectedMode, which the system service and the pages read first (they fall
// back to RRF's own state.machineMode), and runs the person's sys/workshop/modes/mode<name>.g only if that file exists.
function questionsMode() {
	return [
		{ id: 'method', kind: 'list', defaultValue: 'rrf', label: 'q_method', help: 'q_method_tip', options: [{ value: 'rrf', label: 'opt_rrf' }, { value: 'tool', label: 'opt_tool' }, { value: 'macro', label: 'opt_macro' }] },
		{ id: 'tool', kind: 'number', integer: true, min: 0, max: 50, defaultValue: 0, label: 'q_tool', help: 'q_tool_tip', si: { question: 'method', value: 'tool' } },
		{ id: 'macro', kind: 'text', pattern: '^0:/.+\\.g$', defaultValue: '0:/macros/mode/my-mode.g', label: 'q_macro', help: 'q_macro_tip', si: { question: 'method', value: 'macro' } }
	];
}

// mode: the name the pages use (FFF / Laser / CNC); code: RRF's mode command; file: the person's own settings for the mode
export function wizardMode(name, mode, code, file) {
	return {
		questions: questionsMode(),
		template: function (r) {
			const l = ['; Mode macro: ' + name, '; Made with the start-up assistant. Edit it whenever you need.', ';'];
			if (r.method === 'rrf') {
				l.push("; RepRapFirmware's own " + mode + ' mode (' + code + "). The pages and the system service follow global.selectedMode and fall back to RRF's mode.");
				l.push('if !exists(global.selectedMode)');
				l.push('    global selectedMode = "' + mode + '"');
				l.push('else');
				l.push('    set global.selectedMode = "' + mode + '"');
				l.push(code);
				l.push('; Your own settings for this mode (heaters, tools, spindle...): run only if the file exists.');
				l.push('if fileexists("' + modeFilePath(file) + '")');
				l.push('    M98 P"' + modeFilePath(file) + '"');
			} else if (r.method === 'tool') {
				l.push('; The tool has to be set up first (M563 P' + r.tool + ' ... in your config.g).');
				l.push('T' + r.tool);
			} else {
				l.push('M98 P"' + r.macro + '"');
			}
			return l.join('\n');
		}
	};
}

// The file with the settings of one mode: the assistant asks the few things that change from one machine to another and writes
// ACTIVE lines. Speeds are two safe presets; the extruder axis is never touched. Movement commands are never written.
const SPEEDS = {
	gentle: { v: 'X6000 Y6000 Z300', a: 'X300 Y300 Z50', j: 'X300 Y300 Z20' },
	normal: { v: 'X9000 Y9000 Z600', a: 'X600 Y600 Z100', j: 'X400 Y400 Z50' }
};
function questionsModeFile(kind) {
	const q = [
		{ id: 'speed', kind: 'list', defaultValue: 'gentle', label: 'q_speed', help: 'q_speed_tip', options: [{ value: 'gentle', label: 'opt_speed_gentle' }, { value: 'normal', label: 'opt_speed_normal' }] },
		{ id: 'x', kind: 'number', min: 1, max: 5000, defaultValue: 300, label: 'q_limit_x', help: 'q_limit_tip' },
		{ id: 'y', kind: 'number', min: 1, max: 5000, defaultValue: 300, label: 'q_limit_y', help: 'q_limit_tip' },
		{ id: 'z', kind: 'number', min: 1, max: 5000, defaultValue: 100, label: 'q_limit_z', help: 'q_limit_tip' }
	];
	if (kind === 'laser') q.push({ id: 'pin', kind: 'text', pattern: '^[A-Za-z0-9_.]{1,20}$', defaultValue: 'out9', label: 'q_pin', help: 'q_pin_tip' });
	return q;
}
export function wizardModeFile(name, kind) {
	return {
		questions: questionsModeFile(kind),
		template: function (r) {
			const sp = SPEEDS[r.speed] || SPEEDS.gentle;
			const l = ['; Settings of ' + name + ' mode. Made with the start-up assistant. Edit it whenever you need.', ';'];
			l.push('M203 ' + sp.v + '    ; maximum speed (mm/min)');
			l.push('M201 ' + sp.a + '    ; acceleration (mm/s^2)');
			l.push('M566 ' + sp.j + '    ; jerk (mm/min)');
			l.push('M208 X0:' + r.x + ' Y0:' + r.y + ' Z0:' + r.z + '    ; limits of the work area (mm): measure your own machine');
			if (kind === 'laser') l.push('M452 C"' + r.pin + '" R255 F500    ; turns on laser mode: power signal on this pin');
			if (kind === 'cnc') l.push('M453    ; turns on CNC mode (your spindle is defined in config.g)');
			return l.join('\n');
		}
	};
}

const LABEL_NAMES = { fff: 'printing (FFF)', laser: 'laser', cnc: 'CNC' };

// The two rows of one mode (macro + settings file). The labels are keys of startup (plugin or shared catalog).
export function rowsOfMode(mode) {
	const name = MODE_NAMES[mode];
	return [
		{
			id: 'mode_' + mode, file: MODE_MACROS[mode], label: 'row_mode_' + mode, what: 'row_mode_' + mode + '_what', why: 'row_mode_' + mode + '_for',
			ifMissing: 'row_mode_' + mode + '_missing', help: 'row_mode_tip', missingText: 'miss_mode_' + mode, notUsing: mode, mode: mode,
			wizard: wizardMode(LABEL_NAMES[mode], name, MODE_CODES[mode], 'mode' + mode + '.g')
		},
		{
			id: 'modefile_' + mode, file: MODE_FILES[mode], label: 'row_modefile_' + mode, what: 'row_modefile_what', why: 'row_modefile_for',
			ifMissing: 'row_modefile_missing', help: 'row_modefile_tip', missingText: 'miss_modefile_' + mode, notUsing: mode, mode: mode,
			wizard: wizardModeFile(LABEL_NAMES[mode], mode)
		}
	];
}

// The mode rows of a machine: [] unless two or more modes are on (see the rule at the top).
// enabled: array of mode ids ('fff', 'laser', 'cnc'). Macros first, then the settings files.
export function modeRows(enabled) {
	const on = MODES.filter(m => (enabled || []).indexOf(m) >= 0);
	if (on.length < 2) return [];
	const macros = on.map(m => rowsOfMode(m)[0]);
	const files = on.map(m => rowsOfMode(m)[1]);
	return macros.concat(files);
}

// config.g has to call automodeselect.g for the machine to enter its mode at start-up. The page reads sys/config.g and says whether it
// does (it never edits config.g: that file holds the hardware). calls: true | false | null (not read).
// It cannot be automated, so the row carries the manual instructions: steps (keys) + a copyable line; "Check" reads config.g again.
export const BOOT_LINE = 'M98 P"' + sdPath(AUTO_MODE_FILE) + '"';
// The mode files at the layout BEFORE phase 4 (built without spelling the paths: tests/test_mode_paths.py forbids the literal). The page never
// reads them as modes (no fallback to the old paths); it only asks whether they are still there to say "modes not migrated".
export const OLD_MODE_FILES = ['automodeselect', 'modefff', 'modelaser', 'modecnc', 'modestate'].map(n => 'sys/' + n + '.g');
const NEW_OF_OLD = {
	automodeselect: AUTO_MODE_FILE, modefff: MODE_FILES.fff, modelaser: MODE_FILES.laser, modecnc: MODE_FILES.cnc, modestate: MODE_STATE_FILE
};
// The old-layout mode files that are still there while their new path is not: `read(path)` -> text | null (404), may throw (then that file
// says nothing). Only to SAY "modes not migrated" (the start-up wizard moves them); the page never uses the old files.
export async function findUnmigrated(read) {
	const has = async f => {
		try {
			return (await read('0:/' + f)) !== null;
		} catch (e) {
			return false;
		}
	};
	const out = [];
	for (const name of Object.keys(NEW_OF_OLD)) {
		const old = 'sys/' + name + '.g';
		if ((await has(old)) && !(await has(NEW_OF_OLD[name]))) out.push(old);
	}
	return out;
}
// The row that says the modes were not migrated yet: `old` = the old paths found (array, may be empty). null when there is nothing to say.
export function rowUnmigrated(old) {
	if (!old || !old.length) return null;
	return {
		id: 'modes_unmigrated', state: 'missing', label: 'row_unmigrated', what: 'row_unmigrated_what', why: 'row_unmigrated_for', ifMissing: 'row_unmigrated_missing',
		help: 'row_unmigrated_tip', missingText: 'miss_unmigrated', texts: { configured: 'unmigrated_ok', missing: 'unmigrated_missing' }, params: { files: old.join(', ') }
	};
}
export function rowBoot(calls) {
	if (calls === null || calls === undefined) return null;
	return {
		id: 'mode_boot', state: calls ? 'configured' : 'missing', label: 'row_boot', what: 'row_boot_what', why: 'row_boot_for', ifMissing: 'row_boot_missing',
		help: 'row_boot_tip', missingText: 'miss_boot', texts: { configured: 'boot_ok', missing: 'boot_missing' },
		manual: { steps: ['boot_step1', 'boot_step2', 'boot_step3'], copy: BOOT_LINE, copyLabel: 'boot_copy' }
	};
}
// true when config.g starts the mode system: the line itself, or the marked block of the workshop (hook `boot`, SD layout phase 5), which calls
// sys/workshop/hooks/boot.g and that one runs automodeselect.g. The MARK alone is not enough: `bootText` (the text of boot.g, null = missing)
// must exist and call automodeselect.g on an active line, or nothing runs the modes at start-up.
export function callsAutoModeSelect(text, bootText) {
	const lines = String(text || '').split(/\r?\n/);
	const norm = x => x.replace(/^[ \t]+/, '').replace(/[ \t]+/g, ' ').toLowerCase();
	const direct = norm('M98 P"' + sdPath(AUTO_MODE_FILE) + '"');
	if (lines.some(l => norm(l).indexOf(direct) === 0)) return true;
	if (!lines.some(l => /^[ \t]*;[ \t]*>>>[ \t]*WORKSHOP[ \t]+hook=boot[ \t]/.test(l))) return false;
	if (bootText === null || bootText === undefined) return false;
	return String(bootText).split(/\r?\n/).some(l => l.replace(/;.*$/, '').indexOf('automodeselect.g') >= 0);
}
// where the block of config.g sends: the macro callsAutoModeSelect needs to read
export const BOOT_HOOK_FILE = 'sys/workshop/hooks/boot.g';

// The question that opens the card. `state` = modesState(...), `detected` = detectModes(...), `onAnswer(values)` saves it.
// Pending (red) until answered; the three yes/no questions start with the board's suggestion.
export function rowQuestion(state, detected, onAnswer) {
	const det = detected || { fff: true, laser: false, cnc: false };
	const names = enabledNames(state);
	const q = MODES.map(m => ({ id: m, kind: 'si_no', defaultValue: state && state.answered ? !!state.answer[m] : !!det[m], label: 'q_use_' + m, help: 'q_use_' + m + '_tip' }));
	return {
		id: 'modes_question', state: state && state.answered ? 'configured' : 'missing', label: 'row_modes', what: 'row_modes_what', why: 'row_modes_for',
		ifMissing: 'row_modes_missing', help: 'row_modes_tip', missingText: 'miss_modes', params: { modes: names || '-' },
		texts: { configured: 'modes_ok', missing: 'modes_unanswered' },
		wizard: { questions: q, apply: onAnswer }
	};
}

// All the mode rows of a card, in order: the question first; then (only if two or more modes are on) the check of config.g and the mode rows.
// bootCalls: callsAutoModeSelect(config.g) or null. -> array of defs
export function modeStartupRows(state, detected, bootCalls, onAnswer, unmigrated) {
	const out = [rowQuestion(state, detected, onAnswer)];
	if (!usesSeveralModes(state)) return out;
	// the mode files are still at the old place: say so, and do not offer rows (and lines to copy) for files that are not where they are read
	const un = rowUnmigrated(unmigrated);
	if (un) return out.concat([un]);
	const boot = rowBoot(bootCalls);
	if (boot) out.push(boot);
	return out.concat(modeRows(enabledList(state)));
}

// The state of a file by its text: the Machine section reads the files itself (it does not depend on the examples of another plugin).
// null = does not exist; only comments = 'example'; active lines = 'configured'.
export function fileStateOf(text) {
	if (text === null || text === undefined) return 'missing';
	const active = String(text).split(/\r?\n/).some(l => {
		const x = l.trim();
		return x !== '' && x.charAt(0) !== ';';
	});
	return active ? 'configured' : 'example';
}

// Rows with an explicit state (the Machine section): defs of a mode with `state` from the files read. texts = { path: text|null }
export function withFileStates(defs, texts) {
	return (defs || []).map(d => {
		if (!d.file || d.state !== undefined) return d;
		const t = texts ? texts['0:/' + d.file] : undefined;
		if (t === undefined) return d;
		return Object.assign({}, d, { state: fileStateOf(t) });
	});
}

// window events between the header chip and the cards of the "Modes" section of the Machine page: the answer changed / a card asks for the guide
export const MODES_CHANGED = 'workshop-machine-modes-changed';
export const MODES_GUIDE = 'workshop-machine-modes-guide';

// What the switches of the modes show: the answer, or (before the first answer) what the board suggests; nothing is saved until
// the person touches one.
export function effectiveModes(state, detected) {
	if (state && state.answered) return state.answer;
	const d = detected || {};
	return { fff: !!d.fff, laser: !!d.laser, cnc: !!d.cnc };
}

// The rows of the start-up guide of the modes (header chip of the Machine page and the cards of its "Modes" section): only with two
// or more modes on, and only the rows whose file could be read. bootCalls = what rowBoot reads; texts = { path: text|null }.
export function guideDefs(state, bootCalls, texts, unmigrated) {
	if (!usesSeveralModes(state)) return [];
	const un = rowUnmigrated(unmigrated);
	if (un) return [un];
	const boot = rowBoot(bootCalls);
	const rows = withFileStates(modeRows(enabledList(state)), texts).filter(d => d.state !== undefined);
	return (boot ? [boot] : []).concat(rows);
}

// Summary of ONE mode for its card: 'off' | 'alone' (on, but it is the only mode: nothing to configure) | 'pending' | 'ready'.
// rows = the rows (with `state`) of the mode.
export function modeCardState(state, mode, rows) {
	if (!state || !state.answered || !state.answer[mode]) return 'off';
	if (!usesSeveralModes(state)) return 'alone';
	const mine = (rows || []).filter(r => r.mode === mode && r.state !== 'na');
	if (mine.some(r => r.state === 'missing' || r.state === 'example')) return 'pending';
	return 'ready';
}
