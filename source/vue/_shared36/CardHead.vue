<template>
	<!-- The head of a card (FAMILIA-REDISENO.md 3): icon 20 in the color of the section, title 16/600, then at the right the state, the age of the
	     data and the actions (slot; the main action 36, the others 32). A 4 % tint of the section. Look: design/family-plugins.css (.wf-card-head).
	       <card-head icon="mdi-thermometer" :title="t('heaters')" :state="'Listo'" :age="'hace 2 s'"><v-btn small>...</v-btn></card-head> -->
	<div class="wf-card-head">
		<v-icon v-if="icon" class="wf-card-head-icon" aria-hidden="true">{{ icon }}</v-icon>
		<h3 class="wf-card-head-title" :title="title">{{ title }}</h3>
		<div v-if="state || age || $slots.default" class="wf-card-head-right">
			<span v-if="state" class="wf-state" :class="stateKind">{{ state }}</span>
			<span v-if="age" class="wf-card-head-age">{{ age }}</span>
			<slot />
		</div>
	</div>
</template>

<script>
'use strict'

export default {
	name: 'CardHead',
	props: {
		icon: { type: String, default: '' },
		title: { type: String, required: true },
		state: { type: String, default: '' }, // the word of the state (already translated)
		stateKind: { type: String, default: '' }, // 'ok' | 'warn' | 'err' | 'info': the dot of .wf-state
		age: { type: String, default: '' } // "2 s ago" (already translated)
	}
}
</script>
