/**
 * Create the Verana Villas off-plan project (ARQA Development — Phase 3 of the
 * Phangaia Garden Resort, Nai Wok / Tong Sala, Koh Phangan) in the own DB and
 * publish its /projects landing.
 *
 * Canonical write path (createObject) allocates the RW-P number, resolves the
 * pin from the Google Maps link and inserts the row. Real photographs of the
 * completed same-design villas (Phases I–II) are uploaded to R2 and attached
 * directly (already screened — no documents/price sheets); drone clips + the
 * floor plan + EN/RU marketing copy are written to the off-plan columns, the
 * same way update-atmos-p0001.ts does.
 *
 * 🔴 The developer's investment memorandum (ROI / rental income / management-
 * company commission) is deliberately NOT published. No developer contact is
 * attached — leads route through Right Way.
 *
 * Run from backend/:  tsx src/scripts/create-verana-p.ts
 * Env: backend/.env (DATABASE_URL) + root .env (R2_* / CLOUDFLARE_ACCOUNT_ID).
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, "backend/.env") });

const { db, closeDb } = await import("../db/client");
const { objects, objectPhotos } = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const { createObject } = await import("../lib/write");

const PROJECT_DIR =
  "/Users/burik/Documents/Claude/Projects/Right Way - сбор компании/Презентации застройщиков/ARQA Development/Verana Villas";

// ---- R2 SigV4 PUT (mirrors update-atmos-p0001.ts; dependency-free) ----
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

async function upload(rw: string, absPath: string, key: string, contentType: string): Promise<string> {
  const body = new Uint8Array(await readFile(absPath));
  const url = await r2Put(`objects/${rw}/2026-06/${key}`, body, contentType);
  console.log(`  ↑ ${key} → ${url}`);
  return url;
}

// ---- media manifests (gallery order = display order; cover first) ----
const PHOTOS = [
  "01-exterior-pool-facade.jpg", "02-exterior-pool-garden.jpg", "03-exterior-pool-villa.jpg",
  "04-exterior-pool-bedroom-access.jpg", "05-living-sofa-tv.jpg", "06-living-poolview.jpg",
  "07-living-lounge.jpg", "08-living-sofa.jpg", "09-dining.jpg", "10-kitchen-island-dining.jpg",
  "11-kitchen-island.jpg", "12-kitchen-living.jpg", "13-kitchen-detail.jpg", "14-bedroom-poolview.jpg",
  "15-bedroom.jpg", "16-bedroom-pool-access.jpg", "17-bedroom.jpg", "18-bedroom-detail.jpg",
  "19-bathroom-tub.jpg", "20-bathroom-vanity.jpg", "21-bathroom.jpg", "22-ceiling-detail.jpg",
];
const FLOORPLAN = "12-aerial-plan.jpg"; // media/ — top-down villa layout
const VIDEOS = [
  "verana-phase-3-drone.mp4", // current phase first
  "verana-phase-1-drone.mp4",
  "verana-phase-2-drone.mp4",
];

const DESC_EN =
  "Verana Villas is the third phase of an established eco-resort on the quiet west coast of Koh Phangan — a short walk from an international school and the beach, five minutes by car from the island's main pier at Thong Sala. The first two phases are complete and their villas already operate as highly rated holiday rentals; Verana repeats the same architecture and finish, now offered off-plan.\n\n" +
  "Each two-bedroom villa is a single-storey home of 133 m² with two bedrooms, three bathrooms, an island kitchen and a bright living room under a vaulted timber ceiling. Floor-to-ceiling glass opens onto a private 24 m² pool, a 26 m² terrace and a landscaped tropical garden on a ~600 m² plot. Villas are delivered fully turnkey — furniture, appliances, air-conditioning, finishing, landscaping and the pool are all included.\n\n" +
  "The land is held on a 30-year lease with renewal. The current phase is under construction, with the first six villas handing over in November 2026; a resident café, traditional baths and a spa are planned for the shared area. A managed short-stay rental programme is available for owners who want the villa to work while they are away.\n\n" +
  "One- and three-bedroom formats are available on request. Photographs show completed villas of the same design at the resort. Right Way handles viewings, due diligence and the full transaction.";

const DESC_RU =
  "Verana Villas — третья фаза действующего эко-резорта на тихом западном побережье Ко Пангана: пешком до международной школы и пляжа, пять минут на машине до главного пирса острова в Тонг Сала. Первые две фазы уже построены, и их виллы работают как высоко оценённая аренда; Verana повторяет ту же архитектуру и отделку, теперь на стадии off-plan.\n\n" +
  "Каждая вилла с двумя спальнями — одноэтажный дом 133 м²: две спальни, три санузла, кухня-остров и светлая гостиная под высоким деревянным потолком. Панорамное остекление в пол выходит к приватному бассейну 24 м², террасе 26 м² и тропическому саду на участке ~600 м². Виллы сдаются полностью под ключ — мебель, техника, кондиционеры, чистовая отделка, ландшафт и бассейн уже включены.\n\n" +
  "Земля — в аренде на 30 лет с пролонгацией. Текущая фаза строится, первые шесть вилл сдаются в ноябре 2026; в общественной зоне запланированы кафе для резидентов, бани и СПА. Для владельцев доступна программа управления краткосрочной арендой.\n\n" +
  "Форматы с одной и тремя спальнями — по запросу. На фотографиях — построенные виллы того же дизайна в резорте. Right Way берёт на себя показы, проверку и полное сопровождение сделки.";

const AREA_NOTE =
  "Built-up 133 m² · 2 bedrooms / 3 bathrooms · island kitchen · private pool 24 m² · terrace 26 m² · landscaped plot ~600 m² · 30-year land lease";

const TIMELINE = [
  { date: "Phases I–II", event: "Completed 100% — villas operating as rated holiday rentals" },
  { date: "2026", event: "Phase III (Verana) under construction — 12 villas" },
  { date: "Nov 2026", event: "First 6 villas handover" },
  { date: "Planned", event: "Shared area — resident café, traditional baths, spa" },
];
const TEAM = [{ role: "Developer", name: "ARQA Development · Phangaia Garden Resort, Koh Phangan" }];

async function main() {
  console.log("== Verana Villas: creating project (canonical write path) ==");
  const res = await createObject(db, {
    type: "Project",
    status: "Active",
    title: "Verana Villas (2BR Pool Villa)",
    developer: "ARQA Development",
    district: "Nai Wok",
    stage: "Off-plan",
    completion: "Nov 2026 (first 6 villas)",
    furnishing: "Fully furnished",
    condition: "New",
    buildYear: 2026,
    tenure: ["Leasehold 30 years"],
    leaseTermYears: 30,
    leasePrepayment: 600_000,
    bedrooms: 2,
    bathrooms: 3,
    priceThb: 9_900_000,
    area: "133 m²",
    unitsTotal: 12,
    features: ["QUIET", "JUNGLE_VIEW"],
    villaFeatures: ["POOL", "PRIVATE_GARDEN", "GATED"],
    // Direct coords (resolved from the resort's Plus Code / Phase-1 pin) so the
    // map marker is set deterministically without depending on goo.gl redirects.
    locationUrl: "https://www.google.com/maps?q=9.7215145,99.9876952",
    descriptionRaw: DESC_EN,
  });
  const rw = res.rwNumber;
  console.log(`  → ${rw} (id ${res.id})`);

  console.log("== uploading media to R2 ==");
  const photoUrls: string[] = [];
  for (const f of PHOTOS) photoUrls.push(await upload(rw, resolve(PROJECT_DIR, "photos-real", f), f, "image/jpeg"));
  const floorplanUrl = await upload(rw, resolve(PROJECT_DIR, "media", FLOORPLAN), "floorplan-villa.jpg", "image/jpeg");
  const videoUrls: string[] = [];
  for (const f of VIDEOS) videoUrls.push(await upload(rw, resolve(PROJECT_DIR, "video", f), f, "video/mp4"));

  console.log("== attaching photos & writing off-plan columns ==");
  await db.transaction(async (tx) => {
    await tx.insert(objectPhotos).values(
      photoUrls.map((url, i) => ({ objectId: res.id, url, sort: i, isCover: i === 0, visibility: "public" })),
    );
    await tx
      .update(objects)
      .set({
        areaNote: AREA_NOTE,
        floorplanUrls: [floorplanUrl],
        videoUrls,
        timeline: TIMELINE,
        team: TEAM,
        descriptionManualEn: DESC_EN,
        descriptionManualRu: DESC_RU,
        updatedAt: new Date(),
      })
      .where(eq(objects.id, res.id));
  });

  // Read back the pin the canonical path resolved.
  const [row] = await db.select({ lat: objects.lat, lng: objects.lng }).from(objects).where(eq(objects.id, res.id));
  console.log("== done ==");
  console.log(`  ${rw} · photos ${photoUrls.length} (cover = ${PHOTOS[0]}) · videos ${videoUrls.length} · floorplan 1`);
  console.log(`  pin: ${row?.lat}, ${row?.lng}`);
  console.log(`  public: https://rightwaygroup.co/projects/verana-villas`);
}

await main();
await closeDb();
