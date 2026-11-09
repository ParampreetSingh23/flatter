export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiFail extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}) {
    super(message);
  }
}

// Used from server components and the browser alike; the caller supplies the Clerk session token.
export async function api<T>(token: string | null, method: string, path: string, body?: unknown): Promise<T> {
  if (!token) throw new ApiFail(401, "UNAUTHENTICATED", "Your session has expired.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && { "Content-Type": "application/json" }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiFail(0, "NETWORK", "Can't reach Flatter right now. Check your connection and retry.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error ?? {};
    throw new ApiFail(res.status, e.code ?? "ERROR", e.message ?? "Something went wrong.", e.fields);
  }
  return json as T;
}
