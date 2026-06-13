/**
 * API contract: own DB rows → the `RealEstateObject` shape the website already
 * consumes (web/src/types/object.ts). Keeping the field names identical means
 * the site switches source (amoCRM → own API) without touching its components.
 */
import type { ObjectRow } from "../db/schema";

type Pair = { label: string; value: string };
type TimelineRow = { date: string; event: string };
type TeamRow = { role: string; name: string };

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
  leaseTermYears?: number;
  leaseEscPercent?: number;
  leaseEscPeriodYears?: number;
  leaseEscNotes?: string;
  leaseAdditionalTerms?: string;
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
  buildingRules?: string;
  reasonForSelling?: string;
  timeOnMarketMonths?: number;
  dateAdded?: string;
  ddStatus?: string;
  ddDate?: string;
  ddLawyer?: string;
  ddChecklist?: Record<string, boolean>;
  outreachStatus?: string;
  outreachNote?: string;
  outreachDate?: string;
  outreachAttempts?: number;
  driveFolder?: string;
  locationUrl?: string;
  lat?: number;
  lng?: number;
  plotPolygon?: Array<[number, number]>;
  siteUrl?: string;
  coverImage?: string;
  gallery?: string[];
  docs?: Array<{ name: string; url: string }>;
  descriptionRaw?: string;
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

export function toDomain(
  row: ObjectRow,
  photos: PhotoRow[],
  docs: DocRow[],
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
    leaseTermYears: u(row.leaseTermYears),
    leaseEscPercent: u(row.leaseEscPercent),
    leaseEscPeriodYears: u(row.leaseEscPeriodYears),
    leaseEscNotes: u(row.leaseEscNotes),
    leaseAdditionalTerms: u(row.leaseAdditionalTerms),
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
    buildingRules: u(row.buildingRules),
    reasonForSelling: u(row.reasonForSelling),
    timeOnMarketMonths: u(row.timeOnMarketMonths),
    dateAdded: u(row.dateAdded),
    ddStatus: u(row.ddStatus),
    ddDate: u(row.ddDate),
    ddLawyer: u(row.ddLawyer),
    ddChecklist: u(row.ddChecklist),
    outreachStatus: u(row.outreachStatus),
    outreachNote: u(row.outreachNote),
    outreachDate: u(row.outreachDate),
    outreachAttempts: u(row.outreachAttempts),
    driveFolder: u(row.driveFolder),
    locationUrl: u(row.locationUrl),
    lat: u(row.lat),
    lng: u(row.lng),
    plotPolygon: u(row.plotPolygon) ?? undefined,
    siteUrl: u(row.siteUrl),
    coverImage: cover,
    gallery: gallery.length ? gallery : undefined,
    docs: docs.length ? docs : undefined,
    descriptionRaw: u(row.descriptionRaw),
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
