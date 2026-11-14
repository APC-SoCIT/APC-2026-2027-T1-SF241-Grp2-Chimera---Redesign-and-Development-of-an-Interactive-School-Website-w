/*
 * Author: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Created Date: 20261114
 * Modified by: Jan Sultan | Email: jgsultan@student.apc.edu.ph
 * Modified Date: 20261114
 */
import express from "express";
import { randomBytes, randomUUID } from "node:crypto";
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

    const { email, fullName, password, role, action, staffId, temporaryPassword } = req.body ?? {};
    if (action === "complete-password-change") {
      const reset = user.app_metadata?.chimera_staff_action;
      if (!user.email || reset?.action !== "reset-password" || typeof reset.request_id !== "string") {
        res.status(403).json({ message: "This session has no pending staff password reset." });
        return;
      }
      if (typeof temporaryPassword !== "string" || !temporaryPassword || Buffer.byteLength(temporaryPassword) > 72 ||
        typeof password !== "string" || password === temporaryPassword ||
        password.length < 12 || Buffer.byteLength(password) > 72) {
        res.status(422).json({ message: "Choose a different password of at least 12 characters and at most 72 bytes." });
        return;
      }

      // Isolate the verification session from the service-role client's authorization.
      const verification = makeClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await verification.auth.signInWithPassword({ email: user.email, password: temporaryPassword });
      try {
        if (error || data.user?.id !== user.id) {
          res.status(403).json({ message: "Check your temporary password and try again." });
          return;
        }
        const { error: updateError } = await client.auth.admin.updateUserById(user.id, {
          password,
          app_metadata: { chimera_staff_action: { action, reset_id: reset.request_id, request_id: randomUUID() } },
        });
        if (updateError?.code === "weak_password") {
          res.status(422).json({ message: "Choose a stronger password that meets the Auth settings." });
          return;
        }
        if (updateError) throw updateError;
        res.json({ message: "Password updated." });
      } finally {
        if (data.session) await verification.auth.signOut({ scope: "local" }).catch(() => {});
      }
      return;
    }

    const { data: allowed, error: accessError } = await client.rpc("can_manage_staff_accounts", { p_user_id: user.id });
    if (accessError) throw accessError;
    if (allowed !== true) {
      res.status(403).json({ message: "You do not have permission to manage staff accounts." });
      return;
    }

    if (action === "reset-password" || action === "deactivate") {
      if (typeof staffId !== "string" || !/^[1-9][0-9]{0,18}$/.test(staffId) || BigInt(staffId) > 9223372036854775807n) {
        res.status(422).json({ message: "Choose a valid staff account." });
        return;
      }
      const { data: target, error: targetError } = await client.rpc("get_staff_auth_target", {
        p_actor_id: user.id, p_staff_id: staffId,
      });
      if (targetError) throw targetError;
      if (!target) {
        res.status(403).json({ message: "Choose another active staff account with a linked login." });
        return;
      }

      // Updating the password revokes existing Auth sessions. Deactivation never reveals it.
      const generatedPassword = randomBytes(24).toString("base64url") + "aA1!";
      const { error: updateError } = await client.auth.admin.updateUserById(target, {
        password: generatedPassword,
        ...(action === "deactivate" ? { ban_duration: "876000h" } : {}),
        app_metadata: { chimera_staff_action: { action, staff_id: staffId, actor_id: user.id, request_id: randomUUID() } },
      });
      if (updateError) throw updateError;
      res.json(action === "deactivate" ? { message: "Staff account deactivated." } : { temporaryPassword: generatedPassword });
      return;
    }
    if (action !== undefined) {
      res.status(422).json({ message: "Unknown staff account action." });
      return;
    }
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
    res.status(503).json({ message: "Could not complete the staff account request. Check the account before retrying." });
  }) satisfies express.ErrorRequestHandler);
  return app;
}
