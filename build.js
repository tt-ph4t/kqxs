import { PlaywrightCrawler } from "crawlee";
import { mapValues } from "es-toolkit";
import { groupBy, join, map, pipe } from "es-toolkit/fp";
import json2md from "json2md";
import fs from "node:fs";
import path from "node:path";

const url = new URL("https://www.minhngoc.net.vn/ket-qua-xo-so");

const parseDateString = (value) =>
  pipe(
    value,
    (a) => a.split("/"),
    map(Number),
    ([date, month, year]) => new Date(year, month - 1, date),
  );

const regionLabels = {
  "mien-nam": "miền nam",
  "mien-trung": "miền trung",
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

    data[`${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`] =
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
      );

    fs.writeFileSync(
      path.join(dir, "readme.md"),
      json2md([
        {
          h1: `kết quả xổ số ${regionLabels[region]} (${date.getFullYear()})`.toUpperCase(),
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
            b.map(([a, b]) => {
              const date = parseDateString(a);

              return [
                {
                  table: {
                    headers: [
                      `${a} (${date.toLocaleDateString("vi-VN", {
                        weekday: "long",
                      })})`,
                      ...b.map(
                        ({ tinh, ["ma-tinh"]: maTinh }) =>
                          `${tinh} (${maTinh})`,
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
              ];
            }),
          ]),
        ),
      ]),
    );

    fs.writeFileSync(dataPath, JSON.stringify(data));
  },
});

await crawler.run(
  Object.keys(regionLabels).map((path) => `${url}/${path}.html`),
);
