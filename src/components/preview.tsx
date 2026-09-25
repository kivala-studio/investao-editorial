import Markdown from "react-markdown";
import type { Article, Reference, Security } from "@/lib/types";
import { normalizeMarkdown, safeURL } from "@/lib/markdown";
export function Preview({
  article,
  categories,
  sources,
  securities,
}: {
  article: Article;
  categories: Reference[];
  sources: Reference[];
  securities: Security[];
}) {
  return (
    <article className="article-preview">
      <p className="eyebrow">
        {categories
          .filter((c) => article.category_ids.includes(c.id))
          .map((c) => c.name)
          .join(" · ") || "Article preview"}
      </p>
      <h1>{article.title || "Untitled article"}</h1>
      <p className="lede">{article.summary || "Your summary appears here."}</p>
      <p className="muted">
        {article.published_at
          ? new Date(article.published_at).toLocaleDateString("pt-AO")
          : "Not published"}
      </p>
      <div className="markdown">
        <Markdown
          skipHtml
          allowedElements={[
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "strong",
            "em",
            "a",
            "ol",
            "ul",
            "li",
            "blockquote",
            "hr",
            "br",
          ]}
          urlTransform={(url) => (safeURL(url) ? url : "")}
        >
          {normalizeMarkdown(article.body_markdown)}
        </Markdown>
      </div>
      {!!article.sources.length && (
        <section>
          <h3>Sources</h3>
          {article.sources.map((source, index) => (
            <p key={index}>
              {safeURL(source.source_url) ? (
                <a
                  href={source.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {sources.find((s) => s.id === source.source_id)?.name ||
                    "Source"}{" "}
                  ↗
                </a>
              ) : (
                "Incomplete source"
              )}
              {source.is_primary ? " · Primary source" : ""}
            </p>
          ))}
        </section>
      )}
      {!!article.security_ids.length && (
        <section>
          <h3>Related securities</h3>
          <p>
            {securities
              .filter((s) => article.security_ids.includes(s.id))
              .map((s) => `${s.symbol} — ${s.name || ""}`)
              .join(" · ")}
          </p>
        </section>
      )}
    </article>
  );
}
