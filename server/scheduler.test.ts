import request from 'supertest';
import { beforeEach,expect,it,vi } from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {createSchedulerApi} from './scheduler.js';

const {getUser,rpc}=vi.hoisted(()=>({getUser:vi.fn(),rpc:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn(()=>({auth:{getUser},rpc}))}));
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_example',
  SCHEDULER_URL:'http://127.0.0.1:8766',SCHEDULER_INTERNAL_SECRET:'test-internal-secret-at-least-32-characters',APP_ORIGIN:'http://localhost:5173'};
const forward=vi.fn<typeof fetch>();
const app=()=>createSchedulerApi(env,createClient,forward);
const path='/api/scheduler?path='+encodeURIComponent('/api/workspaces');
beforeEach(()=>{
  vi.clearAllMocks();getUser.mockResolvedValue({data:{user:{id:'coordinator'}},error:null});
  rpc.mockResolvedValue({data:'academic_coordinator',error:null});
  forward.mockResolvedValue(new Response(JSON.stringify([]),{headers:{'content-type':'application/json'}}));
});

it('serves only the empty shell and known assets without exposing scheduling data',async()=>{
  const shell=await request(app()).get('/api/scheduler?asset=index.html').expect(200);
  expect(shell.text).toContain('/api/scheduler?asset=portal.js');
  // Staff dashboard look and side panel bridge (Gian Mandac, 20261124)
  expect(shell.text).toContain('/api/scheduler?asset=portal.css');
  expect(shell.text).toContain('/api/scheduler?asset=portal-ui.js');
  const css=await request(app()).get('/api/scheduler?asset=portal.css').expect(200);
  expect(css.headers['content-type']).toContain('text/css');
  expect(shell.text).not.toContain('sb_publishable_example');
  expect(shell.headers['content-security-policy']).toContain("frame-ancestors 'self'");
  await request(app()).get('/api/scheduler?asset=../../.env.local').expect(404);
  await request(app()).get(path).expect(401);
  expect(getUser).not.toHaveBeenCalled();expect(forward).not.toHaveBeenCalled();
});
it.each(['teacher','registrar','admin','password-change',null])('blocks the non-coordinator role %s',async role=>{
  rpc.mockResolvedValue({data:role,error:null});
  await request(app()).get(path).set('Authorization','Bearer test-token').expect(403);
  expect(forward).not.toHaveBeenCalled();
});
it('verifies the token and current database role before forwarding without browser credentials',async()=>{
  await request(app()).get(path).set('Authorization','Bearer test-token').set('Cookie','private=secret').expect(200);
  expect(getUser).toHaveBeenCalledWith('test-token');expect(rpc).toHaveBeenCalledWith('get_staff_portal_role');
  expect(createClient).toHaveBeenCalledWith(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY,expect.objectContaining({global:{headers:{Authorization:'Bearer test-token'}}}));
  const [url,options]=forward.mock.calls[0];
  expect(String(url)).toBe('http://127.0.0.1:8766/api/workspaces');
  expect(options?.headers).toEqual({'X-SNCS-Gateway':env.SCHEDULER_INTERNAL_SECRET,'X-SNCS-Local':'1'});
  expect(options?.redirect).toBe('error');
});
it('rejects expired sessions and role lookup outages without calling Python',async()=>{
  getUser.mockResolvedValueOnce({data:{user:null},error:{status:401}});
  await request(app()).get(path).set('Authorization','Bearer expired').expect(401);
  rpc.mockResolvedValueOnce({data:null,error:{message:'offline'}});
  await request(app()).get(path).set('Authorization','Bearer valid').expect(503);
  expect(forward).not.toHaveBeenCalled();
});
it('forwards coordinator saves and frozen exports while preserving status and content',async()=>{
  const route='/api/scheduler?path='+encodeURIComponent('/api/save');
  await request(app()).post(route).set('Authorization','Bearer test-token').set('Origin',env.APP_ORIGIN).send({data:{period:'test'}}).expect(200);
  expect(Buffer.from(forward.mock.calls[0][1]?.body as Buffer).toString()).toContain('"period":"test"');
  forward.mockResolvedValueOnce(new Response('day,start\nMon,07:30',{headers:{'content-type':'text/csv','content-disposition':'attachment; filename="schedule.csv"'}}));
  const exported=await request(app()).get('/api/scheduler?path='+encodeURIComponent('/api/export?id=run&format=csv')).set('Authorization','Bearer test-token').expect(200);
  expect(exported.text).toContain('Mon,07:30');expect(exported.headers['content-disposition']).toContain('schedule.csv');
});
it('rejects foreign-origin writes and arbitrary proxy destinations',async()=>{
  await request(app()).post('/api/scheduler?path=%2Fapi%2Fsave').set('Authorization','Bearer token').set('Origin','https://foreign.example').send({}).expect(403);
  await request(app()).get('/api/scheduler?path=https://foreign.example').set('Authorization','Bearer token').expect(400);
  await request(app()).get('/api/scheduler?path=%2Fapi%2Funknown').set('Authorization','Bearer token').expect(404);
  expect(forward).not.toHaveBeenCalled();
});
it('reports a disconnected Python service without exposing request contents or secrets',async()=>{
  forward.mockRejectedValueOnce(new Error(env.SCHEDULER_INTERNAL_SECRET));
  const result=await request(app()).get(path).set('Authorization','Bearer token').expect(503);
  expect(result.body.error).toContain('unavailable');expect(JSON.stringify(result.body)).not.toContain(env.SCHEDULER_INTERNAL_SECRET);
});
