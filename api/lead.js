const ALLOWED_ORIGINS = [
  'https://claudecodedegraca.vercel.app',
  'http://localhost:8080',
  'http://localhost:3000',
];

// Basic in-memory rate limit (per serverless instance)
const rateMap = new Map();
const RATE_LIMIT = 5;       // max requests
const RATE_WINDOW = 60000;  // per 60s

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

export default async function handler(req, res) {
  // CORS
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' });
  }

  // Validate env
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  // Parse & validate body
  const { email, whatsapp, modelo } = req.body || {};

  if (!email || typeof email !== 'string' || !email.includes('@') || email.length > 254) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  const cleanWpp = (whatsapp || '').replace(/\D/g, '');
  if (cleanWpp.length < 10 || cleanWpp.length > 15) {
    return res.status(400).json({ error: 'WhatsApp inválido' });
  }

  const cleanModelo = (modelo || '').slice(0, 100);

  // Insert into Supabase
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        whatsapp: cleanWpp,
        modelo: cleanModelo,
        origem: 'claudecodedegraca',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Supabase error:', text);
      return res.status(502).json({ error: 'Erro ao salvar lead' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(502).json({ error: 'Erro de conexão' });
  }
}
