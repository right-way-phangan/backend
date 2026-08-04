/**
 * Дозаполнение двух проектов Виты по её ответам от 2026-08-04 и публикация:
 * RW-P0020 Tropical Villas + RW-P0021 Skyline Villas.
 *
 * Оба объекта были заведены скрытыми (status Hold, без фото) — двойной гейт
 * getPublicObjects держал их вне сайта. Скрипт заливает подготовленные рендеры
 * в R2, дописывает колонки закрытыми вопросами (документ/срок аренды/гарантии/
 * депозит/налоги/участок/фазы/цены в THB) и флипает статус в Active.
 *
 * Медиа-каталог: <dir>/RW-P0020/{photos,plans}/ и <dir>/RW-P0021/{photos,plans,video}/.
 * Порядок галереи — по имени файла, обложка — первый.
 *
 * Запуск из backend/: tsx src/scripts/update-vita-projects.ts <media-dir>
 * Env: backend/.env (DATABASE_URL) + корневой .env (R2_*).
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

const MEDIA_DIR = process.argv[2];
if (!MEDIA_DIR) throw new Error("usage: tsx src/scripts/update-vita-projects.ts <media-dir>");

// ---- R2 SigV4 PUT (как в create-hush-p.ts) ----
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
async function uploadDir(rw: string, sub: string, ext: RegExp, contentType: string): Promise<string[]> {
  const dir = resolve(MEDIA_DIR, rw, sub);
  const files = (await readdir(dir)).filter((f) => ext.test(f)).sort();
  const urls: string[] = [];
  for (const f of files) {
    const body = new Uint8Array(await readFile(resolve(dir, f)));
    const url = await r2Put(`objects/${rw}/2026-08/${sub}/${f}`, body, contentType);
    console.log(`  ↑ ${sub}/${f}`);
    urls.push(url);
  }
  return urls;
}

// ---- Тексты (ответы Виты 2026-08-04 сведены в описания) ----

const TROPICAL_EN =
  "Tropical Villas is a boutique complex of eight one-bedroom villas in Srithanu, a five-minute drive from the sea and inside the island's most built-up district — cafés, yoga studios and shops are within walking distance.\n\n" +
  "Each single-storey villa is 70 m²: 55 m² indoors plus a 15 m² terrace, delivered fully furnished — equipped kitchen, washing machine, dishwasher, air conditioning and built-in furniture. On the grounds: a shared 32 m² pool, parking, a private well with an individual water tank for every villa, landscaped gardens. A management company handles check-in, housekeeping and a 24/7 concierge.\n\n" +
  "The land is Chanote title leased for 30 years — about 29 years remain at handover. A foreign buyer purchases as a private individual: a long-term lease on the villa plus a sublease of the plot. The building permit is pending.\n\n" +
  "Price THB 4,500,000. Reservation deposit THB 50,000, first payment 30%, the balance in tranches up to handover. At registration with the Land Department the buyer pays the 1.1% building-and-land tax; payment in USDT carries no cash-out fee. Warranty — 5 years on the structure, 2 years on finishes and engineering systems.\n\n" +
  "Construction runs from April 2026 to March 2027. Seven of the eight villas are available — villa 5 is sold. The team's previous project on Koh Phangan is the Usiku complex.\n\n" +
  "The images are project visualisations. Right Way arranges the viewing.";

const TROPICAL_RU =
  "Tropical Villas — бутик-комплекс из восьми вилл с одной спальней в Шритану, в пяти минутах езды до моря и в самом обжитом районе острова: кафе, йога-студии и магазины в пешей доступности.\n\n" +
  "Каждая одноэтажная вилла — 70 м²: 55 м² внутри плюс терраса 15 м². Сдаётся полностью меблированной: оснащённая кухня, стиральная и посудомоечная машины, кондиционеры, встроенная мебель. На территории — общий бассейн 32 м², парковка, собственная скважина с отдельным баком воды на каждую виллу, озеленение. Управляющая компания берёт на себя заселение, уборку и консьерж 24/7.\n\n" +
  "Земля с чанотом, в аренде на 30 лет — к передаче объекта остаётся около 29 лет. Иностранец покупает как физическое лицо: долгосрочная аренда виллы плюс субаренда участка. Разрешение на строительство ожидается.\n\n" +
  "Цена — 4 500 000 THB. Резервационный депозит 50 000 THB, первый платёж 30%, остаток — траншами до передачи. При регистрации в Земельном департаменте покупатель платит налог на строение и землю 1,1%; при оплате в USDT комиссия за обналичивание не взимается. Гарантия — 5 лет на здание, 2 года на отделку и инженерные системы.\n\n" +
  "Строительство идёт с апреля 2026 по март 2027. Свободны семь вилл из восьми — вилла №5 продана. Прошлый проект команды на Пангане — комплекс Usiku.\n\n" +
  "На изображениях — визуализации проекта. Показ объекта организует Right Way.";

const SKYLINE_EN =
  "Skyline Villas is a gated cluster of sea-view pool villas an eight-minute walk from Mae Haad beach, on the grounds of Venera Village in the north-west of Koh Phangan — the Moon and PRAYA restaurants, a large pool and a children's playground are already open on site.\n\n" +
  "Each single-storey villa is 162 m² built-up on a plot of about 280 m²: two master bedrooms with their own bathrooms, a 45.8 m² living-dining-kitchen space, a 38 m² terrace and a private 22.75 m² pool. Panoramic glazing, sea views from every room. Delivered with a full completion package — sanitary ware, kitchen and appliances, air conditioning, rattan terrace furniture, textiles and built-in furniture. A management company runs reception, check-in and housekeeping.\n\n" +
  "The land is Chanote title, held on a long-term lease registered to the buyer as a private individual. The building permit is pending.\n\n" +
  "Price from THB 11,500,000 at launch and THB 12,300,000 once the foundations are complete; payment is staged over about 18 months — a 20% deposit plus tranches tied to construction milestones.\n\n" +
  "The project totals 14 villas. Phase 1 is sold out; phase 2 brings five more pool villas of the same type and two 90 m² villas without a pool. A fourth phase adds 24 apartments of about 50 m², with construction starting at the end of September 2026. Handover of the villas — August 2027.\n\n" +
  "The team's previous project in Venera Village is the PRAYA restaurant.\n\n" +
  "The images are project visualisations. Right Way arranges the viewing.";

const SKYLINE_RU =
  "Skyline Villas — закрытый посёлок вилл с бассейном и видом на море в восьми минутах ходьбы от пляжа Mae Haad, на территории Venera Village на северо-западе Ко Пангана: рестораны Moon и PRAYA, большой бассейн и детская площадка здесь уже работают.\n\n" +
  "Каждая одноэтажная вилла — 162 м² застройки на участке около 280 м²: две спальни-мастер со своими санузлами, единое пространство гостиная-столовая-кухня 45,8 м², терраса 38 м² и приватный бассейн 22,75 м². Панорамное остекление, вид на море из каждой комнаты. Сдаётся с полным пакетом отделки: сантехника, кухня и техника, кондиционеры, ротанговая мебель на террасе, текстиль, встроенная мебель. Управляющая компания держит ресепшн, заселение и уборку.\n\n" +
  "Земля с чанотом, оформляется долгосрочной арендой на покупателя как на физическое лицо. Разрешение на строительство ожидается.\n\n" +
  "Цена — от 11 500 000 THB на старте и 12 300 000 THB после готовности фундамента; оплата поэтапная примерно на 18 месяцев: депозит 20% плюс транши по вехам стройки.\n\n" +
  "Всего в проекте 14 вилл. Первая очередь распродана; вторая — ещё пять вилл с бассейном того же типа и две виллы 90 м² без бассейна. Четвёртой очередью добавятся 24 апартамента примерно по 50 м², начало строительства — конец сентября 2026. Передача вилл — август 2027.\n\n" +
  "Прошлый проект команды в Venera Village — ресторан PRAYA.\n\n" +
  "На изображениях — визуализации проекта. Показ объекта организует Right Way.";

async function main() {
  console.log("== RW-P0020 Tropical Villas ==");
  const tropicalPhotos = await uploadDir("RW-P0020", "photos", /\.jpe?g$/i, "image/jpeg");
  const tropicalPlans = await uploadDir("RW-P0020", "plans", /\.jpe?g$/i, "image/jpeg");

  console.log("== RW-P0021 Skyline Villas ==");
  const skylinePhotos = await uploadDir("RW-P0021", "photos", /\.jpe?g$/i, "image/jpeg");
  const skylinePlans = await uploadDir("RW-P0021", "plans", /\.jpe?g$/i, "image/jpeg");
  const skylineVideo = await uploadDir("RW-P0021", "video", /\.mp4$/i, "video/mp4");

  const rows = await db
    .select({ id: objects.id, rwNumber: objects.rwNumber })
    .from(objects);
  const idOf = (rw: string) => {
    const row = rows.find((r) => r.rwNumber === rw);
    if (!row) throw new Error(`${rw} not found`);
    return row.id;
  };
  const tropicalId = idOf("RW-P0020");
  const skylineId = idOf("RW-P0021");

  console.log("== writing DB ==");
  await db.transaction(async (tx) => {
    // Фото: переливка идемпотентна — старые строки объекта заменяем целиком.
    await tx.delete(objectPhotos).where(eq(objectPhotos.objectId, tropicalId));
    await tx.delete(objectPhotos).where(eq(objectPhotos.objectId, skylineId));
    await tx.insert(objectPhotos).values([
      ...tropicalPhotos.map((url, i) => ({
        objectId: tropicalId,
        url,
        sort: i,
        isCover: i === 0,
        visibility: "public",
      })),
      ...skylinePhotos.map((url, i) => ({
        objectId: skylineId,
        url,
        sort: i,
        isCover: i === 0,
        visibility: "public",
      })),
    ]);

    await tx
      .update(objects)
      .set({
        status: "Active",
        documentType: "Chanote",
        leaseTermYears: 30,
        unitsTotal: 8,
        unitsAvailable: 7,
        parking: true,
        areaNote:
          "Villa 70 m² total · 55 m² indoors · terrace 15 m² · plot ~120 m² per villa · shared 32 m² pool",
        paymentTerms:
          "Reservation deposit THB 50,000 · first payment 30% · balance in 9 tranches of 10% up to handover · 1.1% building-and-land tax at registration paid by the buyer · USDT accepted with no cash-out fee",
        floorplanUrls: tropicalPlans,
        descriptionRaw: TROPICAL_EN,
        descriptionManualEn: TROPICAL_EN,
        descriptionManualRu: TROPICAL_RU,
        updatedAt: new Date(),
      })
      .where(eq(objects.id, tropicalId));

    await tx
      .update(objects)
      .set({
        status: "Active",
        documentType: "Chanote",
        leaseTermYears: 30,
        priceThb: 11_500_000,
        unitsTotal: 14,
        unitsAvailable: 7,
        pool: true,
        seaView: true,
        gated: true,
        areaNote:
          "Built-up 162 m² · living-dining-kitchen 45.8 m² · bedrooms 16.8 + 18.5 m² · terrace 38.25 m² · private pool 22.75 m² · plot ~280 m²",
        paymentTerms:
          "20% deposit, then tranches tied to construction milestones over about 18 months up to handover",
        priceStages: [
          { label: "At launch", value: "THB 11,500,000" },
          { label: "After foundations", value: "THB 12,300,000" },
        ],
        timeline: [
          { date: "12.2025", event: "Construction start" },
          { date: "07.2026", event: "Phase 2 start" },
          { date: "09.2026", event: "Phase 4 — 24 apartments, construction start" },
          { date: "08.2027", event: "Handover" },
        ],
        floorplanUrls: skylinePlans,
        videoUrls: skylineVideo,
        descriptionRaw: SKYLINE_EN,
        descriptionManualEn: SKYLINE_EN,
        descriptionManualRu: SKYLINE_RU,
        updatedAt: new Date(),
      })
      .where(eq(objects.id, skylineId));
  });

  console.log("== done ==");
  console.log(`  RW-P0020 · gallery ${tropicalPhotos.length} · plans ${tropicalPlans.length}`);
  console.log(
    `  RW-P0021 · gallery ${skylinePhotos.length} · plans ${skylinePlans.length} · video ${skylineVideo.length}`,
  );
}

await main();
await closeDb();
