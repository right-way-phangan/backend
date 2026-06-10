/**
 * Source for the Vercel serverless function. The `build` script esbuild-bundles
 * this (and all of src/**) into a single api/index.js so the lambda has no
 * unresolved cross-directory TS imports at runtime (npm packages stay external).
 *
 * Vercel's Node runtime invokes per-HTTP-method Web-standard handlers (the same
 * `(request: Request) => Response` shape Hono speaks). A single `export default`
 * is treated as the legacy `(req, res)` signature, which breaks Hono — so we
 * export each method bound to the shared app via hono/vercel `handle`.
 */
import { handle } from "hono/vercel";
import { app } from "./app";

const h = handle(app);

export const GET = h;
export const POST = h;
export const PATCH = h;
export const PUT = h;
export const DELETE = h;
export const OPTIONS = h;
export const HEAD = h;
