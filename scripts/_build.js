import { readFileSync, writeFileSync } from "atomically";
import { flow, sortKeys } from "es-toolkit";
import { map, pipe } from "es-toolkit/fp";
import fs from "node:fs";
import path from "node:path";
import * as valibot from "valibot";
import {
  DATA_SCHEMA,
  displayDate,
  LOTTERY_RESULTS_SCHEMA,
  parseDate,
  REGION_LABELS,
} from "./misc.js";

const url = new URL("https://www.minhngoc.net.vn/ket-qua-xo-so");
const stringify = flow(sortKeys, JSON.stringify);

export default Object.assign(
  async ({ request, page }) => {
    for (const boxKqxsLocator of await page.locator(".box_kqxs").all()) {
      const title = await boxKqxsLocator.locator(".top .title").textContent();

      console.log(title);

      const date = parseDate(title.split(" - ")[1]);

      await boxKqxsLocator.locator(".giaiSo").first().waitFor();

      const dir = path.join(
        request.userData.region,
        String(date.getFullYear()),
      );

      fs.mkdirSync(dir, {
        recursive: true,
      });

      const dataPath = path.join(dir, "data.json");

      let data = {};

      if (fs.existsSync(dataPath)) {
        const _data = readFileSync(dataPath);

        if (_data.length)
          data = pipe(_data, JSON.parse, (a) => valibot.parse(DATA_SCHEMA, a));
      }

      const _data = valibot.safeParse(
        LOTTERY_RESULTS_SCHEMA,
        await boxKqxsLocator.locator("table.rightcl").evaluateAll((a) =>
          a.map((a) => ({
            province: a.querySelector("td.tinh").textContent.trim(),
            provinceCode: a.querySelector("td.matinh").textContent.trim(),
            prizes: Array.from(a.querySelectorAll("td[class^=giai]")).reduce(
              (a, b) => {
                a[b.className.split("giai")[1]] = Array.from(
                  b.querySelectorAll(".giaiSo"),
                  (a) => a.getAttribute("data"),
                )
                  // https://es-toolkit.dev/fp/reference/compact.html
                  .filter(Boolean);

                return a;
              },
              {},
            ),
          })),
        ),
      );

      if (!_data.success) continue;

      data[displayDate(date, false)] = _data.output;

      writeFileSync(dataPath, stringify(data));

      writeFileSync(
        path.join(dir, "meta.json"),
        stringify({
          title: `Kết quả xổ số ${REGION_LABELS[request.userData.region]} (${date.getFullYear()})`,
        }),
      );
    }
  },
  {
    requests: pipe(
      REGION_LABELS,
      Object.keys,
      map((a) => ({
        url: `${url}/${a}.html`,
        userData: {
          region: a,
        },
      })),
    ),
  },
);
