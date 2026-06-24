/**
 * Photo vetting — keep internal documents out of public PHOTOS.
 *
 * The catalog's public photos were repeatedly contaminated with confidential
 * material sourced from cold-call brokers: Thai chanote/NS3K title deeds, Google
 * Sheets price/commission sheets, LandsMaps/DOL screenshots (deed numbers + GPS +
 * treasury valuation), sale/lease contracts, messenger screenshots. A 2026-06-25
 * audit purged 186 such images. This module is the prevention layer so they don't
 * come back — every photo entering `object_photos` is classified, and anything
 * that reads as a document is rejected (kept out of PHOTOS).
 *
 * Vision classification needs a model. Gated on ANTHROPIC_API_KEY (same switch as
 * object-title's LLM polish): when the key is absent, vetting is a no-op that
 * reports `checked:false` so callers fail OPEN (photo is allowed) rather than
 * blocking intake — set the key in the rightway-api Vercel env to turn protection
 * on. Raw fetch + image-URL source mirrors object-title.ts (no SDK in the bundle).
 */

const API_URL = "https://api.anthropic.com/v1/messages";
// Per claude-api skill: default to the strongest model; PHOTO_VET_MODEL lets a
// cost-conscious operator drop to e.g. claude-haiku-4-5 for high upload volume.
const MODEL = process.env.PHOTO_VET_MODEL ?? "claude-opus-4-8";
const VET_CONCURRENCY = Number(process.env.PHOTO_VET_CONCURRENCY ?? 4);

export type DocKind =
  | "chanote"
  | "survey"
  | "pricelist"
  | "spreadsheet"
  | "contract"
  | "chat"
  | "govUI"
  | "id"
  | "otherDoc";

export interface VetVerdict {
  url: string;
  checked: boolean; // false when vetting is disabled (no API key) or the call failed
  isDocument: boolean;
  kind?: DocKind;
  confidence?: "high" | "med" | "low";
  reason?: string;
}

export function isVettingEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM_PROMPT = `Ты классифицируешь одно изображение из галереи объекта недвижимости (остров Панган, Таиланд). Реши, это РЕАЛЬНОЕ фото недвижимости или ВНУТРЕННИЙ ДОКУМЕНТ, который нельзя публиковать.

ДОКУМЕНТ (isDocument=true) — любое из:
- тайский чанот / титул / NS3K (герб Гаруда, номера деедов, печати);
- межевой / кадастровый план, землеустроительная съёмка;
- скриншот гос-ГИС LandsMaps / DOL / cityplan (карта с номерами участков, координатами, гос-оценкой);
- скриншот таблицы / прайса Google Sheets или Excel (цены, «цена за рай», комиссия);
- скан договора / юридического документа;
- скриншот переписки (LINE / WhatsApp / Telegram), скрин уведомления;
- удостоверение личности / паспорт;
- любой скриншот экрана или скан текста/цифр, а не физического объекта.

РЕАЛЬНОЕ ФОТО (isDocument=false) — земля/джунгли/участок/дорога/вид, аэро/дрон (даже с нарисованным от руки контуром участка), вилла/дом снаружи и внутри, бассейн, море, архитектурные рендеры и маркетинговые планировки/мастер-планы проектов.

Сомневаешься — confidence:"low". Скриншот спутника с НАЛОЖЕННЫМИ промерами сторон/границами/координатами — это документ.

Ответь СТРОГО одним JSON-объектом без пояснений:
{"isDocument": true|false, "kind": "chanote|survey|pricelist|spreadsheet|contract|chat|govUI|id|otherDoc|none", "confidence": "high|med|low", "reason": "кратко"}`;

function parseVerdict(url: string, text: string): VetVerdict {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return { url, checked: true, isDocument: false, reason: "no JSON in response" };
  try {
    const o = JSON.parse(m[0]) as {
      isDocument?: boolean;
      kind?: string;
      confidence?: string;
      reason?: string;
    };
    const kind = o.kind && o.kind !== "none" ? (o.kind as DocKind) : undefined;
    const confidence =
      o.confidence === "high" || o.confidence === "med" || o.confidence === "low"
        ? o.confidence
        : undefined;
    return {
      url,
      checked: true,
      isDocument: !!o.isDocument,
      kind,
      confidence,
      reason: o.reason,
    };
  } catch {
    return { url, checked: true, isDocument: false, reason: "unparseable JSON" };
  }
}

/** Classify one image URL. Fails OPEN (isDocument:false, checked:false) on any error. */
export async function vetImageUrl(url: string): Promise<VetVerdict> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { url, checked: false, isDocument: false };
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url } },
              { type: "text", text: "Классифицируй это изображение." },
            ],
          },
        ],
      }),
    });
    if (!resp.ok) {
      console.error(`[photo-vetting] anthropic ${resp.status} for ${url}`);
      return { url, checked: false, isDocument: false };
    }
    const data = (await resp.json()) as { content?: Array<{ text?: string }> };
    const text = (data.content ?? []).map((c) => c.text ?? "").join(" ");
    return parseVerdict(url, text);
  } catch (err) {
    console.error("[photo-vetting] call failed:", err);
    return { url, checked: false, isDocument: false };
  }
}

/** Classify many URLs with a small concurrency cap. Order matches input. */
export async function vetImageUrls(urls: string[]): Promise<VetVerdict[]> {
  if (!urls.length) return [];
  if (!isVettingEnabled()) return urls.map((url) => ({ url, checked: false, isDocument: false }));
  const out: VetVerdict[] = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      out[i] = await vetImageUrl(urls[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(VET_CONCURRENCY, urls.length) }, worker));
  return out;
}

/**
 * A document is a publish-blocker only when we're confident. Low-confidence
 * verdicts are allowed through (and surfaced to the audit tool for human review)
 * so the guard never silently eats a legitimate aerial it misread.
 */
export function isBlockingDocument(v: VetVerdict): boolean {
  return v.checked && v.isDocument && v.confidence !== "low";
}

/** Split URLs into ones safe to publish and ones rejected as documents. */
export async function partitionByVetting(
  urls: string[],
): Promise<{ accepted: string[]; rejected: VetVerdict[]; verdicts: VetVerdict[] }> {
  const verdicts = await vetImageUrls(urls);
  const accepted: string[] = [];
  const rejected: VetVerdict[] = [];
  for (const v of verdicts) {
    if (isBlockingDocument(v)) rejected.push(v);
    else accepted.push(v.url);
  }
  return { accepted, rejected, verdicts };
}
