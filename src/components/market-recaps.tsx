"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { supabase } from "@/lib/supabase";

type FactRow = {
  security_id: string;
  symbol: string;
  close_price: number;
  previous_close: number | null;
  previous_date: string | null;
  change_percent: number | null;
  turnover: number;
  share_count: number;
  trade_count: number;
};
type Facts = {
  trading_date: string;
  currency: string;
  source_url: string;
  source_completed_at: string;
  source_row_count: number;
  source_imported_row_count: number;
  source_quarantined_row_count: number;
  selected_count: number;
  turnover: number;
  share_count: number;
  trade_count: number;
  rows: FactRow[];
};
type Recap = {
  id: string;
  trading_date: string;
  current_version: number;
  published_version: number | null;
  article_id: string | null;
  push_deadline: string;
  generation_reason: string | null;
};
type Edition = {
  id: string;
  recap_id: string;
  version: number;
  facts: Facts;
  facts_hash: string;
  source_sha256: string;
  source_raw_object_path: string;
  quality_status: "blocked" | "ready" | "approved";
  quality_reason: string | null;
  content_revision: number;
  official_source_url: string | null;
  official_source_sha256: string | null;
  official_raw_object_path: string | null;
  official_turnover: number | null;
  official_trade_count: number | null;
  official_share_count: number | null;
  expected_symbols: string[];
  headline: string | null;
  commentary: string | null;
  correction_note: string | null;
  push_title: string | null;
  push_body: string | null;
};
type Preview = {
  title: string;
  summary: string;
  body_markdown: string;
  push_title: string;
  push_body: string;
};
type Evidence = { id: string; sha256: string; rawObjectPath: string };

