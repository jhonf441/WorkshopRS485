<template>
	<!-- The section the person's role cannot use (N4 cover): it replaces the content, says WHY (no session: blue; role too low: gray, names the role that
	     opens it and the one the person has). No button: the chip of the page bar is the one way to sign in. Used by the pages with a side bar (SideTabs
	     items from lockedItems()). -->
	<session-notice variant="cover" :kind="kind" :needed="needed" :title="title" />
</template>

<script>
'use strict'

import SessionNotice from './SessionNotice.vue'
import { roleMixin } from './role-mixin.js'
import { signedOut } from './workshop-auth.js'
import { ts } from './shared-t.js'

export default {
	components: { SessionNotice },
	mixins: [roleMixin],
	props: { needed: { type: String, default: 'technician' }, label: { type: String, default: '' } },
	computed: {
		kind() {
			void this.identityTick
			return signedOut() ? 'session' : 'role'
		},
		title() {
			return this.label ? ts(this.kind === 'session' ? 'notice_session_cover_title' : 'notice_role_cover_title') + ': ' + this.label : ''
		}
	}
}
</script>
