import { readFileSync, writeFileSync } from "atomically";
import { PlaywrightCrawler } from "crawlee";
import {
  flow,
  identity,
  isString,
  last,
  mapValues,
  noop,
  round,
  sortKeys,
  startCase,
  sum,
  union,
} from "es-toolkit";
import { size } from "es-toolkit/compat";
import {
  countBy,
  filter,
  flatMapDeep,
  forEach,
  groupBy,
  join,
  map,
  pipe,
  take,
  uniq,
} from "es-toolkit/fp";
import { reduce } from "es-toolkit/fp/iterator";
import fg from "fast-glob";
import json2md from "json2md";
import fs from "node:fs";
import path from "node:path";
import * as valibot from "valibot";

const locale = "vi-VN";
const url = new URL("https://www.minhngoc.net.vn/ket-qua-xo-so");
const medals = ["🥇", "🥈", "🥉"];
const stringify = flow(sortKeys, JSON.stringify);

const displayDate = (date = new Date(), weekday = true) => {
  if (isString(date)) date = parseDate(date);

  const _date = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  if (weekday)
    return `${_date} (${date.toLocaleDateString(locale, {
      weekday: "long",
    })})`;

  return _date;
};

const parseDate = (value) =>
  pipe(
    value,
    (a) => a.split("/"),
    map(Number),
    ([date, month, year]) => new Date(year, month - 1, date),
  );

const regionLabels = {
  "mien-nam": "miền Nam",
  "mien-trung": "miền Trung",
};

const prizeLabels = {
  8: "Giải tám",
  7: "Giải bảy",
  6: "Giải sáu",
  5: "Giải năm",
  4: "Giải tư",
  3: "Giải ba",
  2: "Giải nhì",
  1: "Giải nhất",
  db: "Giải Đặc Biệt",
};

const forEachRegion = (fn = noop) => {
  pipe(
    "**/data.json",
    fg.sync,
    filter((a) =>
      Object.keys(regionLabels).some((region) => a.startsWith(`${region}/`)),
    ),
    forEach((a) => {
      const parsedPath = path.posix.parse(a);

      fn({
        data: pipe(a, readFileSync, JSON.parse),
        meta: pipe(
          path.join(parsedPath.dir, "meta.json"),
          readFileSync,
          JSON.parse,
        ),
        dir: parsedPath.dir,
        region: pipe(parsedPath.dir, path.dirname),
      });
    }),
  );
};

{
  const schema = valibot.array(
    valibot.strictObject({
      tinh: valibot.pipe(valibot.string(), valibot.minLength(1)),
      "ma-tinh": valibot.pipe(valibot.string(), valibot.minLength(1)),
      "cac-giai": valibot.array(
        valibot.strictObject({
          giai: valibot.picklist(Object.keys(prizeLabels)),
          "cac-so-trung-thuong": valibot.array(
            valibot.pipe(valibot.string(), valibot.minLength(1)),
          ),
        }),
      ),
    }),
  );

  const playwrightCrawler = new PlaywrightCrawler({
    async requestHandler({ request, page }) {
      const boxKqxsLocator = page.locator(".box_kqxs").first();

      const date = parseDate(
        await boxKqxsLocator.locator(".top .title a").nth(1).textContent(),
      );

      await boxKqxsLocator.locator(".giaiSo").first().waitFor();

      const region = new URL(request.url).pathname
        .split("/")
        .at(-1)
        .replace(".html", "");

      const dir = path.join(region, String(date.getFullYear()));

      fs.mkdirSync(dir, {
        recursive: true,
      });

      const dataPath = path.join(dir, "data.json");

      let data = {};

      if (fs.existsSync(dataPath)) {
        const _data = readFileSync(dataPath);

        if (_data.length) data = JSON.parse(_data);
      }

      data[displayDate(date, false)] = valibot.parse(
        schema,
        await boxKqxsLocator.locator("table.rightcl").evaluateAll((elements) =>
          elements.map((element) => ({
            tinh: element.querySelector("td.tinh").textContent.trim(),
            "ma-tinh": element.querySelector("td.matinh").textContent.trim(),
            "cac-giai": Array.from(
              element.querySelectorAll("td[class^=giai]"),
              (element) => ({
                giai: element.className.split("giai")[1],
                "cac-so-trung-thuong": Array.from(
                  element.querySelectorAll(".giaiSo"),
                  (element) => element.getAttribute("data"),
                ),
              }),
            ),
          })),
        ),
      );

      writeFileSync(dataPath, stringify(data));

      writeFileSync(
        path.join(dir, "meta.json"),
        stringify({
          title: `Kết quả xổ số ${regionLabels[region]} (${date.getFullYear()})`,
        }),
      );
    },
  });

  await playwrightCrawler.run(
    pipe(
      regionLabels,
      Object.keys,
      map((a) => `${url}/${a}.html`),
    ),
  );
}

