'use strict'

// Vue mixin of the RS485 page: `can(op, args)` is true when the current role may make that call (hiding is a courtesy: the backend,
// dsf/rs485_access.py, decides). While the service has not said who the person is, or there are no users, everything is allowed.
//   mixins: [canMixin]      ...      :disabled="!can('rs485.save')"      v-if="can('rs485.action', { action: 'write_register' })"

import { roleMixin } from './role-mixin.js'
import { roleAtLeast } from './role-view.js'
import { neededRole, lowestMissing } from './roles.js'

export const canMixin = {
	mixins: [roleMixin],
	methods: {
		can(op, args) {
			void this.identityTick
			const need = neededRole(op, args)
			return need === null || roleAtLeast(need)
		},
		// the role a card names in its ONE reason (<lock-reason :min="reasonRole('device')" />): '' when the person may do everything in it
		reasonRole(group) {
			void this.identityTick
			return lowestMissing(group, roleAtLeast)
		}
	}
}
