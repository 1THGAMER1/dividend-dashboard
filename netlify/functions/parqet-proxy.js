const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export default async (request, context) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  const url = new URL(request.url)
  let targetUrl

  if (url.pathname === '/oauth/token') {
    // Token endpoint
    targetUrl = 'https://connect.parqet.com/oauth2/token'
  } else if (url.pathname.startsWith('/api/')) {
    // Strip /api prefix: /api/portfolios -> /portfolios
    const stripped = url.pathname.replace('/api', '')
    targetUrl = `https://connect.parqet.com${stripped}${url.search}`
  } else {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
    Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v))

    return new Response(body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: ['/oauth/token', '/api/*'],
}