forEachRegion(({ data, meta, dir }) => {
  writeFileSync(
    path.join(dir, "readme.md"),
    json2md([
      {
        h1: meta.title,
      },
      pipe(
        data,
        Object.entries,
        groupBy(([a]) => parseDate(a).getMonth() + 1),
        (a) =>
          mapValues(a, (a) =>
            a.sort(([a], [b]) => parseDate(b) - parseDate(a)),
          ),
        Object.entries,
        (a) => a.sort(([a], [b]) => Number(b) - Number(a)),
        map(([a, b]) => [
          {
            h2: `Tháng ${a}`,
          },
          b.map(([a, b]) => [
            {
              table: {
                headers: [
                  displayDate(a),
                  ...b.map(
                    ({ tinh, ["ma-tinh"]: maTinh }) => `${tinh} (${maTinh})`,
                  ),
                ],
                rows: b[0]["cac-giai"].map(({ giai }) => [
                  prizeLabels[giai],
                  ...b.map(({ ["cac-giai"]: cacGiai }) => {
                    const { ["cac-so-trung-thuong"]: cacSoTrungThuong } =
                      cacGiai.find(({ giai: _giai }) => _giai === giai);

                    return pipe(
                      cacSoTrungThuong,
                      map((a) => `\`${a}\``),
                      join(" "),
                    );
                  }),
                ]),
              },
            },
          ]),
        ]),
      ),
    ]),
  );
});

{
  const frequencyUnit = "lượt";

  const formatFrequency = (a, b, unit = frequencyUnit) => {
    const label = `${a} ${unit}`;

    if (a) return `${label} (${round((a / b) * 100, 1)}%)`;

    return label;
  };

  const numbersByRegion = {};

  forEachRegion(({ region, data: _data }) => {
    numbersByRegion[region] = pipe(
      _data,
      Object.values,
      flatMapDeep((a) =>
        a.map(({ ["cac-giai"]: cacGiai }) =>
          cacGiai.map(
            ({ ["cac-so-trung-thuong"]: cacSoTrungThuong }) => cacSoTrungThuong,
          ),
        ),
      ),
    );
  });

  const frequencyByRegion = mapValues(numbersByRegion, (a) =>
    pipe(a, countBy(identity)),
  );

  const data3_1 = mapValues(numbersByRegion, (a) =>
    pipe(
      a,
      groupBy((a) => (a % 2 ? "odd" : "even")),
      (a) => mapValues(a, size),
    ),
  );

  const data3_2 = pipe(
    data3_1,
    Object.values,
    reduce(
      (a, b) => ({
        even: a.even + b.even,
        odd: a.odd + b.odd,
      }),
      {
        even: 0,
        odd: 0,
      },
    ),
  );

  const data3_3 = sum(Object.values(data3_2));

  const totalFrequencyByRegion = mapValues(frequencyByRegion, (a) =>
    pipe(a, Object.values, sum),
  );

  const totalFrequency = pipe(totalFrequencyByRegion, Object.values, sum);

  const rowCount = pipe(
    frequencyByRegion,
    Object.values,
    flatMapDeep(Object.keys),
    uniq(),
    size,
  );

  const maxRows = Math.min(1000, rowCount);

  writeFileSync(
    "readme.md",
    json2md([
      {
        blockquote: displayDate(),
      },
      {
        img: {
          source:
            "https://github.com/tt-ph4t/kqxs/actions/workflows/build.yml/badge.svg",
        },
      },
      {
        h2: "Tương quan chẵn lẻ",
      },
      {
        table: {
          headers: ["", "Chẵn", "Lẻ", "Tổng"],
          rows: [
            ...pipe(
              data3_1,
              Object.entries,
              map(([a, b]) => {
                const total = pipe(b, Object.values, sum);

                return [
                  startCase(regionLabels[a]),
                  formatFrequency(b.even, total),
                  formatFrequency(b.odd, total),
                  `${total} ${frequencyUnit}`,
                ];
              }),
            ),
            [
              "Tổng",
              formatFrequency(data3_2.even, data3_3),
              formatFrequency(data3_2.odd, data3_3),
              `${data3_3} ${frequencyUnit}`,
            ],
          ],
        },
      },
      {
        h2: "Tần suất",
      },
      {
        table: {
          headers: [
            `${maxRows}/${rowCount} số`,
            ...pipe(
              frequencyByRegion,
              Object.keys,
              map((a) => regionLabels[a]),
              map(startCase),
            ),
            `Tổng (${totalFrequency} ${frequencyUnit})`,
          ],
          rows: pipe(
            frequencyByRegion,
            Object.values,
            map(Object.keys),
            (a) => union(...a),
            map((a) => [
              a,
              ...pipe(
                frequencyByRegion,
                Object.keys,
                map((b) =>
                  formatFrequency(
                    frequencyByRegion[b][a] ?? 0,
                    totalFrequencyByRegion[b],
                  ),
                ),
              ),
              formatFrequency(
                pipe(
                  frequencyByRegion,
                  Object.keys,
                  map((b) => frequencyByRegion[b][a] ?? 0),
                  sum,
                ),
                totalFrequency,
              ),
            ]),
            (a) =>
              a.sort(
                (a, b) =>
                  last(b).localeCompare(last(a), locale, {
                    numeric: true,
                    sensitivity: "base",
                  }) ||
                  a[0].localeCompare(b[0], locale, {
                    numeric: true,
                    sensitivity: "base",
                  }),
              ),
            map(([a, ...rest], index) => [
              `${medals[index] ?? ""} ${a}`,
              ...rest,
            ]),
            take(maxRows),
          ),
        },
      },
    ]),
  );
}
