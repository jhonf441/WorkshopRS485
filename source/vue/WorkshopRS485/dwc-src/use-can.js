'use strict'

// Composable of the RS485 page: `can(op, args)` is true when the current role may make that call (hiding is a courtesy: the backend,
// dsf/rs485_access.py, decides). While the service has not said who the person is, or there are no users, everything is allowed.
//   const { can } = useCan()      ...      :disabled="!can('rs485.save')"      v-if="can('rs485.action', { action: 'write_register' })"

import { useRole } from './use-role.js'
import { roleAtLeast } from './role-view.js'
import { neededRole } from './roles.js'

export function useCan() {
	const { identityTick, atLeast, canDo } = useRole()
	return {
		identityTick,
		atLeast,
		canDo,
		can(op, args) {
			void identityTick.value
			const need = neededRole(op, args)
			return need === null || roleAtLeast(need)
		}
	}
}
