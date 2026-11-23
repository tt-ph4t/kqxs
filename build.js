import { PlaywrightCrawler } from "crawlee";
import {
  identity,
  isString,
  last,
  mapValues,
  round,
  startCase,
  sum,
  union,
} from "es-toolkit";
import { size } from "es-toolkit/compat";
import {
  countBy,
  flatMapDeep,
  forEach,
  groupBy,
  join,
  map,
  pipe,
  take,
  uniq,
} from "es-toolkit/fp";
import { some } from "es-toolkit/fp/iterator";
import fg from "fast-glob";
import json2md from "json2md";
import fs from "node:fs";
import path from "node:path";

const locale = "vi-VN";
const url = new URL("https://www.minhngoc.net.vn/ket-qua-xo-so");
const medals = ["🥇", "🥈", "🥉"];

const displayDate = (date = new Date(), weekday = true) => {
  if (isString(date)) date = parseDateString(date);

  const _date = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  if (weekday)
    return `${_date} (${date.toLocaleDateString(locale, {
      weekday: "long",
    })})`;

  return _date;
};

const parseDateString = (value) =>
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

const crawler = new PlaywrightCrawler({
  async requestHandler({ request, page }) {
    const boxKqxsLocator = page.locator(".box_kqxs").first();

    const date = parseDateString(
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
      const _data = fs.readFileSync(dataPath);

      if (_data.length) data = JSON.parse(_data);
    }

    data[displayDate(date, false)] = await boxKqxsLocator
      .locator("table.rightcl")
      .evaluateAll((elements) =>
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
      );

    fs.writeFileSync(
      path.join(dir, "readme.md"),
      json2md([
        {
          h1: `Kết quả xổ số ${regionLabels[region]} (${date.getFullYear()})`,
        },
        pipe(
          data,
          Object.entries,
          groupBy(([a]) => parseDateString(a).getMonth() + 1),
          (a) =>
            mapValues(a, (a) =>
              a.sort(([a], [b]) => parseDateString(b) - parseDateString(a)),
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

    fs.writeFileSync(dataPath, JSON.stringify(data));
  },
});

await crawler.run(
  pipe(
    regionLabels,
    Object.keys,
    map((a) => `${url}/${a}.html`),
  ),
);

{
  const frequencyUnit = "lượt";

  const aaaaaaaaa = (a, b, unit = frequencyUnit) => {
    const label = `${a} ${unit}`;

    if (a) return `${label} (${round((a / b) * 100, 1)}%)`;

    return label;
  };

  let data = {};

  data = pipe(
    "**/data.json",
    fg.sync,
    forEach((a) => {
      pipe(
        regionLabels,
        Object.keys,
        some((region) => {
          const ok = a.includes(region);

          if (ok) {
            data[region] = pipe(
              a,
              fs.readFileSync,
              JSON.parse,
              Object.values,
              flatMapDeep((a) =>
                a.map(({ ["cac-giai"]: cacGiai }) =>
                  cacGiai.map(
                    ({ ["cac-so-trung-thuong"]: cacSoTrungThuong }) =>
                      cacSoTrungThuong,
                  ),
                ),
              ),
            );
          }

          return ok;
        }),
      );
    }),
    () => mapValues(data, (a) => pipe(a, countBy(identity))),
  );

  const regionTotalFrequencies = mapValues(data, (a) =>
    pipe(a, Object.values, sum),
  );

  const totalFrequency = pipe(regionTotalFrequencies, Object.values, sum);

  const rowCount = pipe(
    data,
    Object.values,
    flatMapDeep(Object.keys),
    uniq(),
    size,
  );

  const maxRows = Math.min(1000, rowCount);

  fs.writeFileSync(
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
        h1: "Tần suất",
      },
      {
        table: {
          headers: [
            `${maxRows}/${rowCount} số`,
            ...pipe(
              data,
              Object.keys,
              map((a) => regionLabels[a]),
              map(startCase),
            ),
            `Tổng (${totalFrequency} ${frequencyUnit})`,
          ],
          rows: pipe(
            data,
            Object.values,
            map(Object.keys),
            (a) => union(...a),
            map((a) => [
              a,
              ...pipe(
                data,
                Object.keys,
                map((b) =>
                  aaaaaaaaa(data[b][a] ?? 0, regionTotalFrequencies[b]),
                ),
              ),
              aaaaaaaaa(
                pipe(
                  data,
                  Object.keys,
                  map((b) => data[b][a] ?? 0),
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
