export type AsyncTraceResult = {
  query: string;
  delayMs: number;
  message: string;
};

export async function runAsyncTraceRequest(query: string, delayMs: number): Promise<AsyncTraceResult> {
  const response = await fetch(`/api/mock/async-trace?query=${encodeURIComponent(query)}&delay=${delayMs}`);
  const payload = (await response.json()) as { query?: string; delayMs?: number; message?: string };

  return {
    query: payload.query ?? query,
    delayMs: payload.delayMs ?? delayMs,
    message: payload.message ?? "Async trace response ready",
  };
}
