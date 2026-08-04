/**
 * Create the Hush off-plan project (Baan Tai, Koh Phangan — four 1BR pool
 * villas) in the own DB and publish its /projects landing.
 *
 * Canonical write path (createObject) allocates the RW-P number, resolves the
 * pin and inserts the row. Media: architectural renders → public gallery
 * (project is off-plan, there is nothing built to photograph yet), site
 * photographs → the construction log (`construction_updates`) that feeds
 * /projects/[slug]/construction.
 *
 * 🔴 Renders are visualisations, not photos — the copy says so explicitly.
 * The developer's own price sheet is NOT published; only the land-lease
 * schedule the seller publishes himself.
 *
 * Images are pre-compressed to ≤2000px JPEG before upload (the web uploader
 * does this with sharp; this script uploads what it is given).
 *
 * Run from backend/:  tsx src/scripts/create-hush-p.ts <dir-with-photos>
 * Env: backend/.env (DATABASE_URL) + root .env (R2_* / CLOUDFLARE_ACCOUNT_ID).
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

const { db, closeDb } = await import("../db/client");
const { objects, objectPhotos } = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const { createObject } = await import("../lib/write");

/** Каталог с подготовленными файлами: photos/ (рендеры) + construction/ (стройка). */
const MEDIA_DIR = process.argv[2];
if (!MEDIA_DIR) throw new Error("usage: tsx src/scripts/create-hush-p.ts <media-dir>");

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

/** Заливает каталог целиком в порядке имён файлов. */
async function uploadDir(rw: string, dir: string, prefix: string): Promise<string[]> {
  const files = (await readdir(resolve(MEDIA_DIR, dir))).filter((f) => /\.jpe?g$/i.test(f)).sort();
  const urls: string[] = [];
  for (const f of files) {
    const body = new Uint8Array(await readFile(resolve(MEDIA_DIR, dir, f)));
    const url = await r2Put(`objects/${rw}/2026-07/${prefix}${f}`, body, "image/jpeg");
    console.log(`  ↑ ${prefix}${f}`);
    urls.push(url);
  }
  return urls;
}

const DESC_EN =
  "Hush is a four-villa project in Baan Tai, on the south coast of Koh Phangan — ten minutes from the Thong Sala pier, the hospitals and the supermarkets, with jungle and hills starting right behind the plots.\n\n" +
  "Each villa is a one-bedroom house of 101 m² on its own 230 m² plot: 52 m² inside, a 28 m² terrace and a private 10 m² pool looking out over the trees to the sea. Sliding glass runs the full width of the living room, the kitchen and bathroom are laid in glazed green tile, ceilings are slatted timber and floors are terracotta. Air conditioning, internet, fencing and private parking are part of the build; the villa is delivered furnished.\n\n" +
  "The land is held on a 30-year lease. The first three years of ground rent are already included in the price — the schedule for the remaining years is fixed in the contract and listed under Payment.\n\n" +
  "The site is under construction: as of July 2026 the plot is cleared, the foundations are poured and the columns are up. Progress is documented with dated photo updates on the construction page. Four villas in total, all available.\n\n" +
  "Images are architectural visualisations of the project. Right Way arranges the viewing. The developer handles the sale and your own lawyer checks the documents.";

const DESC_RU =
  "Hush — проект из четырёх вилл в Бан Тай на южном побережье Ко Пангана: десять минут до пирса в Тонг Сала, больниц и супермаркетов, а сразу за участками начинаются джунгли и горы.\n\n" +
  "Каждая вилла — одноэтажный дом с одной спальней, 101 м² на собственном участке 230 м²: 52 м² внутри, терраса 28 м² и приватный бассейн 10 м² с видом поверх крон на море. Гостиная раздвигается панорамным остеклением во всю ширину, кухня и санузел выложены глазурованной зелёной плиткой, потолки — рейка, полы — терракота. Кондиционеры, интернет, забор и парковка входят в стройку; вилла сдаётся с мебелью.\n\n" +
  "Земля — в аренде на 30 лет. Первые три года аренды уже включены в цену, график на оставшийся срок зафиксирован в договоре и приведён в разделе оплаты.\n\n" +
  "Стройка идёт: на июль 2026 участок расчищен, фундамент залит, колонны подняты. Ход работ показываем фотоотчётами по датам на отдельной странице. Всего четыре виллы, свободны все.\n\n" +
  "На изображениях — визуализации проекта. Показ объекта организует Right Way. Сделку ведёт застройщик, документы проверяет ваш юрист.";

