import { useEffect, useState } from 'react';

export async function request<T>(path: string, dataset: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}${path.includes('?') ? '&' : '?'}dataset=${encodeURIComponent(dataset)}`, {
    ...options, headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(error.message || `데이터를 불러오지 못했습니다. (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function useData<T>(path: string, dataset: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(null); setError(null);
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    request<T>(path, dataset, { signal: controller.signal }).then(value => {
      if (active) setData(value);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error && reason.name !== 'AbortError' ? reason.message : '응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [path, dataset, reloadKey]);
  return { data, error, reload: () => setReloadKey(key => key + 1) };
}
