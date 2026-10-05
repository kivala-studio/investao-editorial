import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

// Only loopback requests are mocked. No database, real account or publication.
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "editor@example.test",
};
const title =
  "Perspectiva económica e mercados de Angola com conteúdo longo para revisão editorial";
const long = "texto-sem-espaços-".repeat(30);
const row = {
  id: "22222222-2222-4222-8222-222222222222",
  title,
  slug: long,
  summary: long,
  body_markdown:
    `## Mercados\n\n${long}\n\n> Perspectiva\n\n- Primeiro\n- Segundo\n\n[Relatório](https://example.test/${long})\n\n`.repeat(
      6,
    ),
  status: "draft",
  revision: 1,
  author_id: user.id,
  updated_at: "2026-10-01T12:00:00Z",
  published_at: null,
  news_article_sources: [
    {
      source_id: "source",
      source_url: `https://example.test/${long}`,
      source_title: long,
      is_primary: true,
    },
  ],
  news_article_categories: [],
  news_article_securities: [],
};
async function fixture(page: Page, mode = "normal") {
  const payload = Buffer.from(
    JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url");
  await page.addInitScript(
    ({ user, token }) =>
      localStorage.setItem(
        "sb-127-auth-token",
        JSON.stringify({
          access_token: token,
          refresh_token: "synthetic",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ),
    { user, token: `e30.${payload}.synthetic` },
  );
  await page.route("http://127.0.0.1:54329/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    let status = 200;
    if (url.pathname === "/auth/v1/user") body = user;
    if (url.pathname.endsWith("editorial_members")) body = { role: "editor" };
    if (url.pathname.endsWith("news_sources"))
      body = [{ id: "source", name: long }];
    if (url.pathname.endsWith("news_categories"))
      body = [{ id: "category", name: "Mercados" }];
    if (url.pathname.endsWith("securities"))
      body = [{ id: "security", symbol: "SBA", name: long, issuers: null }];
    if (url.pathname.endsWith("market_recaps"))
      body = [
        {
          id: "recap",
          trading_date: "2026-10-01",
          current_version: 1,
          published_version: null,
          article_id: null,
          push_deadline: "2026-10-01T18:00:00Z",
          generation_reason: null,
        },
      ];
    if (url.pathname.endsWith("market_recap_versions"))
      body = [
        {
          id: "edition",
          recap_id: "recap",
          version: 1,
          quality_status: "blocked",
          quality_reason: long,
          content_revision: 1,
          source_sha256: long,
          source_raw_object_path: long,
          expected_symbols: [],
          facts: {
            trading_date: "2026-10-01",
            currency: "AOA",
            source_url: "https://example.test",
            source_completed_at: "2026-10-01T12:00:00Z",
            source_row_count: 1,
            source_imported_row_count: 1,
            source_quarantined_row_count: 0,
            selected_count: 1,
            turnover: 123456789012345,
            share_count: 10000,
            trade_count: 1000,
            rows: [
              {
                security_id: "security",
                symbol: long,
                close_price: 1234567890,
                previous_close: 1,
                previous_date: "2026-09-30",
                change_percent: 1,
                turnover: 1234567890,
                share_count: 10000,
                trade_count: 1000,
              },
            ],
          },
        },
      ];
    if (url.pathname.endsWith("news_articles")) {
      body =
        mode === "empty"
          ? []
          : [{ ...row, status: mode === "published" ? "published" : "draft" }];
      if (mode === "error") {
        status = 500;
        body = { message: long };
      }
    }
    if (url.pathname.includes("/rpc/")) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      status = 409;
      body = { message: "Synthetic conflict: reload before saving." };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: {
        "content-range": `0-0/${mode === "empty" ? 0 : 1}`,
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "content-range",
      },
      body: JSON.stringify(body),
    });
  });
  // Block unexpected external calls: fixtures must never reach production.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Articles/ })).toBeVisible();
}
async function fits(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
}
async function capture(page: Page, name: string, browser: string) {
  if (browser !== "webkit") return;
  const directory = `tests/evidence/${process.env.UI_BASELINE ? "before" : "after"}`;
  mkdirSync(directory, { recursive: true });
  await page.screenshot({
    path: `${directory}/${name}.png`,
    style: "nextjs-portal { visibility: hidden; }",
  });
}
for (const width of [320, 375, 390, 430, 844, 1440]) {
  test.describe(`${width}px`, () => {
    test.use({ isMobile: width < 1000, hasTouch: width < 1000 });
    test(`article review ${width}px`, async ({ page, browserName }) => {
      await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
      await fixture(page);
      await expect(
        page.getByRole("button", { name: title, exact: true }),
      ).toBeVisible();
      if (width === 1440) {
        const statusHeader = page.getByRole("columnheader", {
          name: "Status",
          exact: true,
        });
        expect((await statusHeader.boundingBox())!.width).toBeGreaterThan(75);
      }
      if (width === 390 || width === 1440)
        await capture(page, `list-${width}`, browserName);
      if (!process.env.UI_BASELINE) await fits(page);
      await page.getByRole("button", { name: title, exact: true }).click();
      await expect(page.getByLabel("Markdown body")).toBeVisible();
      if (width === 320 || width === 1440)
        await capture(page, `editor-${width}`, browserName);
      if (process.env.UI_BASELINE) return;
      await fits(page);
      await expect(
        page.getByRole("button", { name: "Sign out" }),
      ).toBeVisible();
      await page.getByLabel("Title", { exact: true }).fill(title + " revisto");
      await page
        .getByLabel("URL slug", { exact: false })
        .fill("synthetic-review");
      await page.getByLabel("Source URL").fill(`https://example.test/${long}`);
      await page
        .getByRole("checkbox", { name: "Mercados", exact: true })
        .check();
      await expect(page.locator(".article-preview h1")).toHaveText(
        title + " revisto",
      );
      const publish = page.getByRole("button", {
        name: "Publish",
        exact: true,
      });
      await publish.scrollIntoViewIfNeeded();
      if (width === 320) await capture(page, "actions-320", browserName);
      const actionBounds = await publish.boundingBox();
      expect(actionBounds!.height).toBeGreaterThanOrEqual(44);
      expect(actionBounds!.x + actionBounds!.width).toBeLessThanOrEqual(width);
      await publish.click();
      const modal = page.getByRole("alertdialog");
      await expect(modal).toBeVisible();
      await expect(modal.getByRole("button", { name: "Cancel" })).toBeFocused();
      await fits(page);
      if (width === 375) await capture(page, "confirmation-375", browserName);
      expect(
        await modal.evaluate((e) => e.getBoundingClientRect().height),
      ).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
      await page.keyboard.press("Escape");
      await expect(modal).not.toBeVisible();
      await publish.click();
      let writes = 0;
      page.on("request", (req) => {
        if (req.url().includes("/rpc/")) writes++;
      });
      await modal.getByRole("button", { name: "Confirm publication" }).click();
      await expect(page.locator(".savebar .primary")).toBeDisabled();
      await expect(page.locator(".error[role=alert]")).toContainText(
        "Synthetic conflict",
      );
      await expect(page.locator(".error[role=alert]")).toBeFocused();
      expect(writes).toBe(1);
      await fits(page);
      await page
        .getByRole("button", { name: "Market recaps", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Criar recap por período" }),
      ).toBeVisible();
      const marketTable = page.getByRole("region", { name: /Dados do recap/ });
      await expect(marketTable).toBeVisible();
      await marketTable.focus();
      await expect(marketTable).toBeFocused();
      await marketTable.hover();
      if (browserName === "webkit" && width < 1000) {
        // Playwright mobile WebKit exposes no wheel/swipe API. Check scroll containment directly.
        await marketTable.evaluate((e) => e.scrollBy(450, 0));
      } else {
        await page.mouse.wheel(450, 0);
      }
      await expect
        .poll(() => marketTable.evaluate((e) => e.scrollLeft))
        .toBeGreaterThan(0);
      await fits(page);
      if (width === 390) await capture(page, "recaps-390", browserName);
      await fits(page);
      await page
        .getByRole("button", { name: "Criar recap por período" })
        .click();
      await expect(page.getByLabel("Data de início")).toBeVisible();
      await fits(page);
    });
  });
}
for (const mode of ["empty", "error"]) {
  test(`list ${mode} and short modal`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await fixture(page, mode);
    await expect(
      mode === "empty"
        ? page.getByText("No articles yet")
        : page.locator(".error[role=alert]"),
    ).toBeVisible();
    await fits(page);
    await page
      .getByRole("button", { name: "Upload article", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.locator(".error[role=alert]")).toContainText("slug");
    await page.getByLabel("URL slug", { exact: false }).fill("synthetic");
    await page.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 240 });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("alertdialog")).not.toBeVisible();
    await fits(page);
  });
}

test("source catalogue wraps long names on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await fixture(page);
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sources", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rename", exact: true }),
  ).toBeVisible();
  await fits(page);
  await page.getByLabel("New source name").fill("Synthetic source");
  await fits(page);
});

test("live article actions fit and still require confirmation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await fixture(page, "published");
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByLabel("URL slug", { exact: false }).fill("synthetic-live");
  const publish = page.getByRole("button", {
    name: "Publish changes",
    exact: true,
  });
  await publish.scrollIntoViewIfNeeded();
  const bounds = await publish.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await fits(page);
  await publish.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unpublish this article?" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});
