"use client";
import { periodBasis } from "@/lib/periods";
import { useCallback, useEffect, useState } from "react";
import { articleSelect, emptyArticle, type Article } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errors";
type Row = Article & {
  news_article_sources: Article["sources"];
  news_article_categories: { category_id: string }[];
  news_article_securities: { security_id: string }[];
};
export function PeriodRecaps({
  writable,
  onOpen,
}: {
  writable: boolean;
  onOpen: (article: Article) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [page, setPage] = useState(0),
    [count, setCount] = useState(0);
  const reload = useCallback(async () => {
    const result = await supabase()
      .from("news_articles")
      .select(articleSelect, { count: "exact" })
      .not("recap_period", "is", null)
      .order("period_start", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 19);
    if (result.error) throw result.error;
    setRows(result.data as unknown as Row[]);
    setCount(result.count ?? 0);
    setError("");
  }, [page]);
  useEffect(() => {
    const timer = setTimeout(
      () => void reload().catch((e) => setError(errorMessage(e))),
      0,
    );
    return () => clearTimeout(timer);
  }, [reload]);
  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Market recaps</h1>
          <p className="muted">
            Balanços semanais, mensais e anuais, com fontes e publicação
            explícita.
          </p>
        </div>
        {writable && (
          <button
            className="primary"
            onClick={() =>
              onOpen({
                ...emptyArticle(),
                recap_period: "monthly",
                period_start: "",
                period_end: "",
                reference_session: null,
              })
            }
          >
            Criar recap por período
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="error">
          {error} Verifique se a migração de recaps por período foi aplicada.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Relatório histórico</th>
              <th>Período</th>
              <th>Base dos dados</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <button
                    className="title-link"
                    onClick={() =>
                      onOpen({
                        ...row,
                        sources: row.news_article_sources.map((source) => ({
                          ...source,
                          source_title: source.source_title ?? "",
                        })),
                        category_ids: row.news_article_categories.map(
                          (c) => c.category_id,
                        ),
                        security_ids: row.news_article_securities.map(
                          (s) => s.security_id,
                        ),
                      })
                    }
                  >
                    {row.title || "Sem título"}
                  </button>
                </td>
                <td>
                  {row.recap_period} · {row.period_start} a {row.period_end}
                </td>
                <td>{periodBasis(row)}</td>
                <td>
                  <span className={`badge ${row.status}`}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && !error && (
          <p className="empty">
            Ainda não há recaps por período. Crie um rascunho para começar.
          </p>
        )}
      </div>
      <footer className="pagination">
        <span>{count} recaps</span>
        <div>
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <button
            disabled={(page + 1) * 20 >= count}
            onClick={() => setPage(page + 1)}
          >
            Seguinte
          </button>
          <button
            onClick={() =>
              void reload().catch((e) => setError(errorMessage(e)))
            }
          >
            Actualizar
          </button>
        </div>
      </footer>
    </section>
  );
}
