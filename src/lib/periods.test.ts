import { expect, test } from "vitest";
import { emptyArticle } from "./types";
import { periodErrors, periodBasis, luandaDate } from "./periods";
const monthly = {
  ...emptyArticle(),
  recap_period: "monthly" as const,
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  reference_session: "2026-08-31",
};
test("complete historical month and reference session", () => {
  expect(periodErrors(monthly, "published", "2026-10-02")).toEqual([]);
  expect(
    periodErrors({ ...monthly, reference_session: "2026-09-01" }, "draft"),
  ).toHaveLength(1);
  expect(
    periodErrors(
      { ...monthly, period_end: "2026-08-30", reference_session: "2026-08-28" },
      "draft",
    ),
  ).toHaveLength(1);
  expect(
    periodErrors({ ...monthly, period_start: "2026-02-30" }, "draft"),
  ).toHaveLength(1);
});
test("civil week, leap year and incomplete annual publication", () => {
  expect(
    periodErrors(
      {
        ...monthly,
        recap_period: "weekly",
        period_start: "2026-09-21",
        period_end: "2026-09-27",
        reference_session: "2026-09-25",
      },
      "draft",
    ),
  ).toEqual([]);
  expect(
    periodErrors(
      {
        ...monthly,
        period_start: "2024-02-01",
        period_end: "2024-02-29",
        reference_session: "2024-02-28",
      },
      "draft",
    ),
  ).toEqual([]);
  const annual = {
    ...monthly,
    recap_period: "annual" as const,
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    reference_session: "2026-08-31",
  };
  expect(periodErrors(annual, "draft")).toEqual([]);
  expect(periodErrors(annual, "published", "2026-10-02")).toHaveLength(1);
});

test("aggregated August does not assert a trading session", () => {
  for (const reference_session of [null, undefined, ""]) {
    const article = { ...monthly, reference_session };
    expect(periodErrors(article, "draft")).toEqual([]);
    expect(periodErrors(article, "published", "2026-10-02")).toEqual([]);
    expect(periodBasis(article)).toBe(
      "Base agregada mensal; sem sessão específica",
    );
  }
  expect(
    periodErrors({ ...monthly, reference_session: "2026-02-30" }, "draft"),
  ).toHaveLength(1);
});

const weekly = {
  ...monthly,
  recap_period: "weekly" as const,
  period_start: "2026-10-12",
  period_end: "2026-10-18",
  reference_session: "2026-10-16",
};

test.each([
  ["2026-10-16T22:59:59Z", false],
  ["2026-10-16T23:00:00Z", true],
  ["2026-10-17T12:00:00Z", true],
  ["2026-10-18T12:00:00Z", true],
  ["2026-10-18T23:00:00Z", true],
])(
  "weekly publication at %s follows Luanda Saturday (%s)",
  (instant, allowed) => {
    expect(
      periodErrors(weekly, "published", luandaDate(new Date(instant))),
    ).toHaveLength(allowed ? 0 : 1);
  },
);

test("future weeks and sessions stay blocked; civil bounds remain required", () => {
  expect(
    periodErrors(
      {
        ...weekly,
        period_start: "2026-10-19",
        period_end: "2026-10-25",
        reference_session: "2026-10-23",
      },
      "published",
      "2026-10-19",
    ).length,
  ).toBeGreaterThan(0);
  expect(
    periodErrors(
      { ...weekly, reference_session: "2026-10-18" },
      "published",
      "2026-10-17",
    ),
  ).toHaveLength(1);
  expect(
    periodErrors(
      { ...weekly, period_end: "2026-10-16" },
      "published",
      "2026-10-17",
    ),
  ).toHaveLength(1);
});

test("holiday or missing Friday never invents a reference session", () => {
  for (const reference_session of ["2026-10-15", null]) {
    const article = { ...weekly, reference_session };
    expect(periodErrors(article, "published", "2026-10-17")).toEqual([]);
    expect(article.reference_session).toBe(reference_session);
  }
});

test.each([
  ["monthly", "2026-10-01", "2026-10-31"],
  ["annual", "2026-01-01", "2026-12-31"],
] as const)(
  "%s still requires the whole civil period to end",
  (recap_period, period_start, period_end) => {
    const article = {
      ...monthly,
      recap_period,
      period_start,
      period_end,
      reference_session: null,
    };
    expect(periodErrors(article, "published", period_end)).toHaveLength(1);
    const next = new Date(period_end);
    next.setUTCDate(next.getUTCDate() + 1);
    expect(periodErrors(article, "published", luandaDate(next))).toEqual([]);
  },
);
