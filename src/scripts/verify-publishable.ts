/**
 * Прогон гейта качества (toPublishable) по ЖИВОМУ каталогу + параноидальный
 * скан утечек. Read-only: тянет /objects/all с боевого API, ничего не пишет.
 *
 *   API=https://rightway-api.vercel.app npx tsx src/scripts/verify-publishable.ts
 *
 * Падает (exit 1), если в любом публикуемом объекте найдено конфиденциальное.
 */
import { toPublishable, type PublishLang } from "../lib/publishable";
import type { RealEstateObject } from "../lib/domain";

const API = process.env.API || "https://rightway-api.vercel.app";
const TOKEN = process.env.API_TOKEN || process.env.OBJECTS_API_TOKEN || "";
const authHeaders: Record<string, string> = TOKEN ? { authorization: `Bearer ${TOKEN}` } : {};

// Параноидальные сигнатуры утечки в СЕРИАЛИЗОВАННОМ публикуемом объекте.
const LEAK_SIGNATURES: Array<{ re: RegExp; label: string }> = [
  { re: /drive\.google\.com/i, label: "ссылка на Google Drive" },
  { re: /\.(pdf|docx?|xlsx?)\b/i, label: "файл-документ" },
  { re: /[a-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo|icloud)\./i, label: "личный email" },
  { re: /\b(\+?66|0)\s?\d{1,2}[\s-]?\d{3}[\s-]?\d{3,4}\b/, label: "телефон" },
  { re: /\bline\s*id\b|t\.me\/\+|wa\.me\//i, label: "мессенджер-контакт" },
  { re: /\b(commission|комисси[яюейи])\b[^"]{0,24}?(\d|%)/i, label: "комиссия" },
  { re: /\b(chanote|чанот)[^"\n]{0,20}?\b(no\.?|number|№|#|เลขที่)\s*#?\s*\d{3,}/i, label: "номер чанота" },
];

async function main() {
  // /objects/all под админ-авторизацией; без куки падаем на публичный /objects
  // (Active+фото, но с сырыми descriptionRaw — на них и проверяем чистку).
  let path = "/objects/all";
  let res = await fetch(`${API}${path}`, { headers: authHeaders });
  if (res.status === 401 || res.status === 403) {
    path = "/objects";
    res = await fetch(`${API}${path}`, { headers: authHeaders });
  }
  if (!res.ok) throw new Error(`${API}${path} → ${res.status}`);
  const objects = (await res.json()) as RealEstateObject[];
  console.log(`Каталог: ${objects.length} объектов из ${API}${path}\n`);

  let violations = 0;
  const summary = { ok: 0, blocked: 0 };
  const reasonTally = new Map<string, number>();
  const warnTally = new Map<string, number>();

  for (const lang of ["en", "ru"] as PublishLang[]) {
    let ok = 0;
    let blocked = 0;
    for (const o of objects) {
      const r = toPublishable(o, { channel: "telegram", lang });
      if (!r.ok) {
        blocked++;
        for (const reason of r.reasons) {
          const key = reason.replace(/«[^»]*»/g, "«…»").replace(/\d+/g, "N");
          reasonTally.set(key, (reasonTally.get(key) ?? 0) + 1);
        }
        continue;
      }
      ok++;
      for (const w of r.warnings) {
        const key = w.replace(/\([^)]*\)/g, "(…)").slice(0, 60);
        warnTally.set(key, (warnTally.get(key) ?? 0) + 1);
      }
      // Параноидальный скан вывода
      const blob = JSON.stringify(r.object);
      for (const { re, label } of LEAK_SIGNATURES) {
        if (re.test(blob)) {
          violations++;
          console.error(`❌ УТЕЧКА [${label}] в ${r.rwNumber} (${lang}): ${blob.slice(0, 160)}`);
        }
      }
      if (lang === "en" && r.object.description && /[А-Яа-яЁё]/.test(r.object.description)) {
        violations++;
        console.error(`❌ Кириллица в EN-описании ${r.rwNumber}: ${r.object.description.slice(0, 80)}`);
      }
    }
    console.log(`[${lang}] публикуемо: ${ok}  ·  заблокировано: ${blocked}`);
    if (lang === "en") {
      summary.ok = ok;
      summary.blocked = blocked;
    }
  }

  console.log("\nПричины блокировок (en):");
  for (const [reason, n] of [...reasonTally].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(4)} × ${reason}`);
  }
  console.log("\nЧастые предупреждения (en):");
  for (const [w, n] of [...warnTally].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${String(n).padStart(4)} × ${w}`);
  }

  console.log(`\n${violations === 0 ? "✅ Утечек не найдено" : `❌ Утечек: ${violations}`}`);
  if (violations > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
