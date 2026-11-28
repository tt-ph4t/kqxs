import { readFileSync, writeFileSync } from "atomically";
import { PlaywrightCrawler } from "crawlee";
import {
  identity,
  last,
  mapValues,
  noop,
  round,
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
import path from "node:path";
import * as valibot from "valibot";
import build from "./_build.js";
import {
  DATA_SCHEMA,
  displayDate,
  LOCALE,
  parseDate,
  prettyNum,
  PRIZE_ORDER,
  REGION_LABELS,
} from "./misc.js";

const medals = ["🥇", "🥈", "🥉"];

const prizeLabels = valibot.parse(
  valibot.record(valibot.picklist(PRIZE_ORDER), valibot.string()),
  {
    8: "Giải tám",
    7: "Giải bảy",
    6: "Giải sáu",
    5: "Giải năm",
    4: "Giải tư",
    3: "Giải ba",
    2: "Giải nhì",
    1: "Giải nhất",
    db: "Giải Đặc Biệt",
  },
);

const forEachRegion = (fn = noop) => {
  pipe(
    "**/data.json",
    fg.sync,
    filter((a) =>
      Object.keys(REGION_LABELS).some((region) => a.startsWith(`${region}/`)),
    ),
    forEach((a) => {
      const parsedPath = path.posix.parse(a);

      fn({
        data: pipe(a, readFileSync, JSON.parse, (a) =>
          valibot.parse(DATA_SCHEMA, a),
        ),
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
  const playwrightCrawler = new PlaywrightCrawler({
    requestHandler: build,
  });

  await playwrightCrawler.run(build.requests);
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
                    ({ province, provinceCode }) =>
                      `${province} (${provinceCode})`,
                  ),
                ],
                rows: PRIZE_ORDER.map((prize) => [
                  prizeLabels[prize],
                  ...b.map(({ prizes }) =>
                    pipe(
                      prizes[prize],
                      map((a) => `\`${a}\``),
                      join(" "),
                    ),
                  ),
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
  const formatFrequency = (a, b, unit = "lượt") => {
    const label = `${prettyNum(a)} ${unit}`;

    if (a && b) return `${label} (${round((a / b) * 100, 1)}%)`;

    return label;
  };

  let dates = [];

  forEachRegion(({ data }) => {
    dates = pipe(data, Object.keys, (a) => union(a, dates));
  });

  const numbersByRegion = {};

  forEachRegion(({ region, data }) => {
    numbersByRegion[region] = pipe(
      data,
      Object.values,
      flatMapDeep((a) => a.map(({ prizes }) => Object.values(prizes))),
      (a) => [...(numbersByRegion[region] ?? []), ...a],
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
        img: {
          source:
            "https://github.com/tt-ph4t/kqxs/actions/workflows/daily-build.yml/badge.svg",
        },
      },
      {
        blockquote: `Cập nhật lần cuối: ${displayDate()}`,
      },
      {
        h1: "Tần suất",
      },
      {
        blockquote: `Thống kê trong ${prettyNum(dates.length)} ngày`,
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
                  startCase(REGION_LABELS[a]),
                  formatFrequency(b.even, total),
                  formatFrequency(b.odd, total),
                  formatFrequency(total, data3_3),
                ];
              }),
            ),
            [
              "Tổng",
              formatFrequency(data3_2.even, data3_3),
              formatFrequency(data3_2.odd, data3_3),
              formatFrequency(data3_3),
            ],
          ],
        },
      },
      {
        table: {
          headers: [
            `${prettyNum(maxRows)}/${prettyNum(rowCount)} số`,
            ...pipe(
              frequencyByRegion,
              Object.keys,
              map((a) => REGION_LABELS[a]),
              map(startCase),
            ),
            "Tổng",
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
                  last(b).localeCompare(last(a), LOCALE, {
                    numeric: true,
                    sensitivity: "base",
                  }) ||
                  a[0].localeCompare(b[0], LOCALE, {
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
