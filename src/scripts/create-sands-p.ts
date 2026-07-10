/**
 * Create "The Sands Haad Yao Beach" off-plan project (developer: Sands; on Haad
 * Yao Beach, north-west coast of Koh Phangan) in the own DB and publish its
 * /projects landing.
 *
 * DISTINCT from RW-P0017 "The Sands Hin Kong Villas" (Satori Group, Hin Kong):
 * different developer, location and price band. Title is set explicitly so the
 * two never collapse in the /projects grid.
 *
 * Canonical write path (createObject) allocates the RW-P number, resolves the
 * pin from the exact Google Maps coords and inserts the row + the developer
 * contact (internal — stripped from the public payload in queries.ts). Curated
 * renders / real show-home & construction photos are uploaded to R2 and attached
 * directly (already screened — no price sheets / documents). Floor plans + the
 * master plan go to floorplan_urls. Per-plot pricing lands in project_units so
 * the units table on the landing matches the developer price list.
 *
 * 🔴 Confidential and deliberately NOT published anywhere on the card: the
 * developer price list, the 4%-instalment payment plan PDF and the rental yield
 * / ROI scenario analysis. Their figures live only in the 🔒 passport. The drone
 * video waits for a Right Way YouTube channel (see passport note).
 *
 * Run from backend/:  tsx src/scripts/create-sands-p.ts
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

const MANIFEST =
  "/private/tmp/claude-501/-Users-burik-Documents-Claude-Projects-Right-Way----------------/463cf3f1-5463-48b9-85c1-02bc4ac63d86/scratchpad/upload_manifest.json";

const { db, closeDb } = await import("../db/client");
const { objects, objectPhotos, projectUnits } = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const { createObject } = await import("../lib/write");

// ---- R2 SigV4 PUT (mirrors create-verana-p.ts; dependency-free) ----
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
  const url = await r2Put(`objects/${rw}/2026-07/${key}`, body, contentType);
  console.log(`  ↑ ${key} → ${url}`);
  return url;
}

const TITLE = "The Sands Haad Yao Beach";

const DESC_EN =
  "The Sands is a gated enclave of eleven villas set directly on Haad Yao, the long white-sand bay on the quiet north-west coast of Koh Phangan — calm, shallow water, a fringing reef offshore and open sunsets over the sea.\n\n" +
  "Six single-storey beachfront villas sit right on the sand, each with five bedrooms, six bathrooms and 530–545 m² of living space on plots of up to 915 m²; one beachfront villa is a three-bedroom home. Five further villas form a second row of two-storey homes with panoramic sea views and direct beach access, five bedrooms and 420–460 m² of living space. Every villa has a private pool, a landscaped garden, covered parking and floor-to-ceiling glass that opens the living space to the water.\n\n" +
  "Residents share a landscaped park and a wellness centre with a spa and gym; a reception building anchors the entrance. The project is under construction and a show villa already stands on the beach.\n\n" +
  "A developer instalment plan is available. Right Way handles viewings, due diligence and the full transaction.";

const DESC_RU =
  "The Sands — закрытый комплекс из одиннадцати вилл прямо на пляже Haad Yao, длинной бухте с белым песком на тихом северо-западном побережье Ко Пангана: спокойная мелкая вода, риф у берега и открытые закаты над морем.\n\n" +
  "Шесть одноэтажных вилл первой линии стоят прямо на песке — пять спален, шесть санузлов и 530–545 м² жилой площади на участках до 915 м²; одна вилла первой линии — с тремя спальнями. Ещё пять вилл образуют второй ряд двухэтажных домов с панорамным видом на море и прямым выходом к пляжу: пять спален и 420–460 м² жилой площади. У каждой виллы — приватный бассейн, ландшафтный сад, крытая парковка и панорамное остекление в пол, раскрывающее гостиную к воде.\n\n" +
  "В общем пользовании — ландшафтный парк и wellness-центр со спа и залом; у входа — здание ресепшн. Проект строится, на пляже уже построена шоу-вилла.\n\n" +
  "Доступна рассрочка от застройщика. Right Way берёт на себя показы, проверку и полное сопровождение сделки.";

const AREA_NOTE =
  "11 villas · plots 486–915 m² · living area 420–545 m² · ten 5-bed / 6-bath + one 3-bed · " +
  "beachfront single-storey (plots 1–6) & two-storey second-row (plots 7–11) · private pool, garden & " +
  "covered parking per villa · shared wellness centre, spa & gym";

const PRICE_STAGES = [
  { label: "Beachfront 5-bed (plots 1, 2, 4–6)", value: "฿70.4M–76.9M" },
  { label: "Beachfront 3-bed (plot 3)", value: "฿59.8M" },
  { label: "Second-row 5-bed (plots 7–11)", value: "฿52.6M–59.4M" },
];

const PAYMENT_TERMS =
  "Reservation advance ฿500,000 · 20% on signing · 30% six months before handover · balance on occupancy. " +
  "A developer instalment plan is also available — 50% on signing and 50% over 3–5 years at 4% p.a. " +
  "(declining balance, no fees).";

const TIMELINE = [
  { date: "2024–2025", event: "Design & visualisation; show villa built on Haad Yao Beach" },
  { date: "2026", event: "Villas under construction" },
];
const TEAM = [{ role: "Developer", name: "Sands · Haad Yao Beach, Koh Phangan" }];

// Per-plot data from the developer price list + master plan.
// [plot, bedrooms, plotM2, usableM2, floors, priceThb, row]
const PLOTS: Array<[number, number, number, number, number, number, "Beachfront" | "Second row"]> = [
  [1, 5, 915, 544.5, 1, 70_443_000, "Beachfront"],
  [2, 5, 885, 543.25, 1, 76_940_400, "Beachfront"],
  [3, 3, 688, 437.6, 1, 59_776_000, "Beachfront"],
  [4, 5, 839, 535.65, 1, 73_628_000, "Beachfront"],
  [5, 5, 863, 533.5, 1, 74_876_000, "Beachfront"],
  [6, 5, 864, 529.65, 1, 70_435_200, "Beachfront"],
  [7, 5, 532, 457.95, 2, 59_419_200, "Second row"],
  [8, 5, 565, 441.55, 2, 55_891_000, "Second row"],
  [9, 5, 486, 420.3, 2, 52_620_400, "Second row"],
  [10, 5, 503, 422.45, 2, 55_638_000, "Second row"],
  [11, 5, 506, 434.45, 2, 58_103_600, "Second row"],
];

async function main() {
  // Guard: never create a second copy on a re-run.
  const existing = await db.select({ id: objects.id, rw: objects.rwNumber }).from(objects).where(eq(objects.titleEn, TITLE));
  if (existing.length) {
    console.error(`✋ Object "${TITLE}" already exists (${existing[0].rw}, id ${existing[0].id}). Aborting.`);
    return;
  }

  const manifest = JSON.parse(await readFile(MANIFEST, "utf8")) as {
    photos: Array<{ src: string; name: string; ct: string; sort: number; isCover: boolean }>;
    floorplans: Array<{ src: string; name: string; ct: string }>;
  };

  console.log(`== ${TITLE}: creating project (canonical write path) ==`);
  const res = await createObject(db, {
    type: "Project",
    status: "Active",
    title: TITLE,
    developer: "Sands",
    district: "Haad Yao",
    stage: "Under construction",
    bedrooms: 5,
    bathrooms: 6,
    priceThb: 52_620_400, // lowest plot — the "from" price on the card
    area: "420–545 m²",
    unitsTotal: 11,
    unitsAvailable: 11,
    features: ["BEACHFRONT", "SEA_VIEW", "QUIET"],
    villaFeatures: ["POOL", "PRIVATE_GARDEN", "GATED"],
    // Exact pin supplied by Vladimir (Haad Yao Beach frontage).
    locationUrl: "https://www.google.com/maps?q=9.775196069974024,99.96650705315216",
    descriptionRaw: DESC_EN,
    // Developer contact — internal only (stripped from the public payload).
    contacts: [
      { role: "owner", name: "Anthony (Sands · developer)", phone: "+66 95 283 3850", isPrimary: true },
    ],
  });
  const rw = res.rwNumber;
  console.log(`  → ${rw} (id ${res.id})`);

  console.log("== uploading media to R2 ==");
  const photoUrls: string[] = [];
  for (const p of manifest.photos) photoUrls.push(await upload(rw, p.src, p.name, p.ct));
  const floorplanUrls: string[] = [];
  for (const f of manifest.floorplans) floorplanUrls.push(await upload(rw, f.src, f.name, f.ct));

  console.log("== attaching photos, off-plan columns & per-plot units ==");
  await db.transaction(async (tx) => {
    await tx.insert(objectPhotos).values(
      manifest.photos.map((p) => ({
        objectId: res.id,
        url: photoUrls[p.sort],
        sort: p.sort,
        isCover: p.isCover,
        visibility: "public",
      })),
    );

    await tx
      .update(objects)
      .set({
        areaNote: AREA_NOTE,
        floorplanUrls,
        priceStages: PRICE_STAGES,
        paymentTerms: PAYMENT_TERMS,
        timeline: TIMELINE,
        team: TEAM,
        descriptionManualEn: DESC_EN,
        descriptionManualRu: DESC_RU,
        updatedAt: new Date(),
      })
      .where(eq(objects.id, res.id));

    // Per-plot units → the units table on /projects/[slug] (assembleUnits).
    await tx.delete(projectUnits).where(eq(projectUnits.objectId, res.id));
    await tx.insert(projectUnits).values(
      PLOTS.map(([plot, beds, plotM2, usableM2, floors, price, row]) => ({
        objectId: res.id,
        unitCode: `${rw}-${plot}`,
        status: "Active",
        priceThb: price,
        bedrooms: beds,
        areaSqm: plotM2,
        note: `${row} · ${floors} storey${floors > 1 ? "s" : ""} · usable ${usableM2} m²${beds === 3 ? " · 3-bed" : ""}`,
      })),
    );
  });

  const [rowPin] = await db.select({ lat: objects.lat, lng: objects.lng }).from(objects).where(eq(objects.id, res.id));
  console.log("== done ==");
  console.log(`  ${rw} · photos ${photoUrls.length} (cover = ${manifest.photos[0].name}) · floorplans ${floorplanUrls.length} · units 11`);
  console.log(`  pin: ${rowPin?.lat}, ${rowPin?.lng}`);
  console.log(`  public: https://rightwaygroup.co/projects/ (slug from title)`);
}

await main();
await closeDb();
