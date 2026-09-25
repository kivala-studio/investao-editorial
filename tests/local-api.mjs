// Integration checks exclusively against the CLI's local Supabase instance.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
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
