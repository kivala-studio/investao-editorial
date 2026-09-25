"use client";
import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  Upload,
  Library,
  Users,
  History,
  LogOut,
  ArrowUpRight,
  Plus,
  Search,
  BellRing,
} from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import {
  articleSelect,
  emptyArticle,
  type Article,
  type Reference,
  type Role,
  type Security,
} from "@/lib/types";
import { ArticleEditor } from "./article-editor";
import { MarketRecaps } from "./market-recaps";

type Row = Article & {
  news_article_sources: Article["sources"];
  news_article_categories: { category_id: string }[];
  news_article_securities: { security_id: string }[];
};
type Screen = "articles" | "edit" | "recaps" | "sources" | "users" | "audit";
export function Portal() {
  const [identity, setIdentity] = useState<{
    id: string;
    email: string;
    role: Role;
  } | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>("articles");
  const [articles, setArticles] = useState<Row[]>([]),
    [count, setCount] = useState(0),
    [page, setPage] = useState(0);
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState("");
  const [categories, setCategories] = useState<Reference[]>([]),
    [sources, setSources] = useState<Reference[]>([]),
    [securities, setSecurities] = useState<Security[]>([]);
  const [article, setArticle] = useState<Article>(emptyArticle);
  const [editorVersion, setEditorVersion] = useState(0);
  const [members, setMembers] = useState<{ user_id: string; role: Role }[]>([]);
  const [audit, setAudit] = useState<
    {
      id: number;
      article_id: string;
      actor_id: string;
      action: string;
      created_at: string;
    }[]
  >([]);
  const writable = identity?.role === "admin" || identity?.role === "editor";
  const fail = (reason: unknown) => setError(errorMessage(reason));
  const refreshIdentity = useCallback(async () => {
    try {
      const db = supabase();
      const {
        data: { user },
        error,
      } = await db.auth.getUser();
      if (!user) {
        setIdentity(null);
        return;
      }
      if (error) throw error;
      const { data, error: roleError } = await db
        .from("editorial_members")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (roleError) throw roleError;
      if (!data) {
        setIdentity(null);
        setError(
          "This account has no editorial access. Ask an administrator to add your existing account.",
        );
        await db.auth.signOut();
        return;
      }
      setIdentity({
        id: user.id,
        email: user.email ?? user.id,
        role: data.role,
      });
    } catch (reason) {
      fail(reason);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void refreshIdentity(), 0);
    return () => clearTimeout(timer);
  }, [refreshIdentity]);
  useEffect(() => {
    if (!identity) return;
    let active = true;
    async function load() {
      try {
        const db = supabase();
        const [c, s] = await Promise.all([
          db.from("news_categories").select("id,name").order("name"),
          db.from("news_sources").select("id,name").order("name"),
        ]);
        if (c.error) throw c.error;
        if (s.error) throw s.error;
        // Page the existing catalogue instead of assuming the API's default row limit covers it.
        const all: Security[] = [];
        for (let offset = 0; ; offset += 500) {
          const result = await db
            .from("securities")
            .select("id,symbol,name,issuers(name)")
            .order("id")
            .range(offset, offset + 499);
          if (result.error) throw result.error;
          all.push(...(result.data as unknown as Security[]));
          if (result.data.length < 500) break;
        }
        if (active) {
          setCategories(c.data);
          setSources(s.data);
          setSecurities(all);
        }
      } catch (reason) {
        if (active) fail(reason);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [identity]);
  const loadArticles = useCallback(async () => {
    let query = supabase()
      .from("news_articles")
      .select(
        category
          ? `${articleSelect},category_filter:news_article_categories!inner(category_id)`
          : articleSelect,
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 19);
    if (search.trim())
      query = query.ilike(
        "title",
        `%${search.trim().replace(/[%_]/g, "\\$&")}%`,
      );
    if (status) query = query.eq("status", status);
    if (category) query = query.eq("category_filter.category_id", category);
    const { data, error, count } = await query;
    if (error) throw error;
    setArticles(data as unknown as Row[]);
    setCount(count ?? 0);
  }, [search, status, category, page]);
  useEffect(() => {
    if (identity && screen === "articles") {
      const timer = setTimeout(() => void loadArticles().catch(fail), 200);
      return () => clearTimeout(timer);
    }
  }, [identity, screen, loadArticles]);
  async function navigate(next: Screen) {
    setError("");
    setScreen(next);
    try {
      if (next === "users") {
        const { data, error } = await supabase()
          .from("editorial_members")
          .select("user_id,role")
          .order("created_at");
        if (error) throw error;
        setMembers(data);
      }
      if (next === "audit") {
        const { data, error } = await supabase()
          .from("news_audit_log")
          .select("*")
          .order("id", { ascending: false })
          .limit(100);
        if (error) throw error;
        setAudit(data);
      }
    } catch (reason) {
      fail(reason);
    }
  }
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await supabase().auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error) throw error;
      await refreshIdentity();
    } catch (reason) {
      fail(reason);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const { error } = await supabase().auth.signOut();
      if (error) throw error;
      setIdentity(null);
      setArticles([]);
      setArticle(emptyArticle());
      setEditorVersion((version) => version + 1);
      setMembers([]);
      setAudit([]);
    } catch (reason) {
      fail(reason);
    } finally {
      setBusy(false);
    }
  }
  async function addSource(name: string) {
    const { data, error } = await supabase()
      .from("news_sources")
      .insert({ name: name.trim() })
      .select("id,name")
      .single();
    if (error) throw error;
    setSources((previous) =>
      [...previous, data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return data;
  }
  if (!ready)
    return (
      <main className="login">
        <p>Opening editorial workspace…</p>
      </main>
    );
  if (!identity)
    return (
      <main className="login">
        <form onSubmit={login} className="login-card">
          <div className="brand">
            invest<span>.ao</span>
            <small>EDITORIAL</small>
          </div>
          <h1>Sign in to editorial</h1>
          <p className="muted">
            A workspace for the stories behind the market.
          </p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} <ArrowUpRight size={16} />
          </button>
          <p className="muted small">
            Access is assigned by an administrator. No public registration.
          </p>
        </form>
      </main>
    );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <div className="brand">
          invest<span>.ao</span>
          <small>EDITORIAL</small>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          <button
            aria-current={screen === "articles" ? "page" : undefined}
            onClick={() => void navigate("articles")}
          >
            <FileText size={17} />
            Articles
          </button>
          {writable && (
            <button
              aria-current={screen === "edit" ? "page" : undefined}
              onClick={() => {
                setArticle(emptyArticle());
                setEditorVersion((version) => version + 1);
                void navigate("edit");
              }}
            >
              <Upload size={17} />
              Upload article
            </button>
          )}
          <button
            aria-current={screen === "sources" ? "page" : undefined}
            onClick={() => void navigate("sources")}
          >
            <Library size={17} />
            Sources
          </button>
          <button
            aria-current={screen === "recaps" ? "page" : undefined}
            onClick={() => void navigate("recaps")}
          >
            <BellRing size={17} />
            Market recaps
          </button>
          {identity.role === "admin" && (
            <>
              <p className="nav-caption">ADMINISTRATION</p>
              <button onClick={() => void navigate("users")}>
                <Users size={17} />
                Users & roles
              </button>
              <button onClick={() => void navigate("audit")}>
                <History size={17} />
                Audit log
              </button>
            </>
          )}
        </nav>
        <div className="account">
          <p>{identity.email}</p>
          <span className="badge">{identity.role}</span>
          <button onClick={() => void logout()} disabled={busy}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            Workspace <span className="muted">/</span>{" "}
            {screen === "edit"
              ? "Article review"
              : screen.charAt(0).toUpperCase() + screen.slice(1)}
          </span>
          <span className="internal">
            <i /> Internal access
          </span>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="error">
              {error}
            </div>
          )}
          {screen === "articles" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">PUBLISHING</p>
                  <h1>
                    Articles <span className="counter">{count}</span>
                  </h1>
                  <p className="muted">
                    From a first draft to a published perspective.
                  </p>
                </div>
                {writable && (
                  <button
                    className="primary"
                    onClick={() => {
                      setArticle(emptyArticle());
                      setEditorVersion((version) => version + 1);
                      void navigate("edit");
                    }}
                  >
                    <Plus size={16} />
                    Upload article
                  </button>
                )}
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search articles"
                    placeholder="Search articles…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <select
                  aria-label="Filter status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All statuses</option>
                  {["draft", "published", "archived"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter category"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Author</th>
                      <th>Updated</th>
                      <th>Published</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articles.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <button
                            className="title-link"
                            onClick={() => {
                              setArticle({
                                ...row,
                                sources: row.news_article_sources.map((s) => ({
                                  ...s,
                                  source_title: s.source_title ?? "",
                                })),
                                category_ids: row.news_article_categories.map(
                                  (c) => c.category_id,
                                ),
                                security_ids: row.news_article_securities.map(
                                  (s) => s.security_id,
                                ),
                              });
                              void navigate("edit");
                            }}
                          >
                            {row.title || "Untitled article"}
                          </button>
                          <p className="small muted">/{row.slug}</p>
                        </td>
                        <td>
                          <span className={`badge ${row.status}`}>
                            {row.status}
                          </span>
                        </td>
                        <td title={row.author_id}>
                          {row.author_id === identity.id
                            ? "You"
                            : row.author_id?.slice(0, 8) || "Deleted user"}
                        </td>
                        <td>
                          {row.updated_at
                            ? new Date(row.updated_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td>
                          {row.published_at
                            ? new Date(row.published_at).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!articles.length && (
                  <div className="empty">
                    <FileText size={28} />
                    <h3>No articles yet</h3>
                    <p>
                      Upload a Markdown file to start, or adjust your filters.
                    </p>
                  </div>
                )}
              </div>
              <footer className="pagination">
                <span className="muted small">
                  {count} articles · Page {page + 1}
                </span>
                <div>
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>
                  <button
                    disabled={(page + 1) * 20 >= count}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </footer>
            </>
          )}
          {screen === "edit" && (
            <ArticleEditor
              key={`${article.id ?? "new"}-${editorVersion}`}
              initial={article}
              writable={writable}
              categories={categories}
              sources={sources}
              securities={securities}
              addSource={addSource}
              onSaved={() => void navigate("articles")}
            />
          )}
          {screen === "recaps" && <MarketRecaps writable={writable} />}
          {screen === "sources" && (
            <>
              <div className="page-heading">
                <div>
                  <p className="eyebrow">REFERENCES</p>
                  <h1>Sources</h1>
                  <p className="muted">
                    Prefer official announcements and primary sources.
                  </p>
                </div>
              </div>
              {writable && (
                <form
                  className="inline-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    try {
                      await addSource(String(new FormData(form).get("name")));
                      form.reset();
                    } catch (reason) {
                      fail(reason);
                    }
                  }}
                >
                  <input
                    name="name"
                    aria-label="New source name"
                    placeholder="Source name"
                    required
                    maxLength={200}
                  />
                  <button className="primary">Add source</button>
                </form>
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => (
                      <tr key={source.id}>
                        <td>{source.name}</td>
                        <td>
                          {writable && (
                            <button
                              onClick={async () => {
                                const name = window.prompt(
                                  "Source name",
                                  source.name,
                                );
                                if (!name?.trim()) return;
                                const { error } = await supabase()
                                  .from("news_sources")
                                  .update({ name: name.trim() })
                                  .eq("id", source.id);
                                if (error) fail(error);
                                else
                                  setSources(
                                    sources.map((s) =>
                                      s.id === source.id
                                        ? { ...s, name: name.trim() }
                                        : s,
                                    ),
                                  );
                              }}
                            >
                              Rename
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {screen === "users" && identity.role === "admin" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Users & roles</h1>
                  <p className="muted">
                    Grant access to an existing Invest.ao account by user ID.
                  </p>
                </div>
              </div>
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const data = new FormData(form);
                  const { error } = await supabase()
                    .from("editorial_members")
                    .insert({
                      user_id: data.get("user_id"),
                      role: data.get("role"),
                    });
                  if (error) fail(error);
                  else {
                    form.reset();
                    void navigate("users");
                  }
                }}
              >
                <input
                  name="user_id"
                  aria-label="Existing user ID"
                  placeholder="Existing account UUID"
                  required
                  pattern="[0-9a-fA-F-]{36}"
                />
                <select name="role" aria-label="Role">
                  <option>viewer</option>
                  <option>editor</option>
                  <option>admin</option>
                </select>
                <button className="primary">Grant access</button>
              </form>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Role</th>
                      <th>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.user_id}>
                        <td>
                          {member.user_id}
                          {member.user_id === identity.id ? " (you)" : ""}
                        </td>
                        <td>
                          <select
                            aria-label={`Role for ${member.user_id}`}
                            value={member.role}
                            disabled={member.user_id === identity.id}
                            onChange={async (e) => {
                              const { error } = await supabase()
                                .from("editorial_members")
                                .update({ role: e.target.value })
                                .eq("user_id", member.user_id);
                              if (error) fail(error);
                              else void navigate("users");
                            }}
                          >
                            {["viewer", "editor", "admin"].map((r) => (
                              <option key={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button
                            disabled={member.user_id === identity.id}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  "Revoke editorial access for this user?",
                                )
                              )
                                return;
                              const { error } = await supabase()
                                .from("editorial_members")
                                .delete()
                                .eq("user_id", member.user_id);
                              if (error) fail(error);
                              else void navigate("users");
                            }}
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {screen === "audit" && identity.role === "admin" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Audit log</h1>
                  <p className="muted">The latest 100 editorial events.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Article</th>
                      <th>Actor</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((event) => (
                      <tr key={event.id}>
                        <td>{event.action.replaceAll("_", " ")}</td>
                        <td>{event.article_id}</td>
                        <td>{event.actor_id || "Deleted user"}</td>
                        <td>{new Date(event.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
