'use strict'

// ---- Pause / resume / cancel of a file job: the ONE rule (2026-10-30, architecture review finding 3) ----
// The Job control card of WorkshopPrinting and the status bar of the Workbench pages (src/_zones) offer the same three buttons. The
// rule is here and in src/_shared/01-job-rules.js (the JS plugins); tests/job-rules.test.js checks that the copies are the same
// text of the rule and that both places use it. vue/_shared and vue/_shared36 hold this same file.
//
// The codes are the ones DWC sends from its own buttons: M25 pauses, M24 resumes, M0 cancels the file job. RRF 3.x refuses M0
// sent from another channel while the job is printing ("Pause the print before attempting to cancel it"), and DWC's own Job
// control panel shows Cancel only while the job is paused (JobControlPanel.vue: v-if="isPaused"). So cancelling a job that is
// printing is two taps: Pause (M25), then Cancel (M0) once the state is 'paused'. The states between ('pausing', 'resuming',
// 'cancelling') offer nothing: they end by themselves in a second or two. A simulation is not paused or cancelled from here.
// A live job (a program through the bridge) has its own controls in the Jog bar: with one running nothing is offered.

export const JOB_CODES = { pause: 'M25', resume: 'M24', cancel: 'M0' }

// Which buttons are offered for the machine status (state.status) -> { pause, resume, cancel } (booleans). live = true when a
// live job is running (plugins.WorkshopService.data.liveJob.active).
export function jobButtons(status, live) {
	if (live) return { pause: false, resume: false, cancel: false }
	const s = status || ''
	return { pause: s === 'processing', resume: s === 'paused', cancel: s === 'paused' }
}

// The G-code of a button ('pause' | 'resume' | 'cancel'), '' for anything else.
export function jobCode(action) {
	return Object.prototype.hasOwnProperty.call(JOB_CODES, action) ? JOB_CODES[action] : ''
}
