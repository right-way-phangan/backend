/**
 * Тесты слоя домена: сборка карточки из строк БД и порядок каталога.
 *   npm test
 *
 * toDomain — единственный мост между таблицами и тем, что видит сайт: он
 * выбирает обложку, собирает галерею и приводит null к undefined. Ошибка здесь
 * не падает, а показывает объект не тем фото или роняет его вниз выдачи.
 * sortByRecentAndPremium задаёт порядок каталога и обязан совпадать с
 * одноимённой функцией в web/src/lib/data/objects.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDomain,
  sortByRecentAndPremium,
  type ObjectRow,
  type PhotoRow,
  type RealEstateObject,
} from "./domain";

function row(over: Partial<ObjectRow> = {}): ObjectRow {
  return {
    id: 1,
    rwNumber: "RW-L0001",
    type: "Land",
    status: "Active",
    district: "Sri Thanu",
    ...over,
  } as ObjectRow;
}

const photo = (url: string, sort: number, isCover = false): PhotoRow => ({ url, sort, isCover });

test("обложкой становится помеченное фото, а не первое по порядку", () => {
  const o = toDomain(
    row(),
    [photo("b.jpg", 0), photo("a.jpg", 1, true), photo("c.jpg", 2)],
    [],
  );
  assert.equal(o.coverImage, "a.jpg");
});

test("без явной обложки берётся первое по сортировке", () => {
  const o = toDomain(row(), [photo("c.jpg", 2), photo("a.jpg", 0), photo("b.jpg", 1)], []);
  assert.equal(o.coverImage, "a.jpg");
});

test("галерея идёт в порядке sort, а не в порядке выдачи БД", () => {
  const o = toDomain(row(), [photo("c.jpg", 30), photo("a.jpg", 10), photo("b.jpg", 20)], []);
  assert.deepEqual(o.gallery, ["a.jpg", "b.jpg", "c.jpg"]);
});

test("объект без фото не получает обложку-пустышку", () => {
  const o = toDomain(row(), [], []);
  assert.equal(o.coverImage, undefined);
  assert.deepEqual(o.gallery ?? [], []);
});

test("null из БД превращается в undefined, а не в null в JSON", () => {
  const o = toDomain(row({ district: null as unknown as string }), [], []);
  assert.equal(o.district, undefined);
  assert.ok(!Object.values(o).includes(null as never), "в выдачу просочился null");
});

test("документы переносятся как есть", () => {
  const docs = [{ name: "Чанот", url: "https://example.com/chanote.pdf" }];
  const o = toDomain(row(), [], docs);
  assert.deepEqual(o.docs, docs);
});

// ---- порядок каталога ----

function obj(over: Partial<RealEstateObject> = {}): RealEstateObject {
  return { rwNumber: "RW-L0001", type: "Land", status: "Active", ...over } as RealEstateObject;
}

test("объект с фото идёт выше безфотного", () => {
  const withPhoto = obj({ rwNumber: "RW-1", coverImage: "a.jpg" });
  const without = obj({ rwNumber: "RW-2", beachfront: true, seaView: true, mountainView: true });
  assert.ok(sortByRecentAndPremium(withPhoto, without) < 0, "фото должно перевешивать все виды");
});

test("первая линия важнее вида на море, вид на море — важнее гор", () => {
  const beach = obj({ rwNumber: "RW-1", beachfront: true });
  const sea = obj({ rwNumber: "RW-2", seaView: true });
  const mountain = obj({ rwNumber: "RW-3", mountainView: true });
  assert.ok(sortByRecentAndPremium(beach, sea) < 0);
  assert.ok(sortByRecentAndPremium(sea, mountain) < 0);
});

test("при равных достоинствах выше идёт свежий", () => {
  const older = obj({ rwNumber: "RW-1", dateAdded: "1700000000" });
  const newer = obj({ rwNumber: "RW-2", dateAdded: "1800000000" });
  assert.ok(sortByRecentAndPremium(newer, older) < 0);
});

test("сортировка устойчива: одинаковые объекты не меняются местами", () => {
  const a = obj({ rwNumber: "RW-1", dateAdded: "1700000000" });
  const b = obj({ rwNumber: "RW-2", dateAdded: "1700000000" });
  assert.equal(sortByRecentAndPremium(a, b), 0);
});

test("объект без даты не всплывает выше датированных", () => {
  const dated = obj({ rwNumber: "RW-1", dateAdded: "1700000000" });
  const undated = obj({ rwNumber: "RW-2" });
  assert.ok(sortByRecentAndPremium(dated, undated) < 0);
});

test("полная сортировка списка даёт ожидаемый порядок", () => {
  const list = [
    obj({ rwNumber: "плохой", dateAdded: "1800000000" }),
    obj({ rwNumber: "с-фото", coverImage: "a.jpg", dateAdded: "1700000000" }),
    obj({ rwNumber: "фото+пляж", coverImage: "b.jpg", beachfront: true, dateAdded: "1600000000" }),
  ];
  const sorted = [...list].sort(sortByRecentAndPremium).map((o) => o.rwNumber);
  assert.deepEqual(sorted, ["фото+пляж", "с-фото", "плохой"]);
});
