/**
 * Действия совета под гейтом: follow-up лиду, DD-вердикт, пост EN+RU, задача, трата, деплой.
 *
 * Бот готовит действие → строка proposed → «Да/Нет» из бота ИЛИ из Великого Древа:
 * оба зовут decide() (POST /council-actions/:id/decide), поэтому исполнение одно.
 * Трату (Google Sheets) и деплой (двойное подтверждение) исполняет только бот: через API
 * для них «Да» без outcome → 400; бот исполняет сам и сообщает исход в outcome.
 */
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { councilActions } from "../db/schema";
import type { CouncilActionRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { addNote } from "./crm";
import { createSocialPost } from "./social-posts";
import { createTask } from "./agent-tasks";

export class CouncilActionError extends Error {
  constructor(message: string, readonly code: 400 | 404 | 409) {
    super(message);
  }
}

const BOT_ONLY = new Set(["expense", "deploy"]);
const STATUSES = ["proposed", "done", "rejected", "failed"];

export interface CouncilActionInputDTO {
  sessionId?: number | null;
  agentId: string;
  type: string;
  title: string;
  payload?: Record<string, unknown>;
}

export async function createAction(db: AnyPgDatabase, input: CouncilActionInputDTO): Promise<CouncilActionRow> {
  const agentId = String(input.agentId ?? "").trim();
  const type = String(input.type ?? "").trim();
  const title = String(input.title ?? "").trim();
  if (!/^rw-[a-z-]+$/.test(agentId) || !type || !title)
    throw new CouncilActionError("agentId (rw-…), type и title обязательны", 400);
  const [row] = await db
    .insert(councilActions)
    .values({
      sessionId: Number.isInteger(input.sessionId) ? input.sessionId : null,
      agentId,
      type,
      title: title.slice(0, 200),
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
    })
    .returning();
  return row;
}

/** Новые сверху. status — фильтр (Древо: proposed). */
export async function listActions(
  db: AnyPgDatabase,
  opts: { status?: string; limit?: number } = {},
): Promise<CouncilActionRow[]> {
  if (opts.status && !STATUSES.includes(opts.status))
    throw new CouncilActionError(`status: ${STATUSES.join("|")}`, 400);
  return db
    .select()
    .from(councilActions)
    .where(opts.status ? eq(councilActions.status, opts.status) : undefined)
    .orderBy(desc(councilActions.createdAt))
    .limit(opts.limit ?? 50);
}

export async function getActionById(db: AnyPgDatabase, id: number): Promise<CouncilActionRow | null> {
  const [row] = await db.select().from(councilActions).where(eq(councilActions.id, id)).limit(1);
  return row ?? null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Исполнение «Да». Возвращает текст результата; бросает — значит failed. */
async function execute(db: AnyPgDatabase, row: CouncilActionRow): Promise<string> {
  const p = (row.payload ?? {}) as Record<string, unknown>;
  switch (row.type) {
    case "followup":
    case "dd": {
      const leadId = Number(p.leadId);
      const text = str(p.text);
      if (!Number.isInteger(leadId) || !text) throw new Error("в payload нет leadId/text");
      const head = row.type === "dd"
        ? "⚖️ DD-вердикт по сделке (Фемида):"
        : "✍️ Черновик follow-up (Кайрос), отправить лиду вручную:";
      const note = await addNote(db, leadId, `${head}\n\n${text}`);
      if (!note) throw new Error("заметка не записалась");
      return row.type === "dd"
        ? `DD-вердикт сохранён в заметку лида #${leadId}`
        : `Черновик сохранён в заметку лида #${leadId}; отправить лиду вручную`;
    }
    case "post": {
      const en = str(p.en);
      const ru = str(p.ru);
      if (!en || !ru) throw new Error("в payload нет en/ru");
      const pairId = str(p.pairId) || "p-" + randomBytes(5).toString("hex");
      const topic = str(p.topic) || null;
      for (const [lang, body] of [["en", en], ["ru", ru]] as const)
        await createSocialPost(db, { pairId, lang, body, topic: topic ?? undefined, channel: "telegram", status: "draft" });
      return `Пара EN+RU в очереди постов (draft, ${pairId})`;
    }
    case "task": {
      const t = await createTask(db, { text: str(p.text) || row.title, source: "council" });
      return `Задача #${t.id} заведена`;
    }
    default:
      throw new Error(`неизвестный тип действия: ${row.type}`);
  }
}

export interface DecideDTO {
  yes: boolean;
  /** Только бот, только для expense/deploy: исход исполнения на стороне бота. */
  outcome?: { ok: boolean; result?: string };
}

/**
 * Решение по действию. Claim — атомарно занимаем строку (decidedAt), так что двойное
 * «Да» из бота и Древа одновременно не исполнит действие дважды: второе получит 409.
 */
export async function decide(db: AnyPgDatabase, id: number, input: DecideDTO): Promise<CouncilActionRow> {
  if (typeof input?.yes !== "boolean") throw new CouncilActionError('нужно {"yes": true|false}', 400);
  const row = await getActionById(db, id);
  if (!row) throw new CouncilActionError("not found", 404);
  if (row.status !== "proposed" || row.decidedAt) throw new CouncilActionError(`уже решено: ${row.status}`, 409);

  const outcome = input.outcome;
  if (input.yes && BOT_ONLY.has(row.type) && !(outcome && typeof outcome.ok === "boolean"))
    throw new CouncilActionError("только из бота", 400);
  if (input.yes && !BOT_ONLY.has(row.type) && !["followup", "dd", "post", "task"].includes(row.type))
    throw new CouncilActionError(`неизвестный тип действия: ${row.type}`, 400);

  const [claimed] = await db
    .update(councilActions)
    .set({ decidedAt: new Date() })
    .where(and(eq(councilActions.id, id), eq(councilActions.status, "proposed"), isNull(councilActions.decidedAt)))
    .returning();
  if (!claimed) throw new CouncilActionError("уже решено", 409);

  let status: string;
  let result: string;
  if (!input.yes) {
    status = "rejected";
    result = "Отклонено";
  } else if (BOT_ONLY.has(row.type)) {
    status = outcome!.ok ? "done" : "failed";
    result = str(outcome!.result) || (outcome!.ok ? "Исполнено ботом" : "Бот не смог исполнить");
  } else {
    try {
      result = await execute(db, claimed);
      status = "done";
    } catch (err) {
      status = "failed";
      result = err instanceof Error ? err.message : String(err);
    }
  }
  const [done] = await db
    .update(councilActions)
    .set({ status, result: result.slice(0, 1000) })
    .where(eq(councilActions.id, id))
    .returning();
  return done;
}

export type { CouncilActionRow };
