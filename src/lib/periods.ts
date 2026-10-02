import type { Article } from "./types";
export function periodErrors(
  article: Article,
  status: Article["status"],
  today = new Date().toISOString().slice(0, 10),
): string[] {
  if (!article.recap_period) return [];
  const {
    period_start: start,
    period_end: end,
    reference_session: session,
  } = article;
  const valid = (value: string | null | undefined) =>
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end))
    return ["Preencha datas válidas de início e fim."];
  if (session && !valid(session))
    return [
      "Preencha uma sessão de referência válida ou deixe o campo em branco para dados agregados.",
    ];
  const first = new Date(start!);
  const last = new Date(first);
  if (article.recap_period === "weekly")
    last.setUTCDate(first.getUTCDate() + 6);
  if (article.recap_period === "monthly")
    last.setUTCMonth(first.getUTCMonth() + 1, 0);
  if (article.recap_period === "annual")
    last.setUTCFullYear(first.getUTCFullYear() + 1, 0, 0);
  const errors: string[] = [];
  if (
    (article.recap_period === "weekly" && first.getUTCDay() !== 1) ||
    (article.recap_period !== "weekly" && first.getUTCDate() !== 1) ||
    (article.recap_period === "annual" && first.getUTCMonth() !== 0) ||
    last.toISOString().slice(0, 10) !== end
  )
    errors.push("Escolha uma semana, mês ou ano civil completo.");
  if (session && (session < start! || session > end!))
    errors.push("A sessão de referência deve pertencer ao período.");
  if (status === "published" && end! >= today)
    errors.push("Só é possível publicar períodos concluídos.");
  return errors;
}

export function periodBasis(article: Article): string {
  if (article.reference_session)
    return `Sessão de referência: ${article.reference_session}`;
  const label =
    article.recap_period === "monthly"
      ? "mensal"
      : article.recap_period === "weekly"
        ? "semanal"
        : "anual";
  return `Base agregada ${label}; sem sessão específica`;
}
