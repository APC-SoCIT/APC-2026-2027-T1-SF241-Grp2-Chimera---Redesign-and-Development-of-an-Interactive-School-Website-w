/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 */
import express from "express";
import { createClient } from "@supabase/supabase-js";

export function createStaffAccountsApi(env = process.env, makeClient = createClient) {
  const app = express();
  app.disable("x-powered-by");
  app.post("/api/staff/accounts", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  }, express.json({ limit: "4kb" }), async (req, res) => {
    const token = /^Bearer (\S+)$/i.exec(req.get("authorization") ?? "")?.[1];
    if (!token) {
      res.status(401).json({ message: "Sign in to manage staff accounts." });
      return;
    }

    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      res.status(503).json({ message: "Staff account management is unavailable." });
      return;
    }

    // Verify the bearer token with Auth before using the server-only admin API.
    const client = makeClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: userError } = await client.auth.getUser(token);
    if (userError && (!userError.status || userError.status >= 500)) throw userError;
    if (userError || !user) {
      res.status(401).json({ message: "Your session has expired. Sign in again." });
      return;
    }

    const { data: allowed, error: accessError } = await client.rpc("can_manage_staff_accounts", { p_user_id: user.id });
    if (accessError) throw accessError;
    if (allowed !== true) {
      res.status(403).json({ message: "You do not have permission to manage staff accounts." });
      return;
    }

    const { email, fullName, password, role } = req.body ?? {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const name = typeof fullName === "string" ? fullName.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 ||
      !name || name.length > 150 || typeof password !== "string" || password.length < 12 || Buffer.byteLength(password) > 72 ||
      !["admin", "registrar", "teacher"].includes(role)) {
      res.status(422).json({ message: "Enter a valid name, email, role, and a password of at least 12 characters and at most 72 bytes." });
      return;
    }

    const { error } = await client.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      app_metadata: { chimera_staff_provisioning: { created_by: user.id, full_name: name, role } },
    });
    if (error?.code === "email_exists" || error?.code === "user_already_exists") {
      res.status(409).json({ message: "An Auth account already exists for this email." });
      return;
    }
    if (error?.code === "weak_password") {
      res.status(422).json({ message: "Choose a stronger password that meets the Auth settings." });
      return;
    }
    if (error) throw error;
    res.status(201).json({ message: "Staff account created." });
  });

  // Express requires a fourth parameter to identify error middleware.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use(((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      res.status(error.status).json({ message: "Invalid account request." });
      return;
    }
    res.status(503).json({ message: "Could not create the staff account. Check the account list before retrying." });
  }) satisfies express.ErrorRequestHandler);
  return app;
}
