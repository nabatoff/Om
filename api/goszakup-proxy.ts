const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const ORIGIN = 'https://goszakup.gov.kz';

function isAllowedPath(pathWithQuery: string): boolean {
  try {
    const u = new URL(pathWithQuery, ORIGIN);
    if (u.origin !== ORIGIN) return false;
    if (u.pathname === '/ru/registry/contract') return true;
    if (/^\/ru\/egzcontract\/cpublic\/show\/\d+$/.test(u.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

export const config = {
  runtime: 'edge',
  maxDuration: 60,
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('path') ?? '';
  if (!path || !isAllowedPath(path)) {
    return Response.json({ error: 'path not allowed' }, { status: 400 });
  }

  const target = new URL(path, ORIGIN);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 45_000);
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'ru-RU,ru;q=0.9',
        Referer: `${ORIGIN}/ru/registry/contract`,
      },
      signal: ac.signal,
      redirect: 'follow',
    });
    const html = await upstream.text();
    return new Response(html, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
