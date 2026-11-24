import express from 'express';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const assets = new Set(['index.html','app.js','portal.js','portal-ui.js','portal.css','style.css','timetable.js','timetable.css','workspace.js','workspace.css']);
const reads = new Set(['/api/workspaces','/api/workspace','/api/demo','/api/empty','/api/coordinator-times','/api/runs','/api/run','/api/published','/api/export','/api/health']);
const writes = new Set(['/api/import','/api/save','/api/manual-load','/api/validate','/api/generate','/api/publish']);
export function schedulerConfigured(env: NodeJS.ProcessEnv) {
  return Boolean(env.SCHEDULER_URL && (env.SCHEDULER_INTERNAL_SECRET?.length ?? 0) >= 32 &&
    (env.SUPABASE_URL || env.VITE_SUPABASE_URL) && (env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY));
}

export function createSchedulerApi(env = process.env, makeClient = createClient, forward = fetch) {
  const app = express();
  app.disable('x-powered-by');
  app.all('/api/scheduler', async (req, res, next) => {
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    const asset = req.query.asset;
    if (req.method === 'GET' && typeof asset === 'string') {
      // Only the empty application shell is public; every data request checks Auth.
      if (!assets.has(asset)) { res.status(404).json({ error:'Scheduler asset not found.' }); return; }
      const content = await readFile(resolve('services/scheduler/web',asset),'utf8');
      res.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'self'; base-uri 'none'");
      if (asset === 'index.html') {
        const html = content.replace('Saved on this computer. Staff sign-in and the school database are not connected.','Your coordinator account manages this scheduling workspace.')
          .replace('<strong>Local preparation</strong>','<strong>Coordinator scheduling</strong>')
          .replace(/(href|src)="\/([^"/]+\.(?:css|js))"/g, (_m,attr,file) => `${attr}="/api/scheduler?asset=${file}"`)
          .replace('<script src="/api/scheduler?asset=timetable.js"','<script src="/api/scheduler?asset=portal.js" defer></script><script src="/api/scheduler?asset=timetable.js"')
          // Staff dashboard look and side panel bridge (Gian Mandac, 20261124); app.js runs first.
          .replace('</head>','<link rel="stylesheet" href="/api/scheduler?asset=portal.css"><script src="/api/scheduler?asset=portal-ui.js" defer></script>\n</head>');
        res.type('html').send(html);
      } else res.type(asset.endsWith('.css')?'css':'js').send(content);
      return;
    }
    const token = /^Bearer (\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
    if (!token) { res.status(401).json({ error:'Sign in as the Academic Coordinator to use scheduling.' }); return; }
    if (!schedulerConfigured(env)) { res.status(503).json({ error:'Scheduling is not configured. Check the backend environment and start the scheduler service.' }); return; }
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL!;
    const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const client = makeClient(url,key,{ global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false} });
    const {data:{user},error} = await client.auth.getUser(token);
    if (error || !user) { res.status(error && (!error.status || error.status>=500)?503:401).json({error:'Your staff session could not be verified. Sign in again.'}); return; }
    const role = await client.rpc('get_staff_portal_role');
    if (role.error) { res.status(503).json({error:'Staff access could not be verified. Try again.'}); return; }
    if (role.data !== 'academic_coordinator') { res.status(403).json({error:'Only the Academic Coordinator can manage scheduling.'}); return; }
    const allowedOrigin = env.APP_ORIGIN;
    if (req.method !== 'GET' && req.get('origin') && req.get('origin') !== allowedOrigin) {
      res.status(403).json({error:'Scheduling changes must come from the school website.'}); return;
    }
    next();
  }, express.raw({type:()=>true,limit:'5mb'}), async (req,res) => {
    const path = req.query.path;
    if (typeof path !== 'string' || path.length>8192 || !path.startsWith('/api/')) { res.status(400).json({error:'Choose a valid scheduling action.'}); return; }
    const target = new URL(path,env.SCHEDULER_URL);
    const base = new URL(env.SCHEDULER_URL!);
    if (!['https:','http:'].includes(base.protocol) || base.username || base.password ||
        target.origin!==base.origin || !(req.method==='GET'?reads:req.method==='POST'?writes:new Set()).has(target.pathname)) {
      res.status(404).json({error:'Scheduling action not found.'}); return;
    }
    const headers: Record<string,string> = {'X-SNCS-Gateway':env.SCHEDULER_INTERNAL_SECRET!,'X-SNCS-Local':'1'};
    if (req.method==='POST') {
      const content = req.get('content-type') || '';
      if (!content.startsWith('application/json') && !content.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')) {
        res.status(415).json({error:'Use JSON or the SNCS Excel workbook.'}); return;
      }
      headers['Content-Type']=content;
    }
    // Do not forward browser cookies, bearer tokens, origins or client-controlled hosts.
    const response = await forward(target,{method:req.method,headers,body:req.method==='POST'?req.body:undefined,
      redirect:'error',signal:AbortSignal.timeout(310_000)});
    const contentType=response.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(response.status).set('Content-Type',contentType);
    const disposition=response.headers.get('content-disposition');
    if (disposition) res.set('Content-Disposition',disposition);
    res.send(Buffer.from(await response.arrayBuffer()));
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(((error,_req,res,_next) => {
    const invalid=error?.type==='entity.too.large' || error?.type==='entity.parse.failed';
    res.status(invalid?413:503).json({error:invalid?'Scheduling input is too large or invalid.':'The scheduling service is unavailable. Keep your edits and check that the Python service is running.'});
  }) satisfies express.ErrorRequestHandler);
  return app;
}
