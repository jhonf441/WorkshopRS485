'use strict'

// workshopProfile: the machine profile + capabilities of the service, cached (see machine-profile-core.js).
//
//   import { workshopProfile } from './machine-profile.js'
//   await workshopProfile.get()
//   if (workshopProfile.has('laser', true)) ...          // true while unknown: do not hide before knowing
//   const path = workshopProfile.macro('focus')          // null = the machine has no such macro
//   workshopProfile.meterAvailable()                     // true / false / null
//
// New file on purpose: workshop-api.js is shared with other work in progress.

import { api } from './workshop-api.js'
import { createProfile } from './machine-profile-core.js'

export { DEFAULT_MACROS } from './machine-profile-core.js'

export const workshopProfile = createProfile(async () => {
	const [profile, caps] = await Promise.all([api('profile.get'), api('capabilities.get')])
	return { profile, caps }
})
