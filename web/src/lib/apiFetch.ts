const API_URL = import.meta.env.VITE_API_URL || "/api";

let lastRequestTime = 0;
let fastRequestCount = 0;
let lockUntil = 0;

const FAST_THRESHOLD_MS = 2000; // 2 segundos
const MAX_FAST_REQUESTS = 10;
const LOCK_DURATION_MS = 15000; // 15 segundos

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const isDataModifying = ["POST", "PATCH", "PUT", "DELETE"].includes(method);

  if (isDataModifying) {
    const now = Date.now();

    // 1. Verifica se está bloqueado
    if (now < lockUntil) {
      const waitTime = Math.ceil((lockUntil - now) / 1000);
      throw new Error(`Limite de velocidade atingido. Aguarde ${waitTime} segundos.`);
    }

    // 2. Verifica se a requisição atual é "rápida" (menos de 2s desde a última)
    const gap = now - lastRequestTime;

    if (gap < FAST_THRESHOLD_MS) {
      fastRequestCount++;
    } else {
      // Se esperou mais de 2s, reseta o contador de "velocidade"
      fastRequestCount = 0;
    }

    lastRequestTime = now;

    // 3. Se atingiu 10 requisições rápidas, bloqueia por 15s
    if (fastRequestCount >= MAX_FAST_REQUESTS) {
      lockUntil = now + LOCK_DURATION_MS;
      fastRequestCount = 0; // Reseta para a próxima janela após o desbloqueio
      const waitTime = Math.ceil(LOCK_DURATION_MS / 1000);
      throw new Error(`Muitas alterações rápidas. Bloqueado por ${waitTime} segundos para segurança.`);
    }
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "include"
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const message =
      typeof data === "object" &&
        data !== null &&
        "message" in data &&
        typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "Erro na requisição";

    throw new Error(message);
  }

  return data as T;
}
