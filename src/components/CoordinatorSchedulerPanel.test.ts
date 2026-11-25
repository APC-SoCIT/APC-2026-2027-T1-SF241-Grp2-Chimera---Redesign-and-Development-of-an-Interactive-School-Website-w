// @vitest-environment jsdom
import {mount} from '@vue/test-utils';
import {expect,it,vi} from 'vitest';
import CoordinatorSchedulerPanel from './CoordinatorSchedulerPanel.vue';

it('sends the current session only to its own same-origin frame and renews it on refresh',async()=>{
  const panel=mount(CoordinatorSchedulerPanel,{props:{accessToken:'first-token'},attachTo:document.body});
  try {
    const frame=panel.get('iframe').element as HTMLIFrameElement;
    const send=vi.spyOn(frame.contentWindow!,'postMessage');
    await panel.get('iframe').trigger('load');
    expect(send).toHaveBeenLastCalledWith({type:'SNCS_SCHEDULER_SESSION',token:'first-token'},window.location.origin);
    await panel.setProps({accessToken:'refreshed-token'});
    expect(send).toHaveBeenLastCalledWith({type:'SNCS_SCHEDULER_SESSION',token:'refreshed-token'},window.location.origin);
    window.dispatchEvent(new MessageEvent('message',{origin:'https://foreign.example',source:frame.contentWindow,data:{type:'SNCS_SCHEDULER_ACCESS_DENIED'}}));
    await panel.vm.$nextTick();expect(panel.find('iframe').exists()).toBe(true);
    window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:frame.contentWindow,data:{type:'SNCS_SCHEDULER_ACCESS_DENIED'}}));
    await panel.vm.$nextTick();expect(panel.find('iframe').exists()).toBe(false);expect(panel.get('[role="alert"]').text()).toContain('Sign in again');
  } finally {panel.unmount();}
});

// Gian Mandac, 20261124: the dashboard side panel opens workbench steps and follows their progress.
it('opens workbench steps and reports the workbench state from its own frame only',async()=>{
  const panel=mount(CoordinatorSchedulerPanel,{props:{accessToken:'token'},attachTo:document.body});
  try {
    const frame=panel.get('iframe').element as HTMLIFrameElement;
    const send=vi.spyOn(frame.contentWindow!,'postMessage');
    (panel.vm as unknown as {showView:(view:string)=>void}).showView('checks');
    expect(send).toHaveBeenLastCalledWith({type:'SNCS_SCHEDULER_SHOW',view:'checks'},window.location.origin);
    const state={type:'SNCS_SCHEDULER_STATE',view:'generate',steps:[{id:'loads',state:'done',note:'1 assignments · 1 teachers'}],height:1800};
    window.dispatchEvent(new MessageEvent('message',{origin:'https://foreign.example',source:frame.contentWindow,data:state}));
    expect(panel.emitted('state')).toBeUndefined();
    window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,source:frame.contentWindow,data:state}));
    await panel.vm.$nextTick();
    expect(panel.emitted('state')![0]).toEqual([{view:'generate',steps:state.steps}]);
    expect((panel.get('iframe').element as HTMLIFrameElement).style.height).toBe('1800px');
  } finally {panel.unmount();}
});
