"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Plus, Trash2, Eye, FileText } from "lucide-react";
import {
  MAX_UPLOAD_BYTES,
  normalizeMarkdown,
  parseUpload,
  publicationErrors,
  slugify,
  validateMarkdown,
} from "@/lib/markdown";
import { errorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import type { Article, Reference, Security } from "@/lib/types";
import { Preview } from "./preview";
export function ArticleEditor({
  initial,
  writable,
  categories,
  sources,
  securities,
  addSource,
  onSaved,
}: {
  initial: Article;
  writable: boolean;
  categories: Reference[];
  sources: Reference[];
  securities: Security[];
  addSource: (name: string) => Promise<Reference>;
  onSaved: () => void;
}) {
  const [article, setArticle] = useState(initial),
    [file, setFile] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [securitySearch, setSecuritySearch] = useState("");
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<Article["status"] | null>(
    null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (confirmation) dialog.current?.showModal();
  }, [confirmation]);
  const warnings = validateMarkdown(article.body_markdown);
  const patch = (values: Partial<Article>) =>
    setArticle((previous) => ({ ...previous, ...values }));
  const matching = securities
    .filter((s) =>
      `${s.symbol} ${s.name} ${s.issuers?.name ?? ""}`
        .toLowerCase()
        .includes(securitySearch.toLowerCase()),
    )
    .slice(0, 30);
  async function upload(selected: File | undefined) {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (selected.size > MAX_UPLOAD_BYTES)
        throw new Error("The file must be 256 KB or smaller.");
      const parsed = parseUpload(selected.name, await selected.text());
      const notes: string[] = [];
      const category = categories.find(
        (c) => c.name.toLowerCase() === parsed.category.toLowerCase(),
      );
      if (parsed.category && !category)
        notes.push(
          `Category “${parsed.category}” was not found. Choose a category below.`,
        );
      const related = parsed.securities.map((symbol) =>
        securities.find((s) => s.symbol.toLowerCase() === symbol.toLowerCase()),
      );
      parsed.securities.forEach((symbol, index) => {
        if (!related[index])
          notes.push(
            `Security “${symbol}” was not found. Search the existing catalogue below.`,
          );
      });
      // Imports are local until Save. Missing source names are resolved explicitly below.
      const links = parsed.sources.map((source) => {
        const reference = sources.find(
          (s) => s.name.toLowerCase() === source.name.toLowerCase(),
        );
        if (!reference)
          notes.push(
            `Source “${source.name}” needs to be created or selected below.`,
          );
        return {
          source_id: reference?.id ?? "",
          source_url: source.url,
          source_title: source.name,
          is_primary: source.primary,
        };
      });
      patch({
        body_markdown: parsed.body,
        title: parsed.title || article.title,
        summary: parsed.summary || article.summary,
        slug: article.slug || slugify(parsed.title),
        category_ids: category ? [category.id] : article.category_ids,
        security_ids: parsed.securities.length
          ? related.flatMap((s) => (s ? [s.id] : []))
          : article.security_ids,
        sources: parsed.sources.length ? links : article.sources,
      });
      setFile(selected.name);
      setImportWarnings(notes);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  function requestSave(status: Article["status"]) {
    setError("");
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(article.slug)) {
      setError("Add a URL slug using lowercase letters, numbers and hyphens.");
      return;
    }
    const errors = status === "published" ? publicationErrors(article) : [];
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    if (
      status === "published" ||
      initial.status === "published" ||
      status === "archived"
    )
      setConfirmation(status);
    else void save(status);
  }
  async function save(status: Article["status"]) {
    setBusy(true);
    setError("");
    setConfirmation(null);
    try {
      const { error } = await supabase().rpc("save_news_article", {
        document: {
          ...article,
          body_markdown: normalizeMarkdown(article.body_markdown),
          status,
        },
        expected_revision: article.revision ?? null,
      });
      if (error) throw error;
      onSaved();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ARTICLE WORKSPACE</p>
          <h1>{initial.id ? "Review article" : "Upload article"}</h1>
          <p className="muted">
            Import Markdown, check the details, then publish.
          </p>
        </div>
        <span className={`badge ${article.status}`}>{article.status}</span>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="editor-grid">
        <section className="editor-panel">
          <fieldset disabled={!writable || busy}>
            <label className="upload-zone">
              <Upload size={23} />
              <strong>{file || "Choose a Markdown file"}</strong>
              <span>.md only · Up to 256 KB · Optional YAML front matter</span>
              <input
                type="file"
                accept=".md,text/markdown"
                aria-label={
                  initial.id ? "Replace Markdown file" : "Upload Markdown file"
                }
                onChange={(e) => {
                  void upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {initial.status === "published" && (
              <p className="notice">
                This article is live. Changes are only published after you
                review and confirm a save.
              </p>
            )}
            {!!importWarnings.length && (
              <div className="notice" role="status">
                {importWarnings.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            )}
            <div className="section-label">
              <FileText size={15} />
              Article details
            </div>
            <label>
              Title
              <input
                value={article.title}
                maxLength={300}
                onChange={(e) =>
                  patch({
                    title: e.target.value,
                    ...(!initial.id && !article.slug
                      ? { slug: slugify(e.target.value) }
                      : {}),
                  })
                }
              />
            </label>
            <label>
              URL slug
              <div className="inline-form">
                <input
                  value={article.slug}
                  onChange={(e) => patch({ slug: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => patch({ slug: slugify(article.title) })}
                >
                  From title
                </button>
              </div>
            </label>
            <label>
              Summary
              <textarea
                rows={3}
                value={article.summary}
                maxLength={2000}
                onChange={(e) => patch({ summary: e.target.value })}
              />
            </label>
            <label>
              Categories
              <select
                multiple
                value={article.category_ids}
                onChange={(e) =>
                  patch({
                    category_ids: Array.from(
                      e.target.selectedOptions,
                      (option) => option.value,
                    ),
                  })
                }
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="small muted">
                Use Command or Control to select multiple categories.
              </span>
            </label>
            <div className="section-label">Related securities</div>
            <label>
              Search securities
              <input
                placeholder="Symbol, name or company…"
                value={securitySearch}
                onChange={(e) => setSecuritySearch(e.target.value)}
              />
            </label>
            <div className="selected-items">
              {article.security_ids.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    patch({
                      security_ids: article.security_ids.filter(
                        (value) => value !== id,
                      ),
                    })
                  }
                >
                  {securities.find((s) => s.id === id)?.symbol ?? id} ×
                </button>
              ))}
            </div>
            <div className="security-results">
              {matching.map((s) => (
                <label className="checkbox" key={s.id}>
                  <input
                    type="checkbox"
                    checked={article.security_ids.includes(s.id)}
                    onChange={(e) =>
                      patch({
                        security_ids: e.target.checked
                          ? [...article.security_ids, s.id]
                          : article.security_ids.filter((id) => id !== s.id),
                      })
                    }
                  />
                  <span>
                    <strong>{s.symbol}</strong> {s.name}
                    <small>{s.issuers?.name}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className="section-label">
              Sources <span className="muted">Required for publication</span>
            </div>
            {article.sources.map((source, index) => (
              <div className="source-form" key={index}>
                <label>
                  Source
                  <select
                    value={source.source_id}
                    onChange={(e) =>
                      patch({
                        sources: article.sources.map((s, i) =>
                          i === index ? { ...s, source_id: e.target.value } : s,
                        ),
                      })
                    }
                  >
                    <option value="">Choose source</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Source URL
                  <input
                    type="url"
                    value={source.source_url}
                    onChange={(e) =>
                      patch({
                        sources: article.sources.map((s, i) =>
                          i === index
                            ? { ...s, source_url: e.target.value }
                            : s,
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Reference title
                  <input
                    value={source.source_title}
                    maxLength={300}
                    onChange={(e) =>
                      patch({
                        sources: article.sources.map((s, i) =>
                          i === index
                            ? { ...s, source_title: e.target.value }
                            : s,
                        ),
                      })
                    }
                  />
                </label>
                <div className="source-actions">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={source.is_primary}
                      onChange={(e) =>
                        patch({
                          sources: article.sources.map((s, i) =>
                            i === index
                              ? { ...s, is_primary: e.target.checked }
                              : s,
                          ),
                        })
                      }
                    />
                    Official / primary source
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove source ${index + 1}`}
                    onClick={() =>
                      patch({
                        sources: article.sources.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            <div className="inline-form">
              <button
                type="button"
                onClick={() =>
                  patch({
                    sources: [
                      ...article.sources,
                      {
                        source_id: "",
                        source_url: "",
                        source_title: "",
                        is_primary: false,
                      },
                    ],
                  })
                }
              >
                <Plus size={15} />
                Attach source
              </button>
              <button
                type="button"
                onClick={async () => {
                  const name = window.prompt("New source name");
                  if (!name?.trim()) return;
                  try {
                    const result = await addSource(name);
                    patch({
                      sources: [
                        ...article.sources,
                        {
                          source_id: result.id,
                          source_url: "",
                          source_title: "",
                          is_primary: false,
                        },
                      ],
                    });
                  } catch (reason) {
                    setError(errorMessage(reason));
                  }
                }}
              >
                Create source
              </button>
            </div>
            <label className="body-label">
              Markdown body
              <textarea
                className="markdown-input"
                rows={16}
                value={article.body_markdown}
                onChange={(e) => patch({ body_markdown: e.target.value })}
              />
            </label>
            {!!warnings.length && (
              <div className="notice">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
          </fieldset>
        </section>
        <section className="preview-panel">
          <div className="section-label">
            <Eye size={16} />
            Reader preview
          </div>
          <Preview
            article={article}
            categories={categories}
            sources={sources}
            securities={securities}
          />
        </section>
      </div>
      {writable && (
        <div className="savebar">
          <span className="muted small">
            {file || "Markdown article"} · Changes are not saved automatically
          </span>
          <div>
            <button disabled={busy} onClick={() => requestSave("archived")}>
              Archive
            </button>
            <button disabled={busy} onClick={() => requestSave("draft")}>
              {initial.status === "published" ? "Unpublish" : "Save draft"}
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => requestSave("published")}
            >
              {busy
                ? "Saving…"
                : initial.status === "published"
                  ? "Publish changes"
                  : "Publish"}
            </button>
          </div>
        </div>
      )}
      {confirmation && (
        <dialog
          ref={dialog}
          onCancel={() => setConfirmation(null)}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirmation-title"
          aria-describedby="confirmation-description"
          className="modal"
        >
          <h2 id="confirmation-title">
            {confirmation === "published"
              ? "Publish this article?"
              : confirmation === "draft"
                ? "Unpublish this article?"
                : "Archive this article?"}
          </h2>
          <p id="confirmation-description">
            {confirmation === "published"
              ? "It will become immediately available to Invest.ao users."
              : "It will no longer be available to Invest.ao users."}
          </p>
          <div className="modal-actions">
            <button autoFocus onClick={() => setConfirmation(null)}>
              Cancel
            </button>
            <button className="primary" onClick={() => void save(confirmation)}>
              Confirm{" "}
              {confirmation === "published"
                ? "publication"
                : confirmation === "draft"
                  ? "unpublish"
                  : "archive"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}
