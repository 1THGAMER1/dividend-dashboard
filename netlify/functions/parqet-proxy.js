export default async (request, context) => {
  const url = new URL(request.url)
  const path = url.pathname.replace('/.netlify/functions/parqet-proxy', '')

  let targetUrl
  if (path === '/token' || path === '') {
    targetUrl = 'https://connect.parqet.com/oauth2/token'
  } else {
    targetUrl = `https://connect.parqet.com${path}${url.search}`
  }

  const headers = new Headers(request.headers)
  headers.delete('host')

  const response = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : undefined,
  })

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  })
}

export const config = {
  path: ['/oauth/token', '/api/*'],
}
