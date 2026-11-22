/* Browser-only bridge: the staff dashboard supplies its current session in memory. */
(function () {
  'use strict';
  let token = '';
  let ready;
  const sessionReady = new Promise(resolve => { ready = resolve; });
  const origin = window.location.origin;
  window.addEventListener('message',event => {
    if (event.origin !== origin || event.source !== window.parent || event.data?.type !== 'SNCS_SCHEDULER_SESSION') return;
    token = typeof event.data.token === 'string' ? event.data.token : '';
    if (token) ready();
  });
  window.parent.postMessage({type:'SNCS_SCHEDULER_READY'},origin);
  function endpoint(path) {
    return '/api/scheduler?path='+encodeURIComponent(path);
  }
  window.SNCSPortal = {
    assetURL: name => '/api/scheduler?asset='+encodeURIComponent(name),
    async fetch(path,options={}) {
      await sessionReady;
      if (!token) throw new Error('Your staff session has ended. Sign in again.');
      const headers = new Headers(options.headers);
      headers.set('Authorization','Bearer '+token);
      const response = await fetch(endpoint(path),{...options,headers});
      if ([401,403].includes(response.status)) window.parent.postMessage({type:'SNCS_SCHEDULER_ACCESS_DENIED'},origin);
      return response;
    },
  };
})();
