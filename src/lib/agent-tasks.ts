/**
 * AI-команда: личный список задач + история советов консилиума.
 *
 * Источник правды переехал из локального JSONL бота (bot/data/*.jsonl) в БД,
 * чтобы /admin/agents мог их показывать (web на Vercel не видит локальные файлы
 * бота). Бот пишет сюда через API и откатывается на JSONL только при недоступном
 * API — так ничего не ломается до деплоя бэкенда. См. project_ai_council.
 *
 * Задачи (agent_tasks): голос/текст/совет → задача; статус open|done.
 * Сессии совета (council_sessions): каждый /совет (или разбор задачи) — для
 * истории (/советы, /admin/agents) и чтобы кнопка «Разбить на задачи» ссылалась
 * на сессию по id.
 */
import { eq, and, desc } from "drizzle-orm";
import { agentTasks, councilSessions } from "../db/schema";
import type { AgentTaskRow, CouncilSessionRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export class AgentTaskInputError extends Error {}

const TASK_STATUSES = ["open", "done"] as const;
type TaskStatus = (typeof TASK_STATUSES)[number];

// ─── Задачи ───

export interface AgentTaskInputDTO {
  text: string;
  source?: string; // voice | text | council
}

/** Создать задачу. */
export async function createTask(db: AnyPgDatabase, input: AgentTaskInputDTO): Promise<AgentTaskRow> {
  const text = String(input.text ?? "").trim();
  if (!text) throw new AgentTaskInputError("text is required");
  const [row] = await db
    .insert(agentTasks)
    .values({ text, source: input.source?.trim() || "text" })
    .returning();
  return row;
}

/** Список задач; по умолчанию открытые (как было в боте). status=undefined → все. */
export async function listTasks(
  db: AnyPgDatabase,
  opts: { status?: TaskStatus; limit?: number } = {},
): Promise<AgentTaskRow[]> {
  return db
    .select()
    .from(agentTasks)
    .where(opts.status ? eq(agentTasks.status, opts.status) : undefined)
    .orderBy(desc(agentTasks.createdAt))
    .limit(opts.limit ?? 200);
}

export async function getTaskById(db: AnyPgDatabase, id: number): Promise<AgentTaskRow | null> {
  const [row] = await db.select().from(agentTasks).where(eq(agentTasks.id, id)).limit(1);
  return row ?? null;
}

/** Счётчик открытых — для бейджа в навигации. */
export async function countOpenTasks(db: AnyPgDatabase): Promise<number> {
  const rows = await db.select({ id: agentTasks.id }).from(agentTasks).where(eq(agentTasks.status, "open"));
  return rows.length;
}

export interface AgentTaskPatchDTO {
  status?: TaskStatus;
  text?: string;
}

/** Обновить задачу (отметить done → ставит doneAt; снять обратно в open → чистит). */
export async function updateTask(
  db: AnyPgDatabase,
  id: number,
  patch: AgentTaskPatchDTO,
): Promise<AgentTaskRow | null> {
  const set: Record<string, unknown> = {};
  if (patch.status && TASK_STATUSES.includes(patch.status)) {
    set.status = patch.status;
    set.doneAt = patch.status === "done" ? new Date() : null;
  }
  if (patch.text !== undefined) {
    const t = String(patch.text).trim();
    if (!t) throw new AgentTaskInputError("text cannot be empty"); // симметрия с createTask
    set.text = t;
  }
  if (Object.keys(set).length === 0) return getTaskById(db, id);
  const [row] = await db.update(agentTasks).set(set).where(eq(agentTasks.id, id)).returning();
  return row ?? null;
}

export async function deleteTask(db: AnyPgDatabase, id: number): Promise<boolean> {
  const res = await db.delete(agentTasks).where(eq(agentTasks.id, id)).returning({ id: agentTasks.id });
  return res.length > 0;
}

// ─── История советов ───

export interface CouncilSessionInputDTO {
  question: string;
  answer: string;
  source?: string; // advice | task
}

/** Готовый совет (бот из Telegram пишет сразу с ответом → status=done). */
export async function createSession(
  db: AnyPgDatabase,
  input: CouncilSessionInputDTO,
): Promise<CouncilSessionRow> {
  const question = String(input.question ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  if (!question || !answer) throw new AgentTaskInputError("question and answer are required");
  const [row] = await db
    .insert(councilSessions)
    .values({
      question,
      answer,
      source: input.source?.trim() || "advice",
      status: "done",
      answeredAt: new Date(),
    })
    .returning();
  return row;
}

/** Веб-дверь «Спросить совет»: кладёт вопрос в очередь (status=pending, answer='').
 *  Локальный бот-поллер заберёт pending, посчитает на Max и заполнит ответ. */
export async function requestCouncil(
  db: AnyPgDatabase,
  input: { question: string; source?: string },
): Promise<CouncilSessionRow> {
  const question = String(input.question ?? "").trim();
  if (!question) throw new AgentTaskInputError("question is required");
  const [row] = await db
    .insert(councilSessions)
    .values({ question, answer: "", source: input.source?.trim() || "web", status: "pending" })
    .returning();
  return row;
}

export interface CouncilSessionPatchDTO {
  status?: string; // pending | processing | done | error
  answer?: string;
  errorText?: string | null;
}

/** Бот: claim (status=processing) и завершение (answer+done / error). */
export async function updateSession(
  db: AnyPgDatabase,
  id: number,
  patch: CouncilSessionPatchDTO,
): Promise<CouncilSessionRow | null> {
  const set: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    set.status = patch.status;
    if (patch.status === "done" || patch.status === "error") set.answeredAt = new Date();
  }
  if (patch.answer !== undefined) set.answer = patch.answer;
  if (patch.errorText !== undefined) set.errorText = patch.errorText;
  if (Object.keys(set).length === 0) return getSessionById(db, id);
  const [row] = await db
    .update(councilSessions)
    .set(set)
    .where(eq(councilSessions.id, id))
    .returning();
  return row ?? null;
}

/** Последние сессии, самые свежие первыми. opts.status — фильтр (poller: pending). */
export async function listSessions(
  db: AnyPgDatabase,
  opts: { status?: string; limit?: number } = {},
): Promise<CouncilSessionRow[]> {
  return db
    .select()
    .from(councilSessions)
    .where(opts.status ? eq(councilSessions.status, opts.status) : undefined)
    .orderBy(desc(councilSessions.createdAt))
    .limit(opts.limit ?? 20);
}

export async function getSessionById(db: AnyPgDatabase, id: number): Promise<CouncilSessionRow | null> {
  const [row] = await db.select().from(councilSessions).where(eq(councilSessions.id, id)).limit(1);
  return row ?? null;
}

export type { AgentTaskRow, CouncilSessionRow };
