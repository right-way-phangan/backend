/**
 * Right Way backend API — the Hono app itself, shared by every runtime:
 *   - src/api/server.ts  → @hono/node-server (local dev + any VPS)
 *   - api/index.ts       → hono/vercel handler (Vercel serverless)
 *
 * The DB driver is chosen by env in db/connect (PGLITE_DIR → PGlite, else
 * DATABASE_URL → postgres-js). On Vercel, schema migrations and the CRM seed
 * run once at deploy time (drizzle-kit + one node boot), so we skip the
 * per-cold-start work there — guarded by the VERCEL env var.
 *
 * Auth: when API_TOKEN is set, every route except /health requires
 * `Authorization: Bearer <API_TOKEN>` (the API is internet-facing). Unset → open.
 */
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "../db/connect";
import { getPublicObjects, getAllObjects } from "../lib/queries";
import { createObject, updateObject, addObjectPhotos, ObjectInputError } from "../lib/write";
import {
  createLead, listLeads, listPipelines, updateLead, seedCrm,
  getLead, addNote, addTask, toggleTask, updateLeadContact, deleteLead,
} from "../lib/crm";
import { verifyLogin } from "../lib/auth";

const API_TOKEN = process.env.API_TOKEN;
const ON_VERCEL = !!process.env.VERCEL;

const { db, driver, applyMigrations } = await createDb();
// On Vercel each cold start would otherwise re-run migrate+seed; do them once at
// deploy instead. Elsewhere (local/VPS) keep auto-migrate so deploy = pull+restart.
if (!ON_VERCEL) {
  await applyMigrations();
  seedCrm(db).catch((e) => console.warn("[crm seed] skipped:", (e as Error).message));
}

export { driver };
export const app = new Hono();

// CORS for the Next site. Bearer-token gate when API_TOKEN is set.
app.use("/*", cors());
if (API_TOKEN) {
  app.use("/*", async (c, next) => {
    if (c.req.path === "/health") return next();
    if (c.req.header("authorization") !== `Bearer ${API_TOKEN}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });
}

app.get("/health", (c) => c.json({ ok: true, driver }));

/** Verify CRM user credentials. Web issues its own session cookie on success. */
app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = await verifyLogin(db, String(email ?? ""), String(password ?? ""));
  return user ? c.json({ user }) : c.json({ error: "invalid credentials" }, 401);
});

app.get("/objects", async (c) => {
  const data = await getPublicObjects(db);
  return c.json(data);
});

app.get("/objects/all", async (c) => {
  const data = await getAllObjects(db);
  return c.json(data);
});

app.get("/objects/:rw", async (c) => {
  const rw = c.req.param("rw");
  const data = await getPublicObjects(db);
  const obj = data.find((o) => o.rwNumber === rw);
  return obj ? c.json(obj) : c.json({ error: "not found" }, 404);
});

/** Create an object (website /admin/new + Telegram bot send NewObjectInput here). */
app.post("/objects", async (c) => {
  try {
    const input = await c.req.json();
    const res = await createObject(db, input);
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof ObjectInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /objects]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

/** Update whitelisted columns by RW number (bot /edit, future CRM UI). */
app.patch("/objects/:rw", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateObject(db, c.req.param("rw"), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /objects]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

/** Append photos to an existing object (admin "add photos" uploader). */
app.post("/objects/:rw/photos", async (c) => {
  try {
    const { urls } = await c.req.json();
    const res = await addObjectPhotos(db, c.req.param("rw"), Array.isArray(urls) ? urls : []);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[POST /objects/:rw/photos]", err);
    return c.json({ error: "add photos failed" }, 500);
  }
});

// ---- CRM (Phase B): lead capture ----

/** Create a lead (+contact +note). Website forms POST here instead of amoCRM. */
app.post("/leads", async (c) => {
  try {
    const input = await c.req.json();
    const res = await createLead(db, input);
    return c.json(res, 201);
  } catch (err) {
    console.error("[POST /leads]", err);
    return c.json({ error: "create lead failed" }, 500);
  }
});

/** List leads (board / verification). */
app.get("/leads", async (c) => {
  const data = await listLeads(db);
  return c.json(data);
});

/** Pipelines + ordered stages (board columns). */
app.get("/pipelines", async (c) => {
  const data = await listPipelines(db);
  return c.json(data);
});

/** Move a lead to a stage (by key) and/or set status. */
app.patch("/leads/:id", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateLead(db, Number(c.req.param("id")), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /leads]", err);
    return c.json({ error: "update lead failed" }, 500);
  }
});

/** One lead with contact, notes and tasks — the detail card. */
app.get("/leads/:id", async (c) => {
  const res = await getLead(db, Number(c.req.param("id")));
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
});

/** Edit a lead's contact details + linked object (CRM detail card editor). */
app.patch("/leads/:id/contact", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateLeadContact(db, Number(c.req.param("id")), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /leads/:id/contact]", err);
    return c.json({ error: "update contact failed" }, 500);
  }
});

/** Delete a lead (+notes/tasks, +orphan contact). Test-lead cleanup. */
app.delete("/leads/:id", async (c) => {
  try {
    const res = await deleteLead(db, Number(c.req.param("id")));
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[DELETE /leads/:id]", err);
    return c.json({ error: "delete failed" }, 500);
  }
});

app.post("/leads/:id/notes", async (c) => {
  const { text } = await c.req.json();
  const res = await addNote(db, Number(c.req.param("id")), String(text ?? ""));
  return res ? c.json(res, 201) : c.json({ error: "empty note" }, 400);
});

app.post("/leads/:id/tasks", async (c) => {
  const { title, dueAt } = await c.req.json();
  const res = await addTask(db, Number(c.req.param("id")), String(title ?? ""), dueAt ?? null);
  return res ? c.json(res, 201) : c.json({ error: "empty title" }, 400);
});

app.patch("/tasks/:id", async (c) => {
  const { done } = await c.req.json();
  const res = await toggleTask(db, Number(c.req.param("id")), Boolean(done));
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
});
