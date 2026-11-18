export const config = {
  runtime: 'edge'
};

const CORS_HEADERS: HeadersInit = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept'
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const rebrickable = Boolean(process.env.REBRICKABLE_API_KEY);
  const brickowl = Boolean(process.env.BRICKOWL_API_KEY);
  const ebay = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

  return new Response(
    JSON.stringify({
      ok: true,
      status: 'ok',
      runtime: 'vercel-edge',
      service: 'BrickLens PWA Proxy v2',
      providers: {
        brickognize: true,
        rebrickable,
        brickowl,
        ebay
      },
      timestamp: new Date().toISOString()
    }),
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}
