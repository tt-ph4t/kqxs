import { readFileSync, writeFileSync } from "atomically";
import { flow, sortKeys } from "es-toolkit";
import { map, pipe } from "es-toolkit/fp";
import fs from "node:fs";
import path from "node:path";
import * as valibot from "valibot";
import {
  dataSchema,
  displayDate,
  lotteryResultsSchema,
  parseDate,
  regionLabels,
} from "./misc.js";

const url = new URL("https://www.minhngoc.net.vn/ket-qua-xo-so");
const stringify = flow(sortKeys, JSON.stringify);

export default Object.assign(
  async ({ request, page }) => {
    for (const boxKqxsLocator of await page.locator(".box_kqxs").all()) {
      const date = parseDate(
        await boxKqxsLocator.locator(".top .title a").nth(1).textContent(),
      );

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
          data = pipe(_data, JSON.parse, (a) => valibot.parse(dataSchema, a));
      }

      data[displayDate(date, false)] = valibot.parse(
        lotteryResultsSchema,
        await boxKqxsLocator.locator("table.rightcl").evaluateAll((elements) =>
          elements.map((element) => ({
            province: element.querySelector("td.tinh").textContent.trim(),
            provinceCode: element.querySelector("td.matinh").textContent.trim(),
            prizes: Array.from(
              element.querySelectorAll("td[class^=giai]"),
            ).reduce((a, b) => {
              a[b.className.split("giai")[1]] = Array.from(
                b.querySelectorAll(".giaiSo"),
                (element) => element.getAttribute("data"),
              );

              return a;
            }, {}),
          })),
        ),
      );

      writeFileSync(dataPath, stringify(data));

      writeFileSync(
        path.join(dir, "meta.json"),
        stringify({
          title: `Kết quả xổ số ${regionLabels[request.userData.region]} (${date.getFullYear()})`,
        }),
      );
    }
  },
  {
    requests: pipe(
      regionLabels,
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
