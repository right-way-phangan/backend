/**
 * RED-TEAM: парсеры свободного текста + внешний fetch на пути записи.
 * Тесты стерегут исправленное поведение. Сеть — только локальный http-сервер на 127.0.0.1.
 *   npx tsx --test src/lib/adv-*.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { parseArea, resolveLatLngFromUrl } from "./write";

// АТАКА 13 [HIGH]: площадь участка вводится свободным текстом («800 m²», «3 rai 2 ngan»)
// | ОЖИДАЕТСЯ: areaRai и areaSqm описывают одну и ту же площадь; на землю опубликованная
//   площадь — основа цены (модель «цена за рай», memory project_land_pricing_model)
// | БЫЛО: rai получали через Math.round + Math.max(1, …), поэтому 800 m² (= 0.5 rai)
//   публиковались как «1 rai» (вдвое больше реальной), а «3 rai 2 ngan» (3.5 rai) —
//   как «4 rai»; areaSqm при этом оставался верным, карточка противоречила сама себе,
//   и цена за рай считалась от завышенного знаменателя
// | ИСПРАВЛЕНО 2026-08-31: area_rai — double precision, округляем до 0.01
// | код: src/lib/write.ts:220-222
test("АТАКА 13: 800 m² даёт ровно 0.5 rai", () => {
  assert.deepEqual(parseArea("800 m²"), { sqm: 800, rai: 0.5 });
});

test("АТАКА 13a: «3 rai 2 ngan» → 3.5 rai, и поля согласованы между собой", () => {
  const a = parseArea("3 rai 2 ngan");
  assert.deepEqual(a, { sqm: 5600, rai: 3.5 });
  assert.equal(a.rai, a.sqm! / 1600);
});

// АТАКА 13b [LOW]: знак минуса в тексте площади игнорировался регуляркой
// | ИСПРАВЛЕНО 2026-08-31: отрицательное значение не считается площадью
test("АТАКА 13b: «-5 rai» не превращается в 5 rai", () => {
  const neg = parseArea("-5 rai");
  assert.equal(neg.rai, undefined);
  assert.equal(neg.sqm, undefined);
  assert.deepEqual(parseArea("5 rai"), { sqm: 8000, rai: 5 });
});

// АТАКА 14 [MEDIUM]: SSRF — POST /objects (и PATCH) с произвольным locationUrl
// | ОЖИДАЕТСЯ: резолвер координат ходит только на google-хосты (maps.app.goo.gl,
//   goo.gl/maps, g.co, google.com/maps), с таймаутом
// | БЫЛО: единственной проверкой было /^https?:\/\//, сервер ходил на любой хост,
//   включая 127.0.0.1 и приватные адреса, следовал за 5 редиректами куда угодно и
//   не имел таймаута — аутентифицированный клиент (общий API_TOKEN) превращал API
//   в прокси для сканирования внутренней сети
// | ИСПРАВЛЕНО 2026-08-31: белый список картографических хостов + таймаут 5 с,
//   проверка применяется и к каждому шагу редиректа
// | код: src/lib/write.ts:281-296,309-318
test("АТАКА 14: resolveLatLngFromUrl не ходит на посторонний (локальный) хост", async () => {
  const hits: string[] = [];
  const srv: Server = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const port = (srv.address() as AddressInfo).port;

  const out = await resolveLatLngFromUrl(`http://127.0.0.1:${port}/latest/meta-data/iam/`);
  await new Promise<void>((r) => srv.close(() => r()));

  assert.deepEqual(hits, [], "до постороннего хоста запрос не дошёл");
  assert.deepEqual(out, {});
});

test("АТАКА 14a: редирект на посторонний хост не выполняется", async () => {
  const hitsB: string[] = [];
  const b: Server = createServer((req, res) => {
    hitsB.push(req.url ?? "");
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((r) => b.listen(0, "127.0.0.1", r));
  const portB = (b.address() as AddressInfo).port;

  const a: Server = createServer((_req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${portB}/internal-admin` });
    res.end();
  });
  await new Promise<void>((r) => a.listen(0, "127.0.0.1", r));
  const portA = (a.address() as AddressInfo).port;

  await resolveLatLngFromUrl(`http://127.0.0.1:${portA}/start`); // уже первый хост вне белого списка
  await new Promise<void>((r) => a.close(() => r()));
  await new Promise<void>((r) => b.close(() => r()));

  assert.deepEqual(hitsB, [], "по редиректу на чужой хост fetch не пошёл");
});

// АТАКА 15 [MEDIUM]: координаты берутся из ЛЮБОГО числа в URL, похожего на пару
// | ОЖИДАЕТСЯ: разбирается только параметр координат Google Maps (@lat,lng / ?q=lat,lng)
// | ФАКТ: регулярка `[@?q=]?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)` не привязана к
//   параметру — совпадает с первой попавшейся парой чисел в строке. Пин объекта
//   молча ставится не туда, если ссылка содержит другие числовые пары (мы проверили:
//   пара из части `data=!3d…` подхватывается как координаты)
// | код: src/lib/write.ts:260-268
test("АТАКА 15: пин берётся из первой пары чисел в URL, а не из параметра координат", async () => {
  const out = await resolveLatLngFromUrl(
    "https://www.google.com/maps/dir/x/y/data=!4m2!9.9999,100.5000!3m1!9.7300,99.9800",
  );
  assert.deepEqual(out, { lat: 9.9999, lng: 100.5 }, "взята первая пара, не настоящий пин");
});
