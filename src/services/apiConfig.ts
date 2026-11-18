import type { ApiProvidersStatus } from '../types/minifig';

let cachedProxyBaseUrl = '';
let cachedStatus: ApiProvidersStatus | null = null;
let lastProbeTs = 0;

export function normalizeProxyBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function setRuntimeProxyBaseUrl(raw: string): void {
  const next = normalizeProxyBaseUrl(raw);
  if (next !== cachedProxyBaseUrl) {
    cachedProxyBaseUrl = next;
    cachedStatus = null;
    lastProbeTs = 0;
  }
}

export function getRuntimeProxyBaseUrl(): string {
  return cachedProxyBaseUrl;
}

/**
 * Devuelve las URLs candidatas para un endpoint proxy (Node/Vercel y fallback PHP en Hostinger).
 */
export function buildProxyEndpoints(pathWithoutApiPrefix: string, queryString = ''): string[] {
  const base = cachedProxyBaseUrl;
  const cleanPath = pathWithoutApiPrefix.replace(/^\/+/, '');
  const qs = queryString ? `?${queryString.replace(/^\?/, '')}` : '';
  return [
    `${base}/api/${cleanPath}${qs}`,
    `${base}/api/${cleanPath}.php${qs}`
  ];
}

export async function fetchProxyJson<T>(
  pathWithoutApiPrefix: string,
  queryString = '',
  timeoutMs = 9000
): Promise<{ ok: boolean; data: T | null; endpointUsed?: string }> {
  const urls = buildProxyEndpoints(pathWithoutApiPrefix, queryString);
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timer);
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || !contentType.includes('application/json')) {
        continue;
      }
      const data = (await res.json()) as T;
      return { ok: true, data, endpointUsed: url };
    } catch {
      clearTimeout(timer);
    }
  }
  return { ok: false, data: null };
}

export async function probeApiProviders(force = false): Promise<ApiProvidersStatus> {
  if (!force && cachedStatus && Date.now() - lastProbeTs < 60_000) {
    return cachedStatus;
  }

  const nowIso = new Date().toISOString();
  const { ok, data, endpointUsed } = await fetchProxyJson<{
    ok?: boolean;
    status?: string;
    runtime?: string;
    providers?: {
      brickognize?: boolean | string;
      rebrickable?: boolean | string;
      brickowl?: boolean | string;
      ebay?: boolean | string;
      ebay_browse?: string;
    };
  }>('health', '', 5000);

  if (!ok || !data) {
    cachedStatus = {
      reachable: false,
      runtime: 'static-client',
      brickognize: true,
      rebrickable: false,
      brickowl: false,
      ebay: false,
      checkedAtIso: nowIso
    };
    lastProbeTs = Date.now();
    return cachedStatus;
  }

  const p = data.providers || {};
  cachedStatus = {
    reachable: true,
    runtime: data.runtime || 'proxy',
    brickognize: true,
    rebrickable: p.rebrickable === true || p.rebrickable === 'configured',
    brickowl: p.brickowl === true || p.brickowl === 'configured',
    ebay: p.ebay === true || p.ebay === 'configured' || p.ebay_browse === 'configured',
    checkedAtIso: nowIso,
    endpointUsed
  };
  lastProbeTs = Date.now();
  return cachedStatus;
}

export function getCachedApiProvidersStatus(): ApiProvidersStatus | null {
  return cachedStatus;
}
