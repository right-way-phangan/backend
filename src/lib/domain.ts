/**
 * API contract: own DB rows → the `RealEstateObject` shape the website already
 * consumes (web/src/types/object.ts). Keeping the field names identical means
 * the site switches source (amoCRM → own API) without touching its components.
 */
import type { ObjectRow } from "../db/schema";

type Pair = { label: string; value: string };
type TimelineRow = { date: string; event: string };
type TeamRow = { role: string; name: string };

/** Seller-side contact for an object (owner/broker/caretaker/lawyer). NON-public. */
export interface ObjectContact {
  id?: number;
  role: string; // owner | broker | caretaker | lawyer | other
  name?: string;
  phone?: string;
  line?: string;
  whatsapp?: string;
  telegram?: string;
  note?: string;
  isPrimary?: boolean;
  sort?: number;
}

export interface RealEstateObject {
  id: number;
  rwNumber: string;
  circleCode?: string;
  titleEn: string;
  type: string;
  status: string;
  district?: string;
  zone?: string;
  documentType?: string;
  tenure?: string[];
  areaRai?: number;
  areaSqm?: number;
  areaNote?: string;
  altitude?: number;
  terrain?: string;
  priceThb?: number;
  pricePerRai?: number;
  rentPerRaiMonth?: number;
  rentPerMonth?: number;
  leaseTermYears?: number;
  leaseEscPercent?: number;
  leaseEscPeriodYears?: number;
  leaseEscNotes?: string;
  leaseAdditionalTerms?: string;
  leaseRegistered?: boolean;
  bedrooms?: number;
  bathrooms?: number;
  buildYear?: number;
  condition?: string;
  pool?: boolean;
  privateGarden?: boolean;
  parking?: boolean;
  gated?: boolean;
  seaView: boolean;
  beachfront: boolean;
  mountainView: boolean;
  jungleView: boolean;
  flatLand: boolean;
  quiet: boolean;
  electricity: boolean;
  roadType?: string;
  waterType?: string;
  internetType?: string;
  stage?: string;
  developer?: string;
  completion?: string;
  paymentTerms?: string;
  furnishing?: string;
  netYieldPct?: number;
  estNetIncomeYear?: number;
  leasePrepayment?: number;
  unitsTotal?: number;
  unitsAvailable?: number;
  videoUrls?: string[];
  floorplanUrls?: string[];
  priceStages?: Pair[];
  timeline?: TimelineRow[];
  team?: TeamRow[];
  ownerName?: string;
  contacts?: ObjectContact[];
  buildingRules?: string;
  reasonForSelling?: string;
  timeOnMarketMonths?: number;
  dateAdded?: string;
  ddStatus?: string;
  ddDate?: string;
  ddLawyer?: string;
  ddChecklist?: Record<string, boolean>;
  needsReview?: boolean;
  outreachStatus?: string;
  outreachNote?: string;
  outreachDate?: string;
  outreachAttempts?: number;
  driveFolder?: string;
  locationUrl?: string;
  lat?: number;
  lng?: number;
  coordsApprox?: boolean;
  plotPolygon?: Array<[number, number]>;
  siteUrl?: string;
  coverImage?: string;
  gallery?: string[];
  docs?: Array<{ name: string; url: string }>;
  descriptionRaw?: string;
  descriptionManualEn?: string;
  descriptionManualRu?: string;
}

export interface PhotoRow {
  url: string;
  sort: number;
  isCover: boolean;
}
export interface DocRow {
  name: string;
  url: string;
}

/** null → undefined, so JSON output matches the site's `?: T` optional fields. */
const u = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** Date → Unix-seconds string, matching the `dateAdded` storage convention. */
const epochSecs = (d: Date | string | null | undefined): string | undefined =>
  d ? String(Math.floor(new Date(d).getTime() / 1000)) : undefined;

