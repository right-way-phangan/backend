/**
 * One-off update of RW-P0001 (Atmos Villas) from the developer's June-2026
 * "1BR Project details" pack: new render set + construction-progress photos +
 * H.264 build video, refreshed floor plan / master plan, current staged pricing,
 * accurate area breakdown, contractor + timeline updates, and per-plot statuses.
 *
 * Media is uploaded to R2 (bucket rw-objects, same public base as the rest of
 * the catalogue); object_photos for the project are replaced wholesale (the old
 * deck renders are dropped). Marketing columns (price_stages / timeline / team /
 * video_urls / floorplan_urls) are not in the PATCH whitelist, so this writes
 * them directly — that is what one-off scripts are for in this repo.
 *
 * Run from backend/:  tsx src/scripts/update-atmos-p0001.ts
 * Env: backend/.env (DATABASE_URL, via dotenv) + root .env (R2_* — loaded below).
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../.."); // backend/src/scripts → repo root
config({ path: resolve(repoRoot, ".env") }); // R2_* + token
config({ path: resolve(repoRoot, "backend/.env") }); // DATABASE_URL

const { db, closeDb } = await import("../db/client");
const { objects, objectPhotos, projectUnits } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

const RW = "RW-P0001";
const MEDIA = "/private/tmp/claude-501/-Users-burik-Documents-Claude-Projects-Right-Way----------------/a763f297-dab0-446b-a09a-f8fe3fb250f8/scratchpad/media";

// ---- R2 SigV4 PUT (mirrors web/src/lib/storage/r2.ts; dependency-free) ----
const R2 = {
  accountId: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || "",
  bucket: process.env.R2_BUCKET || "",
  publicBase: (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, ""),
  accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
};
const sha256hex = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const encKey = (k: string) => k.split("/").map(encodeURIComponent).join("/");

async function r2Put(key: string, body: Uint8Array, contentType: string): Promise<string> {
  const host = `${R2.accountId}.r2.cloudflarestorage.com`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const uri = `/${R2.bucket}/${encKey(key)}`;
  const payloadHash = sha256hex(body);
  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signed = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonical = ["PUT", uri, "", canonicalHeaders, signed, payloadHash].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac("AWS4" + R2.secretAccessKey, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${R2.accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  const res = await fetch(`https://${host}${uri}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: auth,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
    body: body as BodyInit,
  });
  if (!res.ok) throw new Error(`R2 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return `${R2.publicBase}/${key}`;
}

async function upload(file: string, contentType: string): Promise<string> {
  const body = new Uint8Array(await readFile(resolve(MEDIA, file)));
  const url = await r2Put(`objects/${RW}/2026-06/${file}`, body, contentType);
  console.log(`  ↑ ${file} → ${url}`);
  return url;
}

// ---- media manifests (gallery order = display order; cover first) ----
const GALLERY = [
  "01-exterior-1.jpg", "02-exterior-2.jpg", "03-exterior-3.jpg",
  "04-living-kitchen.jpg", "05-living-room.jpg", "06-bedroom.jpg", "07-bathroom.jpg",
  "08-progress-original-land.jpg", "09-progress-grading.jpg",
  "10-progress-marking-layout.jpg", "11-progress-piles.jpg", "12-progress-ceremony.jpg",
];
const FLOORPLANS = ["floorplan-1br.jpg", "masterplan-plots.jpg"];
const VIDEO = "atmos-construction.mp4";
// Developer-provided Kuula 360° walkthrough of the 1BR villa (renders as a
// "watch" link in the video section). Developer's own sales channels
// (wa.me / atmos.villas / instagram) are intentionally NOT published.
const TOUR_360 =
  "https://kuula.co/share/collection/7TL6D?logo=0&info=0&fs=1&vr=1&zoom=1&sd=1&initload=0&thumbs=1&margin=19";

// Per-plot master plan (sizes m²); plot 8 is the sold one.
const PLOTS: Record<number, { area: number; sold?: boolean }> = {
  1: { area: 367.3 }, 2: { area: 344.1 }, 3: { area: 367.5 }, 4: { area: 320.0 },
  5: { area: 369.6 }, 6: { area: 377.3 }, 7: { area: 369.6 }, 8: { area: 383.1, sold: true },
};

async function main() {
  console.log(`== Atmos ${RW}: uploading media to R2 ==`);
  const galleryUrls: string[] = [];
  for (const f of GALLERY) galleryUrls.push(await upload(f, "image/jpeg"));
  const floorplanUrls: string[] = [];
  for (const f of FLOORPLANS) floorplanUrls.push(await upload(f, "image/jpeg"));
  const videoUrl = await upload(VIDEO, "video/mp4");

  const [obj] = await db.select({ id: objects.id }).from(objects).where(eq(objects.rwNumber, RW));
  if (!obj) throw new Error(`${RW} not found`);

  console.log(`== replacing photos & updating columns ==`);
  await db.transaction(async (tx) => {
    // Replace the whole gallery (drop old deck renders).
    await tx.delete(objectPhotos).where(eq(objectPhotos.objectId, obj.id));
    await tx.insert(objectPhotos).values(
      galleryUrls.map((url, i) => ({
        objectId: obj.id,
        url,
        sort: i,
        isCover: i === 0,
        visibility: "public",
      })),
    );

    await tx
      .update(objects)
      .set({
        priceThb: 4_690_000,
        areaNote:
          "Plot 320–383 m² · built-up 105 m² · usable 158 m² · indoor 57 m² · " +
          "covered terrace 33 m² · private pool 15 m² · BBQ 10 m² · parking & walkways 47 m² · ceiling 3.3 m",
        floorplanUrls,
        videoUrls: [videoUrl, TOUR_360],
        priceStages: [
          { label: "Current price", value: "฿4,690,000" },
          { label: "Stage 2", value: "฿4,990,000" },
          { label: "Stage 3", value: "฿5,290,000" },
          { label: "Stage 4", value: "฿5,690,000" },
          { label: "Est. completed value", value: "~฿5,890,000" },
        ],
        timeline: [
          { date: "May–Aug 2025", event: "Plot selected, due diligence, deposit" },
          { date: "Sep–Nov 2025", event: "Leasehold signed & registered at the Land Office" },
          { date: "Dec 2025–Apr 2026", event: "Design, permits, site preparation" },
          { date: "May–Jun 2026", event: "Construction underway — piling & first villa started" },
          { date: "Dec 2026–Jan 2027", event: "First villa completed" },
          { date: "Feb–Oct 2027", event: "Villas 2–8 completed & full project handover" },
        ],
        team: [
          { role: "General contractor", name: "First Construction 47 (licensed · est. 2023)" },
          { role: "Architecture & design", name: "Nine Develop & Design" },
          { role: "Architect", name: "Aleksei Ermakov" },
          { role: "3D visualization", name: "Chayanin Anantasech" },
          { role: "Warranty", name: "5 years structure · 2 years finishing" },
        ],
        updatedAt: new Date(),
      })
      .where(eq(objects.id, obj.id));

    // Per-plot statuses + areas so the units table matches the master plan.
    for (const [n, p] of Object.entries(PLOTS)) {
      await tx
        .update(projectUnits)
        .set({ areaSqm: p.area, status: p.sold ? "Sold" : "Active", priceThb: 4_690_000, bedrooms: 1 })
        .where(eq(projectUnits.unitCode, `${RW}-${n}`));
    }
  });

  console.log("== done ==");
  console.log(`  gallery: ${galleryUrls.length} photos (cover = ${GALLERY[0]})`);
  console.log(`  floorplans: ${floorplanUrls.length}  · video: 1`);
  console.log(`  price: ฿4,690,000  · plots: 7 Active / 1 Sold (plot 8)`);
}

await main();
await closeDb();
