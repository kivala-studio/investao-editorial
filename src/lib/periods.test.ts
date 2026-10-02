import { expect, test } from "vitest";
import { emptyArticle } from "./types";
import { periodErrors } from "./periods";
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
