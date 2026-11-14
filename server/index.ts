/*
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import { resolve } from 'node:path';
import express from 'express';
import { configuredApp } from './runtime.js';
import { createStaffAccountsApi } from './staff-accounts.js';

const app = configuredApp();
app.use(createStaffAccountsApi());
if (process.env.NODE_ENV === 'production') {
  const dist = resolve('dist');
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api/')) { res.status(404).json({ message: 'Not found' }); return; }
    res.sendFile(resolve(dist, 'index.html'));
  });
}
app.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1', () => {
  console.info('Enrollment server ready');
});
