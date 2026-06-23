// One-off read-only inspection: for every object whose PUBLIC cover is broken
// (dead blob) or a leaked screenshot, list all its photos with a live HTTP
// status, so we can decide per object: re-point cover to a working R2 photo,
// or (no usable image) hide it.
import { db, closeDb } from "../db/client";
import { objects, objectPhotos, objectDocs } from "../db/schema";
import { inArray, eq } from "drizzle-orm";

// Set A — confidential screenshots (R2, live). Set B — dead blob covers.
const RW = [
  "RW-0546", "RW-0544", // A: screenshots
  "RW-P0006", "RW-0513", "RW-0511", "RW-P0008", "RW-0522", "RW-P0013",
  "RW-L0066", "RW-L0061", "RW-L0044", "RW-P0003", "RW-P0004", "RW-P0002",
  "RW-0507",
];

const toR2 = (u: string) =>
  u.replace(/^https:\/\/[^/]*blob\.vercel-storage\.com\//, "https://pub-e6d4ecfb57d243b4801e5d6fa0a37220.r2.dev/");

async function head(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
    return r.status;
  } catch {
    return 0;
  }
}

const objs = await db
  .select({ id: objects.id, rw: objects.rwNumber, status: objects.status, type: objects.type })
  .from(objects)
  .where(inArray(objects.rwNumber, RW));

const order = new Map(RW.map((r, i) => [r, i]));
objs.sort((a, b) => (order.get(a.rw)! - order.get(b.rw)!));

for (const o of objs) {
  console.log(`\n==== ${o.rw} (id ${o.id}) ${o.type}/${o.status} ====`);
  const ph = await db.select().from(objectPhotos).where(eq(objectPhotos.objectId, o.id));
  let firstWorking: string | null = null;
  for (const p of ph) {
    const st = await head(p.url);
    const r2 = p.url.includes("blob.vercel") ? toR2(p.url) : null;
    const r2st = r2 ? await head(r2) : null;
    if (!firstWorking && st === 200) firstWorking = p.url;
    if (!firstWorking && r2st === 200) firstWorking = r2!;
    console.log(
      `   photo#${p.id} cover=${p.isCover} sort=${p.sort} live=${st}` +
        (r2 ? ` r2=${r2st}` : "") +
        `  ${p.url}`,
    );
  }
  const dc = await db.select().from(objectDocs).where(eq(objectDocs.objectId, o.id));
  console.log(`   docs(${dc.length}): ${dc.map((d) => `#${d.id}/${d.visibility}`).join(", ")}`);
  console.log(`   >>> first WORKING photo: ${firstWorking ?? "NONE — imageless"}`);
}

await closeDb();
