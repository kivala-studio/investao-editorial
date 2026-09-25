export function errorMessage(reason: unknown): string {
  if (reason && typeof reason === "object" && "message" in reason)
    return String(reason.message);
  return String(reason);
}