const number = (value: number | null, digits = 0) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("pt-AO", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(value);

export function MarketRecaps({ writable }: { writable: boolean }) {
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [expectedSymbols, setExpectedSymbols] = useState("");
  const [officialTurnover, setOfficialTurnover] = useState("");
  const [officialShares, setOfficialShares] = useState("");
  const [officialTrades, setOfficialTrades] = useState("");
  const [headline, setHeadline] = useState("Fecho das acções");
  const [commentary, setCommentary] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [coverageConfirmed, setCoverageConfirmed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkedAt, setCheckedAt] = useState(0);
  const selected = recaps.find((item) => item.id === selectedId);
  const edition = editions.find(
    (item) =>
      item.recap_id === selectedId &&
      item.version === selected?.current_version,
  );

  const reload = useCallback(async () => {
    const db = supabase();
    const list = await db
      .from("market_recaps")
      .select(
        "id,trading_date,current_version,published_version,article_id,push_deadline,generation_reason",
      )
      .order("trading_date", { ascending: false })
      .limit(30);
    if (list.error) throw list.error;
    const items = (list.data ?? []) as Recap[];
    const versions = items.length
      ? await db
          .from("market_recap_versions")
          .select(
            "id,recap_id,version,facts,facts_hash,source_sha256,source_raw_object_path,quality_status,quality_reason,content_revision,official_source_url,official_source_sha256,official_raw_object_path,official_turnover,official_trade_count,official_share_count,expected_symbols,headline,commentary,correction_note,push_title,push_body",
          )
          .in(
            "recap_id",
            items.map((item) => item.id),
          )
          .order("version", { ascending: false })
      : { data: [], error: null };
    if (versions.error) throw versions.error;
    setRecaps(items);
    setEditions((versions.data ?? []) as Edition[]);
    setCheckedAt(Date.now());
    setSelectedId((current) =>
      current && items.some((item) => item.id === current)
        ? current
        : (items[0]?.id ?? null),
    );
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void reload().catch((reason) => setError(errorMessage(reason)));
    }, 0);
    return () => clearTimeout(timer);
  }, [reload]);

  function selectRecap(id: string) {
    setSelectedId(id);
    setEvidence(null);
    setPreview(null);
    setError("");
    setNotice("");
    setCoverageConfirmed(false);
    setSourceUrl("");
    setExpectedSymbols("");
    setOfficialTurnover("");
    setOfficialShares("");
    setOfficialTrades("");
    setHeadline("Fecho das acções");
    setCommentary("");
    setCorrectionNote("");
  }

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
      await reload().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function captureEvidence() {
    if (!selected) return;
    await act(async () => {
      const result = await supabase().functions.invoke(
        "capture-recap-evidence",
        {
          body: { tradingDate: selected.trading_date, sourceUrl },
        },
      );
      if (result.error) throw result.error;
      setEvidence(result.data as Evidence);
      setPreview(null);
      setNotice("Boletim arquivado. Confirme os totais e a lista de acções.");
    });
  }

  async function openArchivedEvidence(path: string) {
    await act(async () => {
      const result = await supabase().functions.invoke(
        "capture-recap-evidence",
        {
          body: { action: "signedUrl", rawObjectPath: path },
        },
      );
      if (result.error) throw result.error;
      const url = (result.data as { signedUrl: string }).signedUrl;
      window.location.assign(url);
    });
  }

  async function review() {
    if (!selected || !edition || !evidence) return;
    await act(async () => {
      const result = await supabase().rpc("review_market_recap_candidate", {
        requested_recap_id: selected.id,
        expected_version: edition.version,
        expected_hash: edition.facts_hash,
        expected_revision: edition.content_revision,
        review: {
          evidence_id: evidence.id,
          expected_symbols: expectedSymbols
            .split(/[\s,;]+/)
            .map((x) => x.trim())
            .filter(Boolean),
          turnover: officialTurnover.replace(",", "."),
          share_count: officialShares.replace(",", "."),
          trade_count: officialTrades,
          coverage_confirmed: coverageConfirmed,
          headline,
          commentary,
          correction_note: correctionNote,
        },
      });
      if (result.error) throw result.error;
      await reload();
      setNotice("Valores reconciliados. Veja a prévia antes de publicar.");
      setPreview(null);
    });
  }

  async function showPreview() {
    if (!selected || !edition) return;
    await act(async () => {
      const result = await supabase().rpc("preview_market_recap", {
        requested_recap_id: selected.id,
        requested_version: edition.version,
      });
      if (result.error) throw result.error;
      setPreview(result.data as Preview);
    });
  }

  async function publish() {
    if (!selected || !edition || !preview) return;
    await act(async () => {
      let articleRevision: number | null = null;
      if (selected.article_id) {
        const current = await supabase()
          .from("news_articles")
          .select("revision")
          .eq("id", selected.article_id)
          .single();
        if (current.error) throw current.error;
        articleRevision = current.data.revision;
      }
      const result = await supabase().rpc("publish_market_recap", {
        requested_recap_id: selected.id,
        expected_version: edition.version,
        expected_hash: edition.facts_hash,
        expected_revision: edition.content_revision,
        expected_article_revision: articleRevision,
      });
      if (result.error) throw result.error;
      await reload();
      setPreview(null);
      setNotice(
        "Recap publicado. O envio depende do prazo e do controlo de lançamento.",
      );
    });
  }

  async function startCorrection() {
    if (!selected) return;
    await act(async () => {
      const result = await supabase().rpc("start_market_recap_correction", {
        requested_recap_id: selected.id,
        expected_version: selected.current_version,
      });
      if (result.error) throw result.error;
      await reload();
      setPreview(null);
      setEvidence(null);
      setNotice(
        "Nova versão criada. Reconcilie novamente com o boletim antes de publicar.",
      );
    });
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MERCADOS</p>
          <h1>Fechos das acções</h1>
          <p className="muted">
            Um boletim verificado por sessão, com publicação editorial
            explícita.
          </p>
        </div>
        <button type="button" onClick={() => void act(reload)} disabled={busy}>
          Actualizar
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="recap-layout">
        <div className="recap-queue" aria-label="Sessões">
          {recaps.length === 0 && (
            <p className="muted">Ainda não há sessões candidatas.</p>
          )}
          {recaps.map((item) => {
            const latest = editions.find(
              (value) =>
                value.recap_id === item.id &&
                value.version === item.current_version,
            );
            return (
              <button
                key={item.id}
                className={selectedId === item.id ? "selected" : ""}
                onClick={() => selectRecap(item.id)}
              >
                <strong>{item.trading_date}</strong>
                <span>
                  {item.published_version
                    ? item.published_version === item.current_version
                      ? "Publicado"
                      : "Correcção pendente"
                    : latest?.quality_status === "ready"
                      ? "Pronto para revisão"
                      : "Bloqueado"}
                </span>
              </button>
            );
          })}
        </div>
        {selected && !edition && (
          <div className="recap-detail">
            <h2>{selected.trading_date} · candidato bloqueado</h2>
            <p className="error">
              {selected.generation_reason ?? "A aguardar dados da sessão."}
            </p>
          </div>
        )}
        {selected && edition && (
          <div className="recap-detail">
            <p className="eyebrow">
              ACÇÕES · {selected.trading_date} · VERSÃO {edition.version}
            </p>
            <h2>
              {selected.published_version === edition.version
                ? "Publicado"
                : edition.quality_status === "ready"
                  ? "Pronto para publicar"
                  : "Candidato bloqueado"}
            </h2>
            {edition.quality_reason && (
              <p className="error">{edition.quality_reason}</p>
            )}
            <p className="muted">
              Prazo de envio:{" "}
              {new Date(selected.push_deadline).toLocaleString("pt-AO")}
              {checkedAt > Date.parse(selected.push_deadline) &&
                " · publicação sem push"}
            </p>
            {writable &&
              selected.published_version === selected.current_version && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void startCorrection()}
                >
                  Preparar correcção
                </button>
              )}
            <div className="recap-facts">
              <div>
                <small>Transacções da fonte</small>
                <strong>{number(edition.facts.trade_count)}</strong>
              </div>
              <div>
                <small>Acções</small>
                <strong>{number(edition.facts.share_count)}</strong>
              </div>
              <div>
                <small>Valor negociado</small>
                <strong>{number(edition.facts.turnover, 2)} Kz</strong>
              </div>
            </div>
            <p className="muted small">
              Importação: {edition.facts.source_imported_row_count} de{" "}
              {edition.facts.source_row_count} linhas;{" "}
              {edition.facts.source_quarantined_row_count} em quarentena. Obtida
              em{" "}
              {edition.facts.source_completed_at
                ? new Date(edition.facts.source_completed_at).toLocaleString(
                    "pt-AO",
                  )
                : "—"}
              .
            </p>
            <p className="muted small">
              Fonte:{" "}
              <a
                href={edition.facts.source_url}
                target="_blank"
                rel="noreferrer"
              >
                abrir origem
              </a>{" "}
              · SHA-256 {edition.source_sha256} ·{" "}
              {edition.source_raw_object_path}
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Acção</th>
                    <th>Fecho</th>
                    <th>Base</th>
                    <th>Variação</th>
                    <th>Acções</th>
                    <th>Operações</th>
                    <th>Valor Kz</th>
                  </tr>
                </thead>
                <tbody>
                  {edition.facts.rows.map((row) => (
                    <tr key={row.security_id}>
                      <td>{row.symbol}</td>
                      <td>{number(row.close_price, 2)}</td>
                      <td>
                        {row.previous_date ?? "—"} ·{" "}
                        {number(row.previous_close, 2)}
                      </td>
                      <td>{number(row.change_percent, 2)}%</td>
                      <td>{number(row.share_count)}</td>
                      <td>{number(row.trade_count)}</td>
                      <td>{number(row.turnover, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {edition.official_source_url && (
              <p className="notice">
                Boletim reconciliado:{" "}
                <a
                  href={edition.official_source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  abrir BODIVA
                </a>{" "}
                · SHA-256 {edition.official_source_sha256}. Total:{" "}
                {number(edition.official_turnover, 2)} Kz;{" "}
                {number(edition.official_trade_count)} operações;{" "}
                {number(edition.official_share_count)} acções.
              </p>
            )}
            {edition.official_raw_object_path && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void openArchivedEvidence(edition.official_raw_object_path!)
                }
              >
                Abrir cópia arquivada do boletim
              </button>
            )}
            {writable && edition.quality_status === "blocked" && (
              <div className="recap-review">
                <h3>Conferir com o boletim oficial</h3>
                <label>
                  URL do PDF BODIVA
                  <input
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    placeholder="https://www.bodiva.ao/...pdf"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !sourceUrl}
                  onClick={() => void captureEvidence()}
                >
                  Arquivar boletim
                </button>
                {evidence && (
                  <p className="small muted">
                    Cópia arquivada · SHA-256 {evidence.sha256}
                  </p>
                )}
                <label>
                  Símbolos de todas as acções no boletim
                  <textarea
                    value={expectedSymbols}
                    onChange={(event) => setExpectedSymbols(event.target.value)}
                    placeholder="BAI, BFA, CGA"
                  />
                </label>
                <div className="recap-fields">
                  <label>
                    Valor negociado em Kz
                    <input
                      inputMode="decimal"
                      value={officialTurnover}
                      onChange={(event) =>
                        setOfficialTurnover(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Acções negociadas
                    <input
                      inputMode="numeric"
                      value={officialShares}
                      onChange={(event) =>
                        setOfficialShares(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Número de operações
                    <input
                      inputMode="numeric"
                      value={officialTrades}
                      onChange={(event) =>
                        setOfficialTrades(event.target.value)
                      }
                    />
                  </label>
                </div>
                <p className="small muted">
                  Diferença:{" "}
                  {officialTurnover
                    ? number(
                        Number(officialTurnover.replace(",", ".")) -
                          Number(edition.facts.turnover),
                        2,
                      )
                    : "—"}{" "}
                  Kz ·{" "}
                  {officialShares
                    ? number(
                        Number(officialShares.replace(",", ".")) -
                          Number(edition.facts.share_count),
                      )
                    : "—"}{" "}
                  acções ·{" "}
                  {officialTrades
                    ? number(
                        Number(officialTrades) -
                          Number(edition.facts.trade_count),
                      )
                    : "—"}{" "}
                  operações.
                </p>
                <label>
                  Título sem valores numéricos
                  <input
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                  />
                </label>
                <label>
                  Contexto editorial sem valores numéricos
                  <textarea
                    value={commentary}
                    onChange={(event) => setCommentary(event.target.value)}
                  />
                </label>
                {selected.published_version && (
                  <label>
                    Explicação da correcção
                    <textarea
                      value={correctionNote}
                      onChange={(event) =>
                        setCorrectionNote(event.target.value)
                      }
                    />
                  </label>
                )}
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={coverageConfirmed}
                    onChange={(event) =>
                      setCoverageConfirmed(event.target.checked)
                    }
                  />
                  Confirmei que a lista e os totais pertencem às acções desta
                  data.
                </label>
                <button
                  type="button"
                  disabled={busy || !evidence || !coverageConfirmed}
                  onClick={() => void review()}
                >
                  Validar valores e texto
                </button>
              </div>
            )}
            {edition.quality_status === "ready" && (
              <div className="recap-preview">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void showPreview()}
                >
                  Ver artigo e notificação
                </button>
                {preview && (
                  <>
                    <h3>Artigo</h3>
                    <strong>{preview.title}</strong>
                    <p>{preview.summary}</p>
                    <pre>{preview.body_markdown}</pre>
                    <h3>Notificação</h3>
                    <div className="recap-push">
                      <strong>{preview.push_title}</strong>
                      <p>{preview.push_body}</p>
                    </div>
                    {writable && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void publish()}
                      >
                        Publicar esta versão
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
