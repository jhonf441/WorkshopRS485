<template>
	<!-- Common notice (2026-10-10): the page needs the Pi's service
		     (WorkshopService, through DSF). Without SBC mode or without the service running there is
		     no channel to send G-code nor data to show. -->
	<v-card v-if="problem" variant="outlined" class="mb-3 service-notice" role="status" aria-live="polite">
		<v-card-text class="d-flex align-start">
			<v-icon color="warning" class="mr-3 mt-1">mdi-lan-disconnect</v-icon>
			<div>
				<div class="font-weight-medium">{{ problem.title }}</div>
				<div class="text-body-medium mt-1">{{ problem.text }}</div>
				<div class="text-body-medium mt-2">
					<a href="#" @click.prevent="see = !see">{{ see ? ts('service_notice_hide') : ts('service_notice_show') }}</a>
				</div>
				<!-- the explanation goes right here (2026-10-10): the GitHub link gave
					     404 with private repos, and without the service there is no workshop page -->
				<ExpandTransition>
					<div v-show="see" class="text-body-medium mt-2 notice-explains">
						<p>{{ ts('service_notice_explain_1') }}</p>
						<p>{{ ts('service_notice_explain_2') }}</p>
						<p class="mb-0">{{ ts('service_notice_explain_3') }}</p>
					</div>
				</ExpandTransition>
			</div>
		</v-card-text>
	</v-card>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ExpandTransition } from './expand-transition.js'
import { serviceProblemKind, SERVICE_PROBLEM_KEYS } from './service-problem.js'
import { ts } from './shared-t.js'

const see = ref(false)
const problem = computed(() => {
	// without a connection to the machine nothing is said: DWC already shows it
	const kind = serviceProblemKind()
	return kind ? { title: ts(SERVICE_PROBLEM_KEYS[kind].title), text: ts(SERVICE_PROBLEM_KEYS[kind].text) } : null
})
</script>

<style scoped>
.notice-explains p {
	margin-bottom: 6px;
}
.service-notice {
	border-left: 4px solid rgb(var(--v-theme-warning), 1) !important;
}
</style>
