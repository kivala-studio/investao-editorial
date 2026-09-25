export type Role = "admin" | "editor" | "viewer";
export type Reference = { id: string; name: string };
export type Security = {
  id: string;
  symbol: string;
  name: string | null;
  issuers: { name: string } | null;
};
export type SourceLink = {
  source_id: string;
  source_url: string;
  source_title: string;
  is_primary: boolean;
};
export type Article = {
  id?: string;
  slug: string;
  title: string;
  summary: string;
  body_markdown: string;
  status: "draft" | "published" | "archived";
  revision?: number;
  author_id?: string;
  updated_at?: string;
  published_at?: string;
  sources: SourceLink[];
  category_ids: string[];
  security_ids: string[];
};
export function emptyArticle(): Article {
  return {
    slug: "",
    title: "",
    summary: "",
    body_markdown: "",
    status: "draft",
    sources: [],
    category_ids: [],
    security_ids: [],
  };
}
export const articleSelect =
  "*, news_article_sources(source_id,source_url,source_title,is_primary), news_article_categories(category_id), news_article_securities(security_id)";
