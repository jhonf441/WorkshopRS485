'use strict'

// The one call a plugin makes to learn why a control is locked: auth.can (any role, only about the caller). The service page has its own, larger
// access-api.js (the access.* operations); a plugin has no use for them, so this file is the reduced one (a copy that differs on purpose).
//
//   accessApi.can(items, opts)   items: operation names or { operation, target }, up to 100; resolves { items: [{ operation, target, allowed, reason, text }] }

import { api } from './workshop-api.js'

export const CAN_OP = 'auth.can'

export const accessApi = {
	can: (items, opts) => api(CAN_OP, { operations: items }, opts)
}