export function toDomain(
  row: ObjectRow,
  photos: PhotoRow[],
  docs: DocRow[],
  contacts: ObjectContact[] = [],
): RealEstateObject {
  const gallery = [...photos]
    .sort((a, b) => a.sort - b.sort)
    .map((p) => p.url);
  const cover = photos.find((p) => p.isCover)?.url ?? gallery[0];

  return {
    id: Number(row.amoElementId ?? row.id),
    rwNumber: row.rwNumber,
    circleCode: u(row.circleCode),
    titleEn: row.titleEn ?? row.rwNumber,
    type: row.type,
    status: row.status,
    district: u(row.district),
    zone: u(row.zone),
    documentType: u(row.documentType),
    tenure: u(row.tenure) ?? undefined,
    areaRai: u(row.areaRai),
    areaSqm: u(row.areaSqm),
    areaNote: u(row.areaNote),
    altitude: u(row.altitude),
    terrain: u(row.terrain),
    priceThb: u(row.priceThb),
    pricePerRai: u(row.pricePerRai),
    rentPerRaiMonth: u(row.rentPerRaiMonth),
    rentPerMonth: u(row.rentPerMonth),
    leaseTermYears: u(row.leaseTermYears),
    leaseEscPercent: u(row.leaseEscPercent),
    leaseEscPeriodYears: u(row.leaseEscPeriodYears),
    leaseEscNotes: u(row.leaseEscNotes),
    leaseAdditionalTerms: u(row.leaseAdditionalTerms),
    leaseRegistered: u(row.leaseRegistered),
    bedrooms: u(row.bedrooms),
    bathrooms: u(row.bathrooms),
    buildYear: u(row.buildYear),
    condition: u(row.condition),
    pool: row.pool,
    privateGarden: row.privateGarden,
    parking: row.parking,
    gated: row.gated,
    seaView: row.seaView,
    beachfront: row.beachfront,
    mountainView: row.mountainView,
    jungleView: row.jungleView,
    flatLand: row.flatLand,
    quiet: row.quiet,
    electricity: row.electricity,
    roadType: u(row.roadType),
    waterType: u(row.waterType),
    internetType: u(row.internetType),
    stage: u(row.stage),
    developer: u(row.developer),
    completion: u(row.completion),
    paymentTerms: u(row.paymentTerms),
    furnishing: u(row.furnishing),
    netYieldPct: u(row.netYieldPct),
    estNetIncomeYear: u(row.estNetIncomeYear),
    leasePrepayment: u(row.leasePrepayment),
    unitsTotal: u(row.unitsTotal),
    unitsAvailable: u(row.unitsAvailable),
    videoUrls: u(row.videoUrls) ?? undefined,
    floorplanUrls: u(row.floorplanUrls) ?? undefined,
    priceStages: u(row.priceStages) ?? undefined,
    timeline: u(row.timeline) ?? undefined,
    team: u(row.team) ?? undefined,
    ownerName: u(row.ownerName),
    contacts: contacts.length ? contacts : undefined,
    buildingRules: u(row.buildingRules),
    reasonForSelling: u(row.reasonForSelling),
    timeOnMarketMonths: u(row.timeOnMarketMonths),
    // `date_added` is legacy amoCRM text; for own-DB rows it's redundant with
    // `created_at`. Fall back so the field is never empty (the gap that broke
    // prerender/sitemap and the "New" badge), in the same Unix-seconds format.
    dateAdded: u(row.dateAdded)?.trim() || epochSecs(row.createdAt),
    ddStatus: u(row.ddStatus),
    ddDate: u(row.ddDate),
    ddLawyer: u(row.ddLawyer),
    ddChecklist: u(row.ddChecklist),
    needsReview: row.needsReview ?? undefined,
    outreachStatus: u(row.outreachStatus),
    outreachNote: u(row.outreachNote),
    outreachDate: u(row.outreachDate),
    outreachAttempts: u(row.outreachAttempts),
    driveFolder: u(row.driveFolder),
    locationUrl: u(row.locationUrl),
    lat: u(row.lat),
    lng: u(row.lng),
    coordsApprox: row.coordsApprox || undefined,
    plotPolygon: u(row.plotPolygon) ?? undefined,
    siteUrl: u(row.siteUrl),
    coverImage: cover,
    gallery: gallery.length ? gallery : undefined,
    docs: docs.length ? docs : undefined,
    descriptionRaw: u(row.descriptionRaw),
    descriptionManualEn: u(row.descriptionManualEn),
    descriptionManualRu: u(row.descriptionManualRu),
  };
}

/** Premium-first then recent — identical to web/src/lib/data/objects.ts. */
export function sortByRecentAndPremium(a: RealEstateObject, b: RealEstateObject) {
  const score = (o: RealEstateObject) =>
    (o.coverImage ? 8 : 0) +
    (o.beachfront ? 4 : 0) +
    (o.seaView ? 2 : 0) +
    (o.mountainView ? 1 : 0);
  const sd = score(b) - score(a);
  if (sd !== 0) return sd;
  return (b.dateAdded ?? "").localeCompare(a.dateAdded ?? "");
}
