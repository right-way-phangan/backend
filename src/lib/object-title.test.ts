/**
 * Тесты генератора тайтлов. Pure — без БД/сети/LLM.
 *   npm test
 *
 * Почему это важно покрыть: buildTemplateTitle стоит в canonical write path —
 * каждый объект, заведённый через /admin/new или POST /objects, получает от
 * него публичное имя, и оно же служит render-time фолбэком для legacy-карточек
 * без тайтла. Ошибка тут не падает, а тихо уезжает на сайт.
 *
 * Проверяем не конкретные формулировки (они намеренно варьируются по RW-номеру
 * и правятся при доводке копирайта), а правила дома: детерминированность,
 * длину, sentence case, привязку к району, одну фичу вместо перечисления,
 * отсутствие цены и хайпа.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTemplateTitle, type TitleAttrs } from "./object-title";

function land(over: Partial<TitleAttrs> = {}): TitleAttrs {
  return { rwNumber: "RW-L0001", type: "Land", district: "Sri Thanu", rai: 2, ...over };
}
function villa(over: Partial<TitleAttrs> = {}): TitleAttrs {
  return { rwNumber: "RW-V0001", type: "Villa", district: "Haad Yao", bedrooms: 3, ...over };
}

const HYPE = ["luxury", "paradise", "dream", "best", "amazing", "stunning", "perfect"];

test("одинаковый объект — одинаковый тайтл (тайтл не пляшет между сохранениями)", () => {
  const a = land();
  assert.equal(buildTemplateTitle(a), buildTemplateTitle({ ...a }));
});

test("разные RW-номера расходятся в формулировках, а не клонируют один тайтл", () => {
  const titles = new Set(
    ["RW-L0001", "RW-L0002", "RW-L0003", "RW-L0004", "RW-L0005", "RW-L0006"].map((rw) =>
      buildTemplateTitle(land({ rwNumber: rw })),
    ),
  );
  // Вариативность вероятностная: строгого «все разные» движок не обещает,
  // но шесть одинаковых означали бы, что сид не работает вовсе.
  assert.ok(titles.size >= 3, `слишком мало вариантов: ${[...titles].join(" | ")}`);
});

test("держится в пределах длины, заявленной домашним стилем", () => {
  const cases: TitleAttrs[] = [
    land(),
    land({ rai: 12, beachfront: true, documentType: "Chanote" }),
    villa(),
    villa({ bedrooms: 6, pool: true, seaView: true, brandNew: true }),
    { rwNumber: "RW-P0001", type: "Project", district: "Ban Tai", unitsTotal: 24, offplan: true },
  ];
  for (const c of cases) {
    const t = buildTemplateTitle(c);
    assert.ok(t.length <= 72, `${t.length} символов: ${t}`);
    assert.ok(t.length > 0);
  }
});

test("sentence case: заглавная только в начале, без CAPS-слов", () => {
  const t = buildTemplateTitle(villa({ seaView: true }));
  assert.equal(t[0], t[0].toUpperCase());
  for (const w of t.split(/\s+/).slice(1)) {
    if (/^(Koh|Phangan|Chanote|Nor|Sor|Gor)$/.test(w.replace(/[,.]/g, ""))) continue;
    assert.ok(!/^[A-Z]{2,}$/.test(w), `CAPS-слово «${w}» в: ${t}`);
  }
});

test("район попадает в тайтл", () => {
  assert.match(buildTemplateTitle(land({ district: "Sri Thanu" })), /Sri Thanu/);
  assert.match(buildTemplateTitle(villa({ district: "Haad Yao" })), /Haad Yao/);
});

test("без района не выдумывает место, а говорит про остров", () => {
  const t = buildTemplateTitle(land({ district: undefined }));
  assert.match(t, /Koh Phangan/);
});

test("называет одну фичу, а не перечисляет все сразу", () => {
  // Объект, у которого включено всё разом: тайтл обязан выбрать главное.
  const t = buildTemplateTitle(
    villa({ beachfront: true, seaView: true, mountainView: true, jungleView: true, flat: true }),
  );
  const mentioned = ["beachfront", "sea", "mountain", "jungle", "level", "flat"].filter((f) =>
    t.toLowerCase().includes(f),
  );
  assert.ok(mentioned.length <= 2, `перечислено слишком много (${mentioned.join(", ")}): ${t}`);
});

test("первая линия важнее вида на море", () => {
  const t = buildTemplateTitle(villa({ beachfront: true, seaView: true }));
  assert.match(t.toLowerCase(), /beach/);
});

test("не выносит цену в заголовок", () => {
  const t = buildTemplateTitle(land({ rai: 3 }));
  assert.ok(!/THB|฿|\$|baht|million|\bm\b/i.test(t), t);
});

test("обходится без хайпа", () => {
  const cases = [land(), villa({ pool: true, seaView: true }), villa({ brandNew: true })];
  for (const c of cases) {
    const low = buildTemplateTitle(c).toLowerCase();
    for (const w of HYPE) assert.ok(!low.includes(w), `хайп «${w}» в: ${low}`);
  }
});

test("тип объекта узнаётся по существительному", () => {
  assert.match(buildTemplateTitle(land()).toLowerCase(), /plot|land/);
  assert.match(
    buildTemplateTitle(villa({ pool: true })).toLowerCase(),
    /villa|residence/,
  );
});

test("площадь участка появляется только когда она осмысленна", () => {
  assert.match(buildTemplateTitle(land({ rai: 5 })), /5-rai/);
  // Меньше рая — дробь в заголовке выглядела бы мусором.
  assert.ok(!/-rai/.test(buildTemplateTitle(land({ rai: 0 }))));
  assert.ok(!/-rai/.test(buildTemplateTitle(land({ rai: undefined }))));
});

test("минимальный объект не роняет генератор", () => {
  for (const t of [
    buildTemplateTitle({ rwNumber: "", type: "Land" }),
    buildTemplateTitle({ rwNumber: "RW-X0001", type: "Unknown" }),
    buildTemplateTitle({ rwNumber: "RW-V0009", type: "Villa" }),
  ]) {
    assert.ok(t.length > 0);
    assert.ok(!t.includes("undefined"), t);
    assert.ok(!/\s{2,}/.test(t), `двойные пробелы: «${t}»`);
  }
});

test("не оставляет висящей пунктуации по краям", () => {
  for (const c of [land(), villa({ seaView: true }), land({ rai: 8, beachfront: true })]) {
    const t = buildTemplateTitle(c);
    assert.ok(!/^[\s,.\-–—]/.test(t), `мусор в начале: «${t}»`);
    assert.ok(!/[\s,\-–—]$/.test(t), `мусор в конце: «${t}»`);
  }
});