const AREA_NOTE =
  "Built-up 101 m² · living 52 m² · terrace 28 m² · private pool 10 m² · plot 230 m² (0.14 rai) · 1 bedroom · 30-year land lease";

const PAYMENT_TERMS =
  "Villa price: 4,680,000 THB.\n" +
  "Land lease — 30 years. The first 3 years of ground rent are included in the price.\n" +
  "2028–2032 — 49,700 THB / year\n" +
  "2033–2037 — 53,000 THB / year\n" +
  "2038–2042 — 54,700 THB / year\n" +
  "2043–2047 — 57,500 THB / year\n" +
  "2048–2052 — 60,300 THB / year\n" +
  "2053–2054 — 63,400 THB / year\n" +
  "Total ground rent over the 30-year term: 1,498,000 THB.";

const CONSTRUCTION_NOTE_EN =
  "Plot cleared, earthworks done, strip foundations poured and columns cast; first delivery of blockwork on site.";
const CONSTRUCTION_NOTE_RU =
  "Участок расчищен, земляные работы закончены, ленточный фундамент залит, колонны подняты; на площадку завезён первый кирпич.";

async function main() {
  console.log("== Hush: creating project (canonical write path) ==");
  const res = await createObject(db, {
    type: "Project",
    status: "Active",
    title: "Hush Villas (1BR Pool Villa)",
    district: "Ban Tai",
    stage: "Off-plan",
    condition: "Off-plan",
    furnishing: "Full",
    documentType: "Chanote",
    tenure: ["Leasehold 30 years"],
    leaseTermYears: 30,
    bedrooms: 1,
    priceThb: 4_680_000,
    area: "101 m²",
    unitsTotal: 4,
    unitsAvailable: 4,
    roadType: "Concrete",
    waterType: "Deep well",
    features: ["SEA_VIEW", "MOUNTAIN_VIEW", "JUNGLE_VIEW", "QUIET", "ELECTRICITY"],
    villaFeatures: ["POOL", "PARKING"],
    // Пин приблизительный (район Бан Тай) — точку уточняем у собственника.
    locationUrl: "https://www.google.com/maps?q=9.7145,100.0234",
    paymentTerms: PAYMENT_TERMS,
    descriptionRaw: DESC_EN,
  });
  const rw = res.rwNumber;
  console.log(`  → ${rw} (id ${res.id})`);

  console.log("== uploading media to R2 ==");
  const photoUrls = await uploadDir(rw, "photos", "");
  const sitePhotos = await uploadDir(rw, "construction", "construction/");

  console.log("== attaching photos & writing project columns ==");
  await db.transaction(async (tx) => {
    await tx.insert(objectPhotos).values(
      photoUrls.map((url, i) => ({ objectId: res.id, url, sort: i, isCover: i === 0, visibility: "public" })),
    );
    await tx
      .update(objects)
      .set({
        areaNote: AREA_NOTE,
        coordsApprox: true,
        descriptionManualEn: DESC_EN,
        descriptionManualRu: DESC_RU,
        constructionUpdates: [
          {
            date: "July 2026",
            dateRu: "Июль 2026",
            note: CONSTRUCTION_NOTE_EN,
            noteRu: CONSTRUCTION_NOTE_RU,
            photos: sitePhotos,
          },
        ],
        updatedAt: new Date(),
      })
      .where(eq(objects.id, res.id));
  });

  const [row] = await db.select({ lat: objects.lat, lng: objects.lng }).from(objects).where(eq(objects.id, res.id));
  console.log("== done ==");
  console.log(`  ${rw} · gallery ${photoUrls.length} · construction ${sitePhotos.length}`);
  console.log(`  pin (approx): ${row?.lat}, ${row?.lng}`);
  console.log(`  public: https://rightwaygroup.co/projects/hush-villas`);
}

await main();
await closeDb();
