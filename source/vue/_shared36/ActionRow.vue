<template>
	<!-- A row of 48 (FAMILIA-REDISENO.md 3; the SvActionRow of the service page brought to the family): the name 14/500 and one line 12 on the left,
	     the control on the right (below it in a narrow container). Rows that follow each other get a divider. Look: design/family-plugins.css (.wf-row).
	       <action-row :title="t('night')" :text="t('night_hint')"><v-switch ... /></action-row> -->
	<div class="wf-row">
		<div class="wf-row-txt">
			<div class="wf-row-name">{{ title }}</div>
			<div v-if="text" class="wf-row-text">{{ text }}</div>
			<slot name="below" />
		</div>
		<div v-if="$slots.default" class="wf-row-control"><slot /></div>
	</div>
</template>

<script>
'use strict'

export default {
	name: 'ActionRow',
	props: {
		title: { type: String, required: true },
		text: { type: String, default: '' }
	}
}
</script>
