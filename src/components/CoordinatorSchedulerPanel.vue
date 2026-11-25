<!--
  Modified by: Gian Mandac (staff dashboard side panel opens workbench steps; frame grows with its page)
  Modified Date: 20261124
-->
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import type { SchedulerState } from '@/lib/schedule/scheduler-bridge';

const props=defineProps<{accessToken:string}>();
const emit=defineEmits<{ state: [state: SchedulerState] }>();
const frame=ref<HTMLIFrameElement>();
const denied=ref(false);
const reload=ref(0);
// The workbench reports its page height, so the dashboard scrolls instead of the frame.
const height=ref<number>();
function sendSession() {
  frame.value?.contentWindow?.postMessage({type:'SNCS_SCHEDULER_SESSION',token:props.accessToken},window.location.origin);
}
function receive(event: MessageEvent) {
  if (event.origin!==window.location.origin || event.source!==frame.value?.contentWindow) return;
  if (event.data?.type==='SNCS_SCHEDULER_READY') sendSession();
  if (event.data?.type==='SNCS_SCHEDULER_ACCESS_DENIED') denied.value=true;
  if (event.data?.type==='SNCS_SCHEDULER_STATE') {
    const { view, steps, height: pageHeight } = event.data as SchedulerState & { height?: unknown };
    if (typeof pageHeight==='number' && pageHeight>0) height.value=Math.min(Math.max(pageHeight,640),20000);
    if (typeof view==='string' && Array.isArray(steps)) emit('state',{ view, steps });
  }
}
/** Opens a workbench step (home, load-method, school-times, checks, review, teacher). */
function showView(view: string) {
  frame.value?.contentWindow?.postMessage({type:'SNCS_SCHEDULER_SHOW',view},window.location.origin);
}
defineExpose({ showView });
watch(()=>props.accessToken,()=>{
  if (denied.value) {denied.value=false;reload.value++;}
  sendSession();
});
onMounted(()=>window.addEventListener('message',receive));
onUnmounted(()=>window.removeEventListener('message',receive));
</script>

<template>
  <section class="coordinator-scheduler" aria-label="Scheduling workspace">
    <div v-if="denied" class="scheduler-access-error" role="alert">
      <h2>Scheduling access could not be verified</h2>
      <p>Your session or staff role may have changed. Sign in again before editing schedules.</p>
      <a href="/login">Return to staff sign in</a>
    </div>
    <iframe
      v-else :key="reload" ref="frame" title="Academic Coordinator scheduling workspace"
      src="/api/scheduler?asset=index.html" sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
      referrerpolicy="same-origin" :style="height ? { height: `${height}px` } : undefined" @load="sendSession"
    />
  </section>
</template>

<style scoped>
.coordinator-scheduler { width:100%; }
iframe { display:block;width:100%;min-height:640px;height:1300px;border:0;background:transparent; }
.scheduler-access-error { padding:1.5rem;border:1px solid var(--line);border-radius:8px;background:white; }
@media (max-width:760px) { iframe { height:1500px; } }
</style>
