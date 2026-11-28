import { isString } from "es-toolkit";
import { map, pipe } from "es-toolkit/fp";
import _prettyNum from "pretty-num";
import * as valibot from "valibot";

export const LOCALE = "vi-VN";

export const PRIZE_ORDER = [8, 7, 6, 5, 4, 3, 2, 1, "db"].map(String);

export const LOTTERY_RESULTS_SCHEMA = valibot.array(
  valibot.strictObject({
    province: valibot.pipe(valibot.string(), valibot.minLength(1)),
    provinceCode: valibot.pipe(valibot.string(), valibot.minLength(1)),
    prizes: valibot.record(
      valibot.picklist(PRIZE_ORDER),
      valibot.array(valibot.pipe(valibot.string(), valibot.minLength(1))),
    ),
  }),
);

export const DATA_SCHEMA = valibot.record(
  valibot.string(),
  LOTTERY_RESULTS_SCHEMA,
);

export const REGION_LABELS = {
  "mien-nam": "miền Nam",
  "mien-trung": "miền Trung",
};

export const prettyNum = (value, ...options) =>
  _prettyNum(value, {
    thousandsSeparator: " ",
    ...options,
  });

export const displayDate = (date = new Date(), weekday = true) => {
  if (isString(date)) date = parseDate(date);

  const _date = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  if (weekday)
    return `${_date} (${date.toLocaleDateString(LOCALE, {
      weekday: "long",
    })})`;

  return _date;
};

export const parseDate = (value) =>
  pipe(
    value,
    (a) => a.split("/"),
    map(Number),
    ([date, month, year]) => new Date(year, month - 1, date),
  );
