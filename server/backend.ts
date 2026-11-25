import express from 'express';
import { configuredApp, ConfigurationError } from './runtime.js';
import { createStaffAccountsApi } from './staff-accounts.js';
import { createSchedulerApi, schedulerConfigured } from './scheduler.js';

export function createBackendApp(env = process.env) {
  const app=express();
  app.disable('x-powered-by');
  app.use(createStaffAccountsApi(env));
  app.use(createSchedulerApi(env));
  let enrollmentReady=true;
  let missing='';
  try { app.use(configuredApp(env)); }
  catch(error) {
    if (!(error instanceof ConfigurationError)) throw error;
    enrollmentReady=false;missing=error.message;
    app.use('/api/enrollment',(_req,res)=>res.status(503).json({message:'Enrollment is not configured on this backend. Scheduling and staff sign-in remain available.'}));
  }
  app.get('/api/health',(_req,res)=>res.json({status:'running',schedulerConfigured:schedulerConfigured(env),enrollmentConfigured:enrollmentReady,
    ...(!enrollmentReady && env.NODE_ENV!=='production'?{enrollmentSetup:missing}:{})}));
  return app;
}
