'use strict'

// ONE rule for "may this person switch the machine mode (FFF / Laser / CNC)?" (owner 2026-11-06): the Printing page said "sign-in required"
// to switch to FFF while the mode buttons of the control bar switched without a word. Every place that switches the mode (the banner of
// Printing, the mode buttons of the bar, the head change) asks here; the JS twin is workshopModeSwitchAccess of src/_shared/07-modes.js.
//
// The rule: switching the mode is the technician's (WorkshopService dsf/permissions.py: "technician ... changes mode / head"). The macro runs
// through DWC (M98 / M45x), not through the service, so there is no operation of its own in the table: the technician rank is asked through
// the operation that marks that role (RANK_OPS of role-view.js), the same way roleAtLeast('technician') does everywhere else.
//
//   MODE_SWITCH_ROLE          'technician' (the role a lock reason names)
//   MODE_SWITCH_OP            the operation asked (for <lock-reason :op="MODE_SWITCH_OP" :need="MODE_SWITCH_ROLE" />)
//   canSwitchMode()           true when the person may (also while nothing is known: hiding is a courtesy, the service decides)
//   modeSwitchAccess()        'resolving' | 'ok' | 'session' | 'role'  (what a view draws: nothing yet, nothing, the sign-in reason, the role reason)

import { RANK_OPS } from './role-view.js'
import { accessState, workshopCan } from './workshop-auth.js'

export const MODE_SWITCH_ROLE = 'technician'
export const MODE_SWITCH_OP = RANK_OPS[MODE_SWITCH_ROLE]

export function canSwitchMode() {
	return workshopCan(MODE_SWITCH_OP)
}

export function modeSwitchAccess() {
	return accessState(MODE_SWITCH_OP)
}
