/**
 * Node-server entrypoint for the Right Way API — local dev and any VPS.
 * The Hono app lives in app.ts (shared with the Vercel handler in api/index.ts).
 *
 *   PGLITE_DIR=./.pgdata npm run api:local   # local PGlite
 *   DATABASE_URL=postgres://… npm run api     # any Postgres / VPS
 */
import { serve } from "@hono/node-server";
import { app, driver } from "./app";

const PORT = Number(process.env.API_PORT ?? 8787);
const API_TOKEN = process.env.API_TOKEN;

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(
    `✓ Right Way API on http://localhost:${info.port}  (driver=${driver}${API_TOKEN ? ", auth=on" : ""})`,
  );
});
