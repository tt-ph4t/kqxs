import { isString } from "es-toolkit";
import { map, pipe } from "es-toolkit/fp";
import _prettyNum from "pretty-num";
import * as valibot from "valibot";

export const locale = "vi-VN";

export const prizeOrder = [8, 7, 6, 5, 4, 3, 2, 1, "db"].map(String);

export const lotteryResultsSchema = valibot.array(
  valibot.strictObject({
    province: valibot.pipe(valibot.string(), valibot.minLength(1)),
    provinceCode: valibot.pipe(valibot.string(), valibot.minLength(1)),
    prizes: valibot.record(
      valibot.picklist(prizeOrder),
      valibot.array(valibot.pipe(valibot.string(), valibot.minLength(1))),
    ),
  }),
);

export const dataSchema = valibot.record(
  valibot.string(),
  lotteryResultsSchema,
);

export const regionLabels = {
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
    return `${_date} (${date.toLocaleDateString(locale, {
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
