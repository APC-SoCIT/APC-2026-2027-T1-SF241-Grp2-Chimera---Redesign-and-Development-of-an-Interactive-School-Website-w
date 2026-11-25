import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import request from 'supertest';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,sep} from 'node:path';
import {createClient} from '@supabase/supabase-js';
import {createSchedulerApi} from '../../server/scheduler.js';

vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn(()=>({
  auth:{getUser:async()=>({data:{user:{id:'synthetic-coordinator'}},error:null})},
  rpc:async()=>({data:'academic_coordinator',error:null}),
}))}));
let python:ChildProcess,directory:string,port:number;
const secret='synthetic-gateway-secret-at-least-32-characters';
beforeAll(async()=>{
  directory=await mkdtemp(resolve(tmpdir(),'sncs-gateway-test-'));
  const code="import sys;from app import Store,make_server;s=make_server(Store(sys.argv[1]),0,sys.argv[2]);print(s.server_port,flush=True);s.serve_forever()";
  python=spawn('python',['-u','-c',code,resolve(directory,'test.sqlite3'),secret],{cwd:resolve('services/scheduler'),windowsHide:true});
  port=await new Promise<number>((done,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Python test service did not start')),10_000);
    python.once('error',error=>{clearTimeout(timer);reject(error);});
    python.stdout!.once('data',chunk=>{clearTimeout(timer);done(Number(String(chunk).trim()));});
    python.once('exit',code=>{if(!port){clearTimeout(timer);reject(new Error('Python test service exited: '+code));}});
  });
},15_000);
afterAll(async()=>{
  if(python && python.exitCode===null){const exited=new Promise<void>(done=>python.once('exit',()=>done()));python.kill();await exited;}
  if(directory){
    if(!resolve(directory).startsWith(resolve(tmpdir())+sep))throw new Error('Unexpected temporary directory');
    await rm(directory,{recursive:true,force:true});
  }
});

it('runs coordinator save, generation, immutable read and export through the real Python service',async()=>{
  const app=createSchedulerApi({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',
    SCHEDULER_URL:`http://127.0.0.1:${port}`,SCHEDULER_INTERNAL_SECRET:secret},createClient);
  const get=(path:string)=>request(app).get('/api/scheduler').query({path}).set('Authorization','Bearer synthetic-session');
  const post=(path:string,payload:unknown)=>request(app).post('/api/scheduler').query({path}).set('Authorization','Bearer synthetic-session').send(payload);
  await get('/api/health').expect(200,{status:'ready',service:'scheduler'});
  const demo=await get('/api/demo').expect(200);
  const saved=await post('/api/save',{data:demo.body}).expect(200);
  const run=await post('/api/generate',{...saved.body,seconds:3}).expect(200);
  expect(run.body.result.verified).toBe(true);expect(run.body.result.entries).toHaveLength(12);
  const frozen=await get('/api/run?id='+run.body.id).expect(200);
  expect(frozen.body.snapshot).toEqual(demo.body);
  const csv=await get('/api/export?id='+run.body.id+'&format=csv').expect(200);
  expect(csv.headers['content-disposition']).toContain('schedule.csv');expect(csv.text).toContain('teacher,subject,section');
},15_000);
