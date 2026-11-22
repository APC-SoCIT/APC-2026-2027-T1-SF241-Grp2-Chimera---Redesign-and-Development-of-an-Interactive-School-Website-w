import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const local={};
for(const name of ['.env','.env.local']) {
  const path=resolve(root,name);
  if(existsSync(path)) Object.assign(local,parseEnv(readFileSync(path,'utf8')));
}
// Deployment/process variables take priority; .env.local overrides legacy .env.
const env={...local,...process.env};
const children=[];
let stopping=false;
function stop(code=0) {
  if(stopping)return;stopping=true;
  for(const child of children)if(!child.killed)child.kill();
  process.exitCode=code;
}
if(env.SCHEDULER_AUTOSTART==='true' && env.NODE_ENV!=='production') {
  const url=new URL(env.SCHEDULER_URL || 'http://127.0.0.1:8766');
  if(url.hostname!=='127.0.0.1' || url.protocol!=='http:' || !url.port) throw new Error('Local scheduler autostart requires an explicit http://127.0.0.1:PORT URL.');
  const venv=resolve(root,'services/scheduler/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  const python=env.SCHEDULER_PYTHON || (existsSync(venv)?venv:'python');
  const args=['app.py','serve','--port',url.port,'--gateway'];
  if(env.SCHEDULER_DB)args.push('--db',resolve(root,env.SCHEDULER_DB));
  const child=spawn(python,args,{cwd:resolve(root,'services/scheduler'),env,stdio:'inherit',windowsHide:true});
  child.on('error',()=>console.error('Could not start Python scheduling. Install services/scheduler/requirements.txt and check SCHEDULER_PYTHON.'));
  children.push(child);
}
const args=['--import','tsx',...(process.argv.includes('--watch')?['--watch']:[]),'server/index.ts'];
const server=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',windowsHide:true});
children.push(server);
server.on('error',()=>{console.error('Could not start the school backend. Install the locked Node dependencies.');stop(1);});
server.on('exit',code=>stop(code??1));
process.on('SIGINT',()=>stop());
process.on('SIGTERM',()=>stop());
