<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';

const props=defineProps<{accessToken:string}>();
const frame=ref<HTMLIFrameElement>();
const denied=ref(false);
const reload=ref(0);
function sendSession() {
  frame.value?.contentWindow?.postMessage({type:'SNCS_SCHEDULER_SESSION',token:props.accessToken},window.location.origin);
}
function receive(event: MessageEvent) {
  if (event.origin!==window.location.origin || event.source!==frame.value?.contentWindow) return;
  if (event.data?.type==='SNCS_SCHEDULER_READY') sendSession();
  if (event.data?.type==='SNCS_SCHEDULER_ACCESS_DENIED') denied.value=true;
}
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
      referrerpolicy="same-origin" @load="sendSession"
    />
  </section>
</template>

<style scoped>
.coordinator-scheduler { width:100%; }
iframe { display:block;width:100%;min-height:1300px;border:1px solid var(--line);border-radius:10px;background:white; }
.scheduler-access-error { padding:1.5rem;border:1px solid var(--line);border-radius:8px;background:white; }
@media (max-width:760px) { iframe { min-height:1500px; } }
</style>
