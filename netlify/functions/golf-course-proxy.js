// Serverless proxy for GolfCourseAPI — keeps the API key server-side and
// sidesteps browser CORS. The client always calls this function.
//
// Set GOLF_API_KEY (NOT VITE_-prefixed) in the environment:
//   - locally: in .env.local (loaded by `netlify dev`)
//   - production: in the Netlify site environment variables

const BASE = 'https://api.golfcourseapi.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

exports.handler = async (event) => {
  // Preflight.
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' }
  }

  const { endpoint, search_query, id } = event.queryStringParameters || {}
  const key = process.env.GOLF_API_KEY

  if (!key) {
    return json(500, { error: 'GOLF_API_KEY not configured on the server' })
  }

  let url
  if (endpoint === 'search') {
    url = `${BASE}/v1/search?search_query=${encodeURIComponent(search_query || '')}`
  } else if (endpoint === 'course') {
    url = `${BASE}/v1/courses/${encodeURIComponent(id || '')}`
  } else {
    return json(400, { error: 'Unknown endpoint' })
  }

  try {
    const res = await fetch(url, { headers: { Authorization: `Key ${key}` } })
    const body = await res.text()
    return {
      statusCode: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body,
    }
  } catch {
    return json(502, { error: 'Proxy request failed' })
  }
}

function json(statusCode, obj) {
  return {
    statusCode,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(obj),
  }
}
