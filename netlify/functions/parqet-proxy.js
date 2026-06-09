// Erlaubte Origin – passe ggf. auf deine Netlify-URL an
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dividend-dashboard.netlify.app'

function corsHeaders(requestOrigin) {
  // Im Entwicklungsmodus (localhost) alles erlauben, sonst nur ALLOWED_ORIGIN
  const isDev = requestOrigin && (
    requestOrigin.startsWith('http://localhost') ||
    requestOrigin.startsWith('http://127.0.0.1')
  )
  const origin = isDev ? requestOrigin : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  }
}

export default async (request, context) => {
  const requestOrigin = request.headers.get('origin') || ''
  const CORS = corsHeaders(requestOrigin)

  // Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  const url = new URL(request.url)
  let targetUrl

  if (url.pathname === '/oauth/token') {
    // Token-Endpoint: kein Bearer erforderlich (PKCE-Flow)
    targetUrl = 'https://connect.parqet.com/oauth2/token'
  } else if (url.pathname.startsWith('/api/')) {
    // Alle API-Calls erfordern ein gültiges Bearer-Token
    const authorization = request.headers.get('authorization') || ''
    if (!authorization.startsWith('Bearer ') || authorization.length < 20) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    const stripped = url.pathname.replace('/api', '')
    targetUrl = `https://connect.parqet.com${stripped}${url.search}`
  } else {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }

  const forwardHeaders = new Headers()
  const contentType   = request.headers.get('content-type')
  const authorization = request.headers.get('authorization')
  if (contentType)   forwardHeaders.set('content-type', contentType)
  if (authorization) forwardHeaders.set('authorization', authorization)

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined,
    })

    const body = await response.text()

    const responseHeaders = new Headers()
    responseHeaders.set('content-type', response.headers.get('content-type') || 'application/json')
    Object.entries(CORS).forEach(([k, v]) => responseHeaders.set(k, v))

    return new Response(body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: ['/oauth/token', '/api/*'],
}
