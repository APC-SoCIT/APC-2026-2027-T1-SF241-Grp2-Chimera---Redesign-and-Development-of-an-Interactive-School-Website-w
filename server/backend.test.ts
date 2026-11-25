import request from 'supertest';
import {expect,it} from 'vitest';
import {createBackendApp} from './backend.js';

it('starts with missing enrollment credentials, keeps scheduling routes and fails enrollment closed',async()=>{
  const app=createBackendApp({NODE_ENV:'test'});
  const health=await request(app).get('/api/health').expect(200);
  expect(health.body).toMatchObject({status:'running',enrollmentConfigured:false,schedulerConfigured:false});
  await request(app).get('/api/enrollment/config').expect(503);
  await request(app).get('/api/scheduler?path=%2Fapi%2Fworkspaces').expect(401);
  await request(app).get('/api/scheduler?asset=index.html').expect(200);
});
