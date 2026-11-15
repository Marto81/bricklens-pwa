export const config = {
  runtime: 'edge'
};

export default async function handler(): Promise<Response> {
  const hasBricklinkCreds = Boolean(
    process.env.BRICKLINK_CONSUMER_KEY && process.env.BRICKLINK_TOKEN_VALUE
  );
  const hasEbayCreds = Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);

  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'BrickLens PWA Proxy',
      providers: {
        brickognize: 'ready',
        bricklink_oauth: hasBricklinkCreds ? 'configured' : 'catalog_fallback',
        ebay_browse: hasEbayCreds ? 'configured' : 'catalog_fallback'
      },
      timestamp: new Date().toISOString()
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    }
  );
}
