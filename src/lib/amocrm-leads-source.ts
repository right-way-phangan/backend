/**
 * Read-side adapter for the lead migration: pulls leads + contacts + notes from
 * amoCRM and maps them to our CRM shape. Mirrors amocrm-source.ts (objects).
 *
 * Pipeline mapping: amoCRM has many pipelines; our CRM has two (land,
 * villa_house). We map by env override (AMOCRM_PIPELINE_LAND / _VILLA_HOUSE) if
 * set, else by pipeline-name heuristic. The original amoCRM stage is preserved
 * as an `amo-stage:<name>` tag (our stages differ), and every lead lands in
 * "incoming" for re-triage — so no information is lost.
 */
import "dotenv/config";

const DOMAIN = req("AMOCRM_DOMAIN");
const TOKEN = req("AMOCRM_TOKEN");
const ENV_LAND = numEnv("AMOCRM_PIPELINE_LAND");
const ENV_VILLA = numEnv("AMOCRM_PIPELINE_VILLA_HOUSE");

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see backend/.env.example)`);
  return v;
}
function numEnv(name: string): number | undefined {
  const v = process.env[name];
  return v ? Number(v) : undefined;
}

async function amoGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://${DOMAIN}/api/v4${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`amoCRM GET ${path} → ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

// --- wire types (minimal) ---
type Cf = { field_code?: string; values?: Array<{ value: string | number | boolean | null }> };
interface AmoContact {
  id: number;
  name?: string;
  first_name?: string;
  custom_fields_values?: Cf[];
}
interface AmoLead {
  id: number;
  name: string;
  status_id: number;
  pipeline_id: number;
  created_at: number;
  _embedded?: {
    tags?: Array<{ name: string }>;
    contacts?: Array<{ id: number; is_main?: boolean }>;
  };
}

export interface ContactInfo {
  amoContactId: number;
  name?: string;
  email?: string;
  phone?: string;
}

export interface MappedLead {
  amoLeadId: number;
  name: string;
  pipelineKey: "land" | "villa_house";
  stageName?: string;
  createdAt: Date;
  rwNumber?: string;
  source?: string;
  kind?: string;
  tags: string[];
  contact?: ContactInfo;
}

async function paginate<T>(base: string, pick: (d: Record<string, unknown>) => T[]): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const sep = base.includes("?") ? "&" : "?";
    const data = await amoGet<Record<string, unknown>>(`${base}${sep}page=${page}&limit=250`);
    if (!data) break;
    const batch = pick(data);
    out.push(...batch);
    const links = data._links as { next?: unknown } | undefined;
    if (!links?.next || batch.length === 0) break;
    page += 1;
  }
  return out;
}

/** pipeline_id → { name, statuses: id→name }. */
export async function fetchPipelines(): Promise<Map<number, { name: string; statuses: Map<number, string> }>> {
  const data = await amoGet<{
    _embedded?: {
      pipelines?: Array<{ id: number; name: string; _embedded?: { statuses?: Array<{ id: number; name: string }> } }>;
    };
  }>("/leads/pipelines");
  const map = new Map<number, { name: string; statuses: Map<number, string> }>();
  for (const p of data?._embedded?.pipelines ?? []) {
    const statuses = new Map<number, string>();
    for (const s of p._embedded?.statuses ?? []) statuses.set(s.id, s.name);
    map.set(p.id, { name: p.name, statuses });
  }
  return map;
}

export async function fetchAllContacts(): Promise<Map<number, ContactInfo>> {
  const list = await paginate<AmoContact>(
    "/contacts",
    (d) => ((d._embedded as { contacts?: AmoContact[] })?.contacts ?? []),
  );
  const map = new Map<number, ContactInfo>();
  for (const c of list) {
    const cf = (code: string) =>
      c.custom_fields_values?.find((f) => f.field_code === code)?.values?.[0]?.value;
    map.set(c.id, {
      amoContactId: c.id,
      name: c.name || c.first_name || undefined,
      email: cf("EMAIL") != null ? String(cf("EMAIL")) : undefined,
      phone: cf("PHONE") != null ? String(cf("PHONE")) : undefined,
    });
  }
  return map;
}

function pipelineKey(pipelineId: number, name: string): "land" | "villa_house" {
  if (ENV_VILLA && pipelineId === ENV_VILLA) return "villa_house";
  if (ENV_LAND && pipelineId === ENV_LAND) return "land";
  return /(villa|house|apart|condo|project|вилл|дом|апарт|конд|проект)/i.test(name)
    ? "villa_house"
    : "land";
}

export async function fetchAllLeads(): Promise<AmoLead[]> {
  return paginate<AmoLead>(
    "/leads?with=contacts",
    (d) => ((d._embedded as { leads?: AmoLead[] })?.leads ?? []),
  );
}

/** Common-note texts of a lead (the human history). */
export async function fetchLeadNotes(leadId: number): Promise<string[]> {
  const data = await amoGet<{
    _embedded?: { notes?: Array<{ note_type: string; params?: { text?: string } }> };
  }>(`/leads/${leadId}/notes?filter[note_type]=common&limit=250`);
  return (data?._embedded?.notes ?? [])
    .map((n) => n.params?.text)
    .filter((t): t is string => Boolean(t && t.trim()));
}

export function mapLead(
  lead: AmoLead,
  pipelines: Map<number, { name: string; statuses: Map<number, string> }>,
  contacts: Map<number, ContactInfo>,
): MappedLead {
  const pinfo = pipelines.get(lead.pipeline_id);
  const tagNames = (lead._embedded?.tags ?? []).map((t) => t.name);
  const rwTag = tagNames.find((t) => /^object:RW-/i.test(t));
  const stageName = pinfo?.statuses.get(lead.status_id);

  const cref = lead._embedded?.contacts ?? [];
  const main = cref.find((c) => c.is_main) ?? cref[0];
  const contact = main ? contacts.get(main.id) : undefined;

  const kind = ["calculator", "market-report", "shortlist", "saved-search"].find((k) =>
    tagNames.includes(k),
  );

  return {
    amoLeadId: lead.id,
    name: lead.name,
    pipelineKey: pipelineKey(lead.pipeline_id, pinfo?.name ?? ""),
    stageName,
    createdAt: new Date((lead.created_at ?? 0) * 1000),
    rwNumber: rwTag ? rwTag.replace(/^object:/i, "") : undefined,
    source: tagNames.includes("website-contact")
      ? "contact"
      : tagNames.includes("website-inquiry") || rwTag
        ? "object"
        : undefined,
    kind: kind ?? "inquiry",
    tags: [...tagNames, ...(stageName ? [`amo-stage:${stageName}`] : [])],
    contact,
  };
}
