"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(body !== undefined ? { "idempotency-key": key ?? crypto.randomUUID() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new RequestError(res.status, data.error ?? "Request failed");
  return data;
}
export function useResource<T>(guildId: string, resource: string, enabled = true) {
  return useQuery({
    queryKey: ["guild", guildId, resource],
    queryFn: () => request<T>(`guilds/${guildId}/${resource}`),
    enabled: !!guildId && enabled,
    staleTime: 15000,
    retry: (count, error) =>
      !(error instanceof RequestError && [401, 403, 404].includes(error.status)) && count < 1,
  });
}
export function useAction<T = unknown>(guildId: string, resource: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => request<T>(`guilds/${guildId}/${resource}`, body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["guild", guildId] }),
  });
}
