import { PlaywrightCrawler } from "crawlee";
import { delay } from "es-toolkit";
import build from "./_build.js";

const playwrightCrawler = new PlaywrightCrawler({
  maxRequestRetries: Infinity,
  maxConcurrency: 1,
  preNavigationHooks: [
    async () => {
      await delay(1000);
    },
  ],
  async requestHandler({ request, page, enqueueLinks }) {
    console.log(request);

    await build({
      request,
      page,
    });

    {
      const href = await page
        .locator("ul.pagenav li a")
        .nth(request.userData.isFirstCrawl ? 0 : 4)
        .getAttribute("href");

      if (href)
        await enqueueLinks({
          urls: [href],
          userData: {
            ...request.userData,
            isFirstCrawl: false,
          },
        });
    }
  },
});

await playwrightCrawler.run(
  build.requests.map(({ userData, ...rest }) => ({
    userData: {
      ...userData,
      isFirstCrawl: true,
    },
    ...rest,
  })),
);
