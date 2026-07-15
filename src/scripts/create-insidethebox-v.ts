/**
 * Create "The Concrete Sanctuary" (Inside the Box) — a resale villa in Ban Nai
 * Suan, Koh Phangan — in the own DB via the canonical write path.
 *
 * Owners Женя & Лёша, 3% commission (verbal). The 3% + owner phone live only in
 * the internal descriptionRaw / outreachNote — never on the public card.
 *
 * Photos were manually screened (no chanote / registration scans / price sheets)
 * and web-sized ≤2560px; the floor plan goes to object_docs (non-public). The
 * Chanote + land-registration scans stay in Drive only, never uploaded.
 *
 * createObject() allocates the RW-V number, resolves the pin from exact coords,
 * inserts the internal owner contact and the internal commission note. Photos
 * upload to R2 under objects/{rw}/… (cover first), then a follow-up update sets
 * the bilingual public description (descriptionManualEn/Ru win over auto) and the
 * outreach note.
 *
 * Run from backend/:  npx tsx src/scripts/create-insidethebox-v.ts
 * Env: root .env (R2_* / CLOUDFLARE_ACCOUNT_ID) + backend/.env (DATABASE_URL).
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, readdir } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, "backend/.env") });

const PHOTO_DIR =
  "/private/tmp/claude-501/-Users-burik-Documents-Claude-Projects-Right-Way----------------/646c03a4-5c53-4633-bf1f-472efdedb5b7/scratchpad/insidethebox/photos_web";
const FLOORPLAN =
  "/private/tmp/claude-501/-Users-burik-Documents-Claude-Projects-Right-Way----------------/646c03a4-5c53-4633-bf1f-472efdedb5b7/scratchpad/insidethebox/docs/floorplan.pdf";

const { db, closeDb } = await import("../db/client");
const { objects, objectPhotos, objectDocs } = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const { createObject } = await import("../lib/write");

// ---- R2 SigV4 PUT (mirrors create-sands-p.ts; dependency-free) ----
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

const TITLE = "The Concrete Sanctuary — Architect-Designed Jungle Villa in Ban Nai Suan";

const DESC_EN =
  "The Concrete Sanctuary is a brand-new (2025) architect-designed villa tucked into a quiet cul-de-sac in Ban Nai Suan, backing directly onto a mature rubber forest. This is not a typical island box: clean monolithic volumes, rigid geometry and raw concrete are left honest, unhidden behind decorative styling. The house works as a calm backdrop for what matters here — jungle, light and water.\n\n" +
  "The main residence (~120 m², 2 bedrooms / 2 bathrooms) is organised as a sequence of spaces rather than a set of rooms. An open-plan kitchen and living area opens through floor-to-ceiling glass onto the forest, while gallery-like corridors connect the private and shared zones. The master suite has an en-suite bathroom and direct access to the pool. Ceilings range from 2.8 to 3.2 metres.\n\n" +
  "A separate ~45 m² guest studio sits as its own volume, with a private entrance, kitchen, bathroom, terrace and parking — ideal for guests, a home office or an independent rental.\n\n" +
  "Outdoor living centres on a 10-metre saltwater lap pool running parallel to the treeline, framed by expansive terraces. A two-car garage and additional guest parking complete the plot.\n\n" +
  "Architecture and comfort: monolithic reinforced concrete with double-layer walls and air gaps for natural cooling and quiet; premium floor-to-ceiling aluminium glazing; microcement floors, limewash walls and natural wood; whisper-quiet air conditioning, high-speed fibre internet and a full laundry.\n\n" +
  "Set on an 800 m² Chanote plot on a dead-end street, the villa offers genuine privacy — no through traffic, no crowds — while cafes, shops and yoga studios are 3–5 minutes away by bike and beaches within 10 minutes.";

const DESC_RU =
  "«The Concrete Sanctuary» — новая (2025) вилла авторской архитектуры в тихом тупике района Ban Nai Suan, задней границей выходящая прямо в зрелый каучуковый лес. Это не типовая островная «коробка»: чистые монолитные объёмы, строгая геометрия и открытый бетон не прячут за декором. Дом работает фоном для главного — джунглей, света и воды.\n\n" +
  "Основной дом (~120 м², 2 спальни / 2 санузла) организован как последовательность пространств, а не набор комнат. Кухня-гостиная открытой планировки раскрывается сквозь панорамное остекление в пол к лесу, а галерейные коридоры соединяют приватную и общую зоны. Мастер-спальня — с собственным санузлом и прямым выходом к бассейну. Высота потолков 2,8–3,2 м.\n\n" +
  "Отдельная гостевая студия (~45 м²) — самостоятельный объём с отдельным входом, кухней, санузлом, террасой и парковкой: для гостей, кабинета или независимой аренды.\n\n" +
  "Внешняя жизнь строится вокруг 10-метрового солёного lap-бассейна вдоль кромки леса и просторных террас. Гараж на две машины и дополнительная гостевая парковка завершают участок.\n\n" +
  "Архитектура и комфорт: монолитный железобетон, двойные стены с воздушным зазором для естественной прохлады и тишины; панорамное алюминиевое остекление в пол; полы из микроцемента, стены-лаймвош, натуральное дерево; бесшумные кондиционеры, быстрый оптический интернет и полноценная прачечная.\n\n" +
  "Участок 800 м² с чанотом на тупиковой улице даёт настоящую приватность — без сквозного движения и толп, — при этом кафе, магазины и йога-студии в 3–5 минутах на байке, а пляжи в пределах 10 минут.";

const OUTREACH_NOTE =
  "Собственники: Женя (Евгения, +7 925 478 7798, @Euguenya) и Лёша. Комиссия 3% — устная договорённость. " +
  "Каналы объекта: TG @insidetheb0x, IG @insidethebox_phangan, сайт kubikrumik.com/insidetheboxpng. " +
  "YouTube-тур (со времён Circle): https://www.youtube.com/watch?v=Th4-e_k0f4I — архив в наших материалах/Drive; " +
  "на карточку виллы не выводим (RW-V без видео-блока). " +
  "Оригиналы чанота (№ 256253) и регистрационного листа — только в Drive, не публиковать.";

async function main() {
  // Guard: never create a second copy on a re-run.
  const existing = await db
    .select({ id: objects.id, rw: objects.rwNumber })
    .from(objects)
    .where(eq(objects.titleEn, TITLE));
  if (existing.length) {
    console.error(`✋ Object "${TITLE}" already exists (${existing[0].rw}, id ${existing[0].id}). Aborting.`);
    return;
  }

  console.log(`== ${TITLE}: creating villa (canonical write path) ==`);
  const res = await createObject(db, {
    type: "Villa",
    status: "Active",
    stage: "Ready",
    title: TITLE,
    district: "Ban Nai Suan",
    documentType: "Chanote",
    tenure: ["Freehold (Thai)"],
    area: "800 m²",
    priceThb: 12_500_000,
    bedrooms: 3,
    bathrooms: 3,
    buildYear: 2025,
    condition: "New",
    villaFeatures: ["POOL", "PARKING"],
    features: ["JUNGLE_VIEW", "QUIET"],
    // Exact parcel coords from LandsMaps (DOL) — guaranteed pin, matches the goo.gl link.
    locationUrl: "https://www.google.com/maps?q=9.72086393,100.01003427",
    // NON-public — folded into descriptionRaw (internal notes), never rendered on the card.
    commission: "3% — устная договорённость с собственниками (Женя, Лёша).",
    contacts: [
      { role: "owner", name: "Евгения (Женя)", phone: "+7 925 478 7798", telegram: "@Euguenya", isPrimary: true },
    ],
  });
  const rw = res.rwNumber;
  console.log(`  → ${rw} (id ${res.id})  ${res.url}`);

  console.log("== uploading media to R2 ==");
  const files = (await readdir(PHOTO_DIR)).filter((f) => f.endsWith(".jpg")).sort();
  const photoUrls: string[] = [];
  let i = 0;
  for (const f of files) {
    const url = await upload(rw, resolve(PHOTO_DIR, f), `${String(i + 1).padStart(2, "0")}.jpg`, "image/jpeg");
    photoUrls.push(url);
    i++;
  }
  const floorplanUrl = await upload(rw, FLOORPLAN, "floorplan.pdf", "application/pdf");

  console.log("== attaching photos (cover first), floor plan (DOCS), bilingual description & note ==");
  await db.transaction(async (tx) => {
    await tx.insert(objectPhotos).values(
      photoUrls.map((url, idx) => ({
        objectId: res.id,
        url,
        sort: idx,
        isCover: idx === 0,
        visibility: "public",
      })),
    );

    await tx.insert(objectDocs).values({
      objectId: res.id,
      name: "Floor plan",
      url: floorplanUrl,
      visibility: "internal",
    });

    await tx
      .update(objects)
      .set({
        descriptionManualEn: DESC_EN,
        descriptionManualRu: DESC_RU,
        outreachNote: OUTREACH_NOTE,
        updatedAt: new Date(),
      })
      .where(eq(objects.id, res.id));
  });

  console.log(`\n✅ Done. ${rw} — ${photoUrls.length} photos (cover exterior), 1 floor plan in DOCS.`);
  console.log(`   Public: https://rightwaygroup.co/object/${rw}`);
  console.log(`   Rejected by vetting: ${res.rejectedPhotos?.length ?? 0}`);
}

await main();
await closeDb();
