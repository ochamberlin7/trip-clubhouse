// Serverless vision extraction for the "scan a scorecard" feature. Calls the
// Claude API (vision + forced tool use) server-side so ANTHROPIC_API_KEY never
// reaches the browser. Returns ONLY the structured extraction JSON — it never
// writes to the database; the client's review screen gates the real save.
//
// Set ANTHROPIC_API_KEY (NOT VITE_-prefixed) in the environment:
//   - locally: .env.local (loaded by `netlify dev` / `npm run dev:proxy`)
//   - production: Netlify site environment variables
//
// NOTE: like golf-course-proxy, this endpoint is not itself role-authenticated —
// the scan UI is gated to commissioners client-side (the Edit Course modal is
// commissioner-only). Server-side role enforcement (verifying the Supabase JWT)
// is a follow-up if the endpoint is ever exposed outside that flow.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_IMAGES = 2
const MAX_BYTES = 10 * 1024 * 1024 // 10MB per image (decoded)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

// Forced-tool schema — the model must return exactly this shape (spec §5).
const extractionTool = {
  name: 'extract_scorecard',
  description: 'Extract structured golf course data from one or more scorecard images',
  input_schema: {
    type: 'object',
    properties: {
      course_name: { type: 'string', description: 'Course name if visible, else null' },
      location: { type: 'string', description: 'City/state if visible, else null' },
      handicap_par: { type: 'integer', description: 'A SEPARATE 18-hole-equivalent "handicap par" / "rating par" if the card prints one distinct from the sum of hole pars (common on short/novelty/non-18-hole courses, used in the course handicap formula). Null if the card only shows the normal par.' },
      holes: {
        type: 'array',
        description: 'One entry per hole actually present on the card — do not pad or assume 18. A 9-hole course returns 9 entries.',
        items: {
          type: 'object',
          properties: {
            hole_number: { type: 'integer' },
            par: { type: 'integer' },
            stroke_index: { type: 'integer', description: 'Null if not legible' },
          },
          required: ['hole_number'],
        },
      },
      tees: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: "Tee name/color, e.g. 'Blue'" },
            rating: { type: 'number', description: 'Null if not legible' },
            slope: { type: 'integer', description: 'Null if not legible' },
            yardages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  hole_number: { type: 'integer' },
                  yardage: { type: 'integer', description: 'Null if not legible' },
                },
              },
            },
          },
        },
      },
      low_confidence_fields: {
        type: 'array',
        items: { type: 'string' },
        description: "Field identifiers (e.g. 'hole_7.stroke_index', 'tee_White.slope') the model extracted but isn't fully confident about.",
      },
    },
    required: ['holes', 'tees'],
  },
}

const PROMPT = [
  'Extract the golf course data from the attached scorecard image(s) using the extract_scorecard tool.',
  '',
  '- Read every visible number carefully. Return null (never guess) for anything illegible, glared-out, cropped, or ambiguous.',
  '- Populate low_confidence_fields for anything you extracted but are not fully certain about (smudged ink, unusual layout, partially cropped). Use identifiers like "hole_7.stroke_index" or "tee_White.slope".',
  "- Read each hole's par from its own column in the Par row (par is almost always 3, 4, or 5 — a 6 is rare and a 1, 2, 7+ is essentially never a hole par). Do not confuse the par row with the handicap/stroke-index row or a yardage row.",
  '- If the card prints a total/out/in par, sum the hole pars you read and check they match that printed total; if they do not, re-read the par row before answering, and flag any par you are unsure of in low_confidence_fields (e.g. "hole_5.par").',
  '- Count holes from what is actually on the card — do NOT assume or default to 18. If the card shows 9 hole rows, return exactly 9 entries in holes.',
  '- If two images are provided, merge them into one combined hole list. If their combined hole numbers still total fewer than 18 (e.g. two 6-hole sections), that is fine — trust what is on the cards.',
  '- Most cards have ONE par (the sum of the hole pars). Only if the card ALSO prints a separate, larger "handicap par" / "rating par" (an 18-hole-equivalent par for the course handicap formula, distinct from the total of the hole pars — common on short or non-18-hole courses) return it as handicap_par; otherwise leave handicap_par null.',
  '- If course name or location are not visible, leave those fields null rather than inventing them.',
].join('\n')

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' })

  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return json(500, { error: 'ANTHROPIC_API_KEY not configured on the server' })

  let payload
  try { payload = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'Invalid JSON body' }) }

  const images = Array.isArray(payload.images) ? payload.images : []
  if (images.length === 0) return json(400, { error: 'No images provided' })
  if (images.length > MAX_IMAGES) return json(400, { error: `At most ${MAX_IMAGES} images` })
  for (const img of images) {
    if (!img || typeof img.data !== 'string' || !ALLOWED_TYPES.includes(img.media_type)) {
      return json(400, { error: 'Each image must be base64 JPEG/PNG/WEBP/GIF' })
    }
    if (img.data.length * 0.75 > MAX_BYTES) return json(413, { error: 'Image too large (max 10MB)' })
  }

  const content = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.media_type, data: img.data },
  }))
  content.push({ type: 'text', text: PROMPT })

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 8192,
        tools: [extractionTool],
        tool_choice: { type: 'tool', name: 'extract_scorecard' },
        messages: [{ role: 'user', content }],
      }),
    })
    const data = await res.json()
    if (!res.ok) return json(res.status, { error: data?.error?.message || 'Extraction failed' })
    const block = (data.content || []).find(b => b.type === 'tool_use' && b.name === 'extract_scorecard')
    if (!block || !block.input) return json(502, { error: 'No structured data returned from the image' })
    return json(200, block.input)
  } catch {
    return json(502, { error: 'Extraction request failed' })
  }
}

function json(statusCode, obj) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(obj) }
}
