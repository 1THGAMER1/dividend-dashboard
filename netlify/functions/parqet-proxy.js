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
  const path = url.pathname.replace('/.netlify/functions/parqet-proxy', '')

  let targetUrl
  if (path === '/token' || path === '' || url.pathname === '/oauth/token') {
    targetUrl = 'https://connect.parqet.com/oauth2/token'
  } else {
    targetUrl = `https://connect.parqet.com${path}${url.search}`
  }

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('origin')

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined,
    })

    const responseHeaders = new Headers(response.headers)
    Object.entries(CORS_HEADERS).forEach(([k, v]) => responseHeaders.set(k, v))

    return new Response(response.body, {
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
