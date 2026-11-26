import * as valibot from "valibot";

const dailyLotteryResultsSchema = valibot.array(
  valibot.strictObject({
    province: valibot.pipe(valibot.string(), valibot.minLength(1)),
    provinceCode: valibot.pipe(valibot.string(), valibot.minLength(1)),
    prizes: valibot.strictObject(
      valibot.picklist(prizeOrder),
      valibot.array(valibot.pipe(valibot.string(), valibot.minLength(1))),
    ),
  }),
);
