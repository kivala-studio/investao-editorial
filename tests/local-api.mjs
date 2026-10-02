// Integration checks exclusively against the CLI's local Supabase instance.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const backendDirectory =
  process.env.INVESTAO_BACKEND_DIR ||
  fileURLToPath(new URL("../../investao-functions/", import.meta.url));
const settings = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    cwd: resolve(backendDirectory),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const url = new URL(settings.API_URL);
assert.equal(url.hostname, "127.0.0.1", "Tests require local Supabase");
const key = settings.ANON_KEY,
  secret = settings.SERVICE_ROLE_KEY;
async function request(path, token = key, method = "GET", body) {
  const response = await fetch(new URL(path, url), {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      apikey: key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}
const tag = randomUUID();
const users = [];
try {
  for (const role of ["admin", "editor", "viewer", "mobile"]) {
    const email = `editorial-${role}-${tag}@example.com`,
      password = `Test-${randomUUID()}!`;
    const created = await request("/auth/v1/admin/users", secret, "POST", {
      email,
      password,
      email_confirm: true,
    });
    assert.equal(created.status, 200);
    users.push({ id: created.data.id, role });
    if (role !== "mobile") {
      const membership = await request(
        "/rest/v1/editorial_members",
        secret,
        "POST",
        { user_id: created.data.id, role },
      );
      assert.equal(membership.status, 201);
    }
    const login = await request(
      "/auth/v1/token?grant_type=password",
      key,
      "POST",
      { email, password },
    );
    assert.equal(login.status, 200);
    users.at(-1).token = login.data.access_token;
  }
  const [admin, editor, viewer, mobile] = users;
  const source = await request("/rest/v1/news_sources", editor.token, "POST", {
    name: `Test ${tag}`,
  });
  assert.equal(source.status, 201);
  const id = randomUUID();
  const document = {
    id,
    slug: `test-${tag}`,
    title: "Integration article",
    summary: "Summary",
    body_markdown: "## Native Markdown\n\n**Body**",
    status: "draft",
    sources: [
      {
        source_id: source.data[0].id,
        source_url: "https://example.com/source",
        is_primary: true,
      },
    ],
    category_ids: [],
    security_ids: [],
  };
  const path = `/rest/v1/news_articles?id=eq.${id}&select=*,news_article_sources(*)`;
  const save = (token, doc, revision = null) =>
    request("/rest/v1/rpc/save_news_article", token, "POST", {
      document: doc,
      expected_revision: revision,
    });
  assert.equal((await save(editor.token, document)).status, 200);
  assert.deepEqual(
    (await request(path)).data,
    [],
    "anonymous REST cannot retrieve draft",
  );
  assert.deepEqual(
    (await request(path, mobile.token)).data,
    [],
    "signed-in mobile REST cannot retrieve draft",
  );
  assert.equal(
    (await request(path, viewer.token)).data.length,
    1,
    "viewer sees draft",
  );
  assert.equal(
    (
      await save(viewer.token, {
        ...document,
        id: randomUUID(),
        slug: `viewer-${tag}`,
      })
    ).status,
    403,
  );
  const current = (await request(path, editor.token)).data[0];
  assert.equal(
    (
      await save(
        editor.token,
        { ...document, status: "published", sources: [] },
        current.revision,
      )
    ).status,
    400,
    "source requirement enforced over REST",
  );
  assert.equal(
    (
      await save(
        editor.token,
        { ...document, status: "published" },
        current.revision,
      )
    ).status,
    200,
  );
  const published = (await request(path)).data[0];
  assert.equal(published.body_markdown, document.body_markdown);
  assert.equal(published.news_article_sources.length, 1);
  assert.equal(
    (await save(editor.token, document, current.revision)).status,
    409,
    "stale revision rejected",
  );
  assert.equal(
    (
      await save(
        editor.token,
        { ...document, status: "archived" },
        published.revision,
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await request(path)).data,
    [],
    "archived article inaccessible",
  );
  const periodSave = (token, doc, revision = null) =>
    request("/rest/v1/rpc/save_period_market_recap", token, "POST", {
      document: doc,
      expected_revision: revision,
    });
  // Stable calendar fixtures are private test data in a loopback-only stack.
  const previousFixtures = await request(
    "/rest/v1/news_articles?recap_period=not.is.null&title=in.(August%20demonstration%20draft,Synthetic%20week)&select=id",
    secret,
  );
  for (const previous of previousFixtures.data) {
    assert.equal(
      (
        await request(
          `/rest/v1/news_audit_log?article_id=eq.${previous.id}`,
          secret,
          "DELETE",
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/rest/v1/news_articles?id=eq.${previous.id}`,
          secret,
          "DELETE",
        )
      ).status,
      200,
    );
  }
  const periodDocument = {
    ...document,
    id: randomUUID(),
    slug: `period-${tag}`,
    title: "August demonstration draft",
    body_markdown: readFileSync(
      new URL("./fixtures/august-2026.md", import.meta.url),
      "utf8",
    ),
    recap_period: "monthly",
    period_start: "2026-08-01",
    period_end: "2026-08-31",
    reference_session: "2026-08-31",
  };
  const periodPath = `/rest/v1/news_articles?id=eq.${periodDocument.id}&select=*,news_article_sources(*)`;
  const readPeriod = async () =>
    (await request(periodPath, editor.token)).data[0];
  assert.equal((await periodSave(viewer.token, periodDocument)).status, 403);
  assert.equal((await periodSave(mobile.token, periodDocument)).status, 403);
  assert.equal((await periodSave(editor.token, periodDocument)).status, 200);
  assert.deepEqual(
    (await request(periodPath)).data,
    [],
    "period draft remains private",
  );
  let period = await readPeriod();
  assert.equal(period.recap_period, "monthly");
  assert.equal(period.news_article_sources.length, 1);
  assert.match(period.body_markdown, /Relatório histórico/);
  assert.match(period.body_markdown, /2026-08-01 a 2026-08-31/);
  assert.equal(
    (
      await periodSave(
        editor.token,
        {
          ...periodDocument,
          body_markdown: period.body_markdown + "\n\nEdited draft",
        },
        period.revision,
      )
    ).status,
    200,
  );
  assert.equal(
    (await periodSave(editor.token, periodDocument, period.revision)).status,
    409,
    "period stale revision rejected",
  );
  period = await readPeriod();
  assert.equal(
    period.body_markdown.match(/> Relatório histórico/g).length,
    1,
    "historical notice is idempotent",
  );
  assert.equal(
    (
      await periodSave(editor.token, {
        ...periodDocument,
        id: randomUUID(),
        slug: `duplicate-${tag}`,
      })
    ).status,
    409,
    "duplicate period rejected",
  );
  assert.equal(
    (
      await periodSave(
        editor.token,
        { ...periodDocument, status: "published", body_markdown: "" },
        period.revision,
      )
    ).status,
    400,
    "historical notice cannot substitute for article content",
  );
  for (const patch of [
    { period_end: "2026-08-30" },
    { reference_session: "2026-09-01" },
    { period_start: null },
  ]) {
    assert.equal(
      (
        await periodSave(
          editor.token,
          { ...periodDocument, ...patch },
          period.revision,
        )
      ).status,
      400,
      "invalid period rejected",
    );
    assert.equal(
      (await readPeriod()).revision,
      period.revision,
      "failed save rolls back article and relationships",
    );
  }
  // August stays a draft. Exercise explicit publication with a separate synthetic week.
  const weekly = {
    ...periodDocument,
    id: randomUUID(),
    slug: `weekly-${tag}`,
    title: "Synthetic week",
    body_markdown: "## Local test report",
    recap_period: "weekly",
    period_start: "2026-09-21",
    period_end: "2026-09-27",
    reference_session: "2026-09-25",
  };
  assert.equal((await periodSave(editor.token, weekly)).status, 200);
  const weeklyPath = `/rest/v1/news_articles?id=eq.${weekly.id}`;
  let week = (await request(weeklyPath, editor.token)).data[0];
  assert.equal(
    (
      await periodSave(
        editor.token,
        { ...weekly, status: "published", sources: [] },
        week.revision,
      )
    ).status,
    400,
    "period publication requires sources",
  );
  assert.deepEqual((await request(weeklyPath)).data, []);
  assert.equal(
    (
      await periodSave(
        editor.token,
        { ...weekly, status: "published" },
        week.revision,
      )
    ).status,
    200,
  );
  week = (await request(weeklyPath)).data[0];
  assert.equal(week.status, "published");
  assert.match(week.body_markdown, /não são cotações actuais/);
  assert.equal(
    (await periodSave(editor.token, weekly, week.revision)).status,
    409,
    "published period cannot be overwritten through period editor",
  );
  const annual = {
    ...weekly,
    id: randomUUID(),
    slug: `annual-${tag}`,
    recap_period: "annual",
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    reference_session: "2026-09-25",
  };
  assert.equal((await periodSave(editor.token, annual)).status, 200);
  const annualPath = `/rest/v1/news_articles?id=eq.${annual.id}`;
  const year = (await request(annualPath, editor.token)).data[0];
  assert.equal(
    (
      await periodSave(
        editor.token,
        { ...annual, status: "published" },
        year.revision,
      )
    ).status,
    400,
    "unfinished period cannot publish",
  );
  assert.equal(
    (await readPeriod()).status,
    "draft",
    "August fixture remains a draft",
  );
  console.log(
    "PASS: monthly/weekly/annual drafts, Markdown editing, historical notice, role matrix, dates, atomic rollback, duplicate periods, stale writes, explicit publication",
  );
  const demoted = await request(
    `/rest/v1/editorial_members?user_id=eq.${editor.id}`,
    admin.token,
    "PATCH",
    { role: "viewer" },
  );
  assert.equal(demoted.status, 200);
  assert.equal(
    (
      await save(editor.token, {
        ...document,
        id: randomUUID(),
        slug: `revoked-${tag}`,
      })
    ).status,
    403,
    "old token loses editorial write access",
  );
  const audit = await request(
    `/rest/v1/news_audit_log?article_id=eq.${id}`,
    admin.token,
  );
  assert.equal(audit.status, 200);
  assert(audit.data.some((e) => e.action === "article_archived"));
  console.log(
    "PASS: REST draft visibility, role matrix, publication, source requirement, stale writes, archive, revocation and audits",
  );
} finally {
  // Author deletion must preserve article history without blocking account deletion.
  for (const user of users) {
    const result = await request(
      `/auth/v1/admin/users/${user.id}`,
      secret,
      "DELETE",
    );
    assert.equal(result.status, 200, `local ${user.role} account cleanup`);
  }
}
