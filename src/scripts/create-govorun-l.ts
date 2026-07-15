/**
 * Create a development-ready land plot in Chaloklum, north Koh Phangan —
 * owner Юра Говорун (via Миша) — in the own DB via the canonical write path.
 *
 * 1 rai 1 ngan 88 sq.wah = 2,352 m² (1.47 rai). Already cleared, engineered-fill
 * leveled to survey datum and compacted >1 year ago; subdivided into 8 building
 * plots + an internal road, 9 separate Chanote titles issued & transferred onto
 * 9 Thai companies. Price 12,000,000 THB (whole plot).
 *
 * Media screened by hand: 4 real site photos → PHOTOS (cover = mountain-backdrop
 * shot); the subdivision layout plan → object_docs (internal, never public).
 * Chanote scans stay in Drive only, never uploaded.
 *
 * Confidential (owner phone, commission, the 9-company nominee structure, DD flag)
 * lives ONLY in outreachNote — descriptionRaw is left empty because it leaks into
 * the public payload. Public copy is the bilingual descriptionManualEn/Ru.
 *
 * Run from backend/:  npx tsx src/scripts/create-govorun-l.ts
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

const SCRATCH =
  "/private/tmp/claude-501/-Users-burik-Documents-Claude-Projects-Right-Way----------------/0908caf6-c31d-4b7c-bf37-3586924c7659/scratchpad/govorun-l";
const PHOTO_DIR = `${SCRATCH}/photos_web`;
const PLAN = `${SCRATCH}/docs/subdivision-plan.jpg`;

const { db, closeDb } = await import("../db/client");
const { objects, objectPhotos, objectDocs } = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const { createObject } = await import("../lib/write");

// ---- R2 SigV4 PUT (mirrors create-insidethebox-v.ts; dependency-free) ----
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

const TITLE =
  "Development-Ready 1.47-Rai Plot in Chaloklum, Koh Phangan — Subdivided, 350 m to the Beach";

const DESC_EN =
  "A rare, fully development-ready plot of 2,352 m² (1 rai 1 ngan 88 sq.wah) in Chaloklum, on the north of Koh Phangan, just 350 metres from the sea. Everything a builder normally spends the first months on is already done and settled.\n\n" +
  "Site works, completed over a year ago: trees and topsoil were cleared and hauled away, then several hundred truckloads of engineered fill were brought in, graded to the surveyor's design levels — flush with the road along the frontage — and compacted with a heavy excavator. Because the work was finished more than a year ago, the ground has settled and the plot is ready to build on straight away, perfectly level.\n\n" +
  "Turnkey title structure: the land is already subdivided into eight building plots (277.6 / 238 / 218.8 / 201.6 / and four of 200.4 m²) served by an internal access road, with nine separate Chanote titles issued and transferred. Buy the whole estate for a small villa development, or take it as a single consolidated parcel.\n\n" +
  "Utilities & access at the boundary: a high-voltage grid line runs along the plot ready for connection; village water mains run along the frontage with government mains on the far side of the road; and the plot fronts directly onto the main public road — full access for any vehicle or machinery.\n\n" +
  "Already in place (available on top of the base price): a full perimeter fence, lighting poles and electrical wiring.\n\n" +
  "Everything is within walking distance — a gym directly opposite, an Italian restaurant 30 m away, a 7-Eleven at 80 m, and minimarkets, cafés, coffee shops, restaurants, shops, pharmacies and fruit stalls all close by. The beach is 350 m away.";

const DESC_RU =
  "Редкий, полностью подготовленный под застройку участок 2 352 м² (1 рай 1 нган 88 ва) в Чалоклуме, на севере Пангана, всего в 350 метрах от моря. Всё, на что застройщик обычно тратит первые месяцы, здесь уже сделано и улежалось.\n\n" +
  "Земляные работы выполнены больше года назад: деревья и плодородный слой срезаны и вывезены, завезено несколько сотен грузовиков грунта, распланировано по проектным отметкам геодезиста — вдоль дороги в уровень дороги — и утрамбовано тяжёлым экскаватором. Работы закончены более года назад, поэтому грунт улежался, а участок абсолютно ровный и готов к началу строительства.\n\n" +
  "Готовая структура титулов: земля уже разделена на восемь строительных участков (277,6 / 238 / 218,8 / 201,6 и четыре по 200,4 м²) с внутренней дорогой; выпущено и оформлено девять отдельных чанотов. Можно взять весь участок под небольшой посёлок вилл или как единый консолидированный лот.\n\n" +
  "Коммуникации и доступ по границе: вдоль участка проходит высоковольтная линия, готовая к подключению; вдоль фасада — поселковый водопровод, по другой стороне дороги — государственный; участок выходит прямо на основную государственную дорогу — прямой доступ для любого транспорта и техники.\n\n" +
  "Уже установлено (оплачивается сверх базовой стоимости): забор по всему периметру, столбы освещения и электроразводка.\n\n" +
  "Всё в шаговой доступности — спортзал прямо напротив, итальянский ресторан в 30 м, 7-Eleven в 80 м, рядом минимаркеты, кафе, кофейни, рестораны, магазины, аптеки и фруктовые лавки. До пляжа 350 м.";

const OUTREACH_NOTE =
  "🔴 ВНУТРЕННЕЕ — не для публичной карточки.\n" +
  "Собственник: Юра Говорун · +66 92 708 0358 · @YThail. Пришёл через Мишу (папка «От миши и Юры»).\n" +
  "Цена 12 000 000 THB за весь участок. Два варианта сделки: (а) вместе с 9 тайскими компаниями (только тайские акционеры/директора) — стоимость трансфера акций включена в цену; (б) прямой трансфер чанотов через лендофис — все расходы по трансферу на покупателе.\n" +
  "Разбивка (межевой план в DOCS): 8 строительных участков 277,6 / 238 / 218,8 / 201,6 / 200,4×4 м² + дорога 0-1-53,6 (614,4 м²). Итого 1-1-88 = 2 352 м².\n" +
  "Забор по периметру, столбы освещения, электроразводка — НЕ входят в базовую стоимость (доп. опция).\n" +
  "Коммиссия: seller-paid, зашита в цену по модели RW max(5%; 150k THB) — уточнить с собственником при листинге.\n" +
  "⚖️ DD-флаг: freehold через 9 тайских компаний (номинальная структура) — для иностранного покупателя обсудить лизхолд/структурирование и риск номиналов; L2 Transaction DD — Анас. L1 Listing Vetting: зона/доступ/документы при приёме.\n" +
  "Оригиналы 9 чанотов и межевого — только в Drive, не публиковать.";

async function main() {
  const existing = await db
    .select({ id: objects.id, rw: objects.rwNumber })
    .from(objects)
    .where(eq(objects.titleEn, TITLE));
  if (existing.length) {
    console.error(`✋ Object "${TITLE}" already exists (${existing[0].rw}, id ${existing[0].id}). Aborting.`);
    return;
  }

  console.log(`== ${TITLE}: creating land (canonical write path) ==`);
  const res = await createObject(db, {
    type: "Land",
    status: "Active",
    title: TITLE,
    district: "Chaloklum",
    documentType: "Chanote",
    tenure: ["Freehold (Thai)"],
    area: "1 rai 1 ngan 88 sq.wah (2,352 m²)",
    priceThb: 12_000_000,
    terrain: "Flat",
    roadType: "Main public road (paved)",
    waterType: "Village + government mains",
    features: ["FLAT_LAND", "ELECTRICITY", "MOUNTAIN_VIEW"],
    // Exact owner pin (resolved from maps.app.goo.gl/dc721jiZwwx9ihUS9) — guaranteed pin.
    locationUrl: "https://www.google.com/maps?q=9.7839902,100.0068944",
    contacts: [
      { role: "owner", name: "Юра Говорун", phone: "+66 92 708 0358", telegram: "@YThail", isPrimary: true },
    ],
  });
  const rw = res.rwNumber;
  console.log(`  → ${rw} (id ${res.id})`);

  console.log("== uploading media to R2 ==");
  const files = (await readdir(PHOTO_DIR)).filter((f) => f.endsWith(".jpg")).sort();
  const photoUrls: string[] = [];
  let i = 0;
  for (const f of files) {
    const url = await upload(rw, resolve(PHOTO_DIR, f), `${String(i + 1).padStart(2, "0")}.jpg`, "image/jpeg");
    photoUrls.push(url);
    i++;
  }
  const planUrl = await upload(rw, PLAN, "subdivision-plan.jpg", "image/jpeg");

  console.log("== attaching photos (cover first), subdivision plan (DOCS), bilingual copy & note, exact rai ==");
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
      name: "Subdivision layout plan",
      url: planUrl,
      visibility: "internal",
    });

    await tx
      .update(objects)
      .set({
        descriptionManualEn: DESC_EN,
        descriptionManualRu: DESC_RU,
        outreachNote: OUTREACH_NOTE,
        areaRai: 1.47, // parser rounds to 1 rai; store exact 1.47 for display
        updatedAt: new Date(),
      })
      .where(eq(objects.id, res.id));
  });

  console.log(`\n✅ Done. ${rw} — ${photoUrls.length} photos (cover = mountain-backdrop), 1 subdivision plan in DOCS.`);
  console.log(`   Public: https://rightwaygroup.co/object/${rw}`);
}

await main();
await closeDb();
