export const config = {
  runtime: 'edge'
};

const ALLOWED_MODES = new Set(['figs', 'parts']);

function corsHeaders(origin = '*'): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type, accept'
  };
}

/**
 * Proxy Edge ligero para reenviar capturas multipart (`query_image`) desde HTTPS móvil
 * hacia la API pública de Brickognize (/predict/figs/ o /predict/parts/).
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders(), 'content-type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const url = new URL(req.url);
    const requestedMode = url.searchParams.get('mode') || 'figs';
    const mode = ALLOWED_MODES.has(requestedMode) ? requestedMode : 'figs';

    const formData = await req.formData();
    const queryImage = formData.get('query_image');
    if (!(queryImage instanceof Blob)) {
      return new Response(
        JSON.stringify({ error: 'Missing required form-data field: query_image' }),
        {
          status: 400,
          headers: { ...corsHeaders(), 'content-type': 'application/json; charset=utf-8' }
        }
      );
    }

    const upstreamForm = new FormData();
    upstreamForm.append('query_image', queryImage, 'minifig_scan.webp');

    const upstreamRes = await fetch(`https://api.brickognize.com/predict/${mode}/`, {
      method: 'POST',
      body: upstreamForm
    });

    const bodyText = await upstreamRes.text();
    return new Response(bodyText, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders(),
        'content-type': upstreamRes.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream Brickognize proxy error';
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { ...corsHeaders(), 'content-type': 'application/json; charset=utf-8' }
    });
  }
}
