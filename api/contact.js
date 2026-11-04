// Saves every contact-form lead. Always writes a structured log line (Vercel runtime logs).
// If BLOB_READ_WRITE_TOKEN is set (Vercel Blob store connected), also stores each lead as JSON in Blob.
// If LEAD_WEBHOOK_URL is set, also forwards the lead there (e.g. an email/Slack/Zapier hook).
const clean = (v, n) => String(v || '').trim().slice(0, n);
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  if (b.company_site) return res.status(200).json({ ok: true }); // honeypot
  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    receivedAt: new Date().toISOString(),
    name: clean(b.name, 200), email: clean(b.email, 200),
    phone: clean(b.phone, 50), message: clean(b.message, 5000),
    source: 'datas-army-after-hours contact form'
  };
  if (!lead.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email))
    return res.status(400).json({ error: 'Name and a valid email are required' });
  console.log('NEW_LEAD ' + JSON.stringify(lead));
  const saved = ['log'];
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const r = await fetch('https://blob.vercel-storage.com/leads/' + lead.receivedAt.slice(0, 10) + '-' + lead.id + '.json', {
        method: 'PUT',
        headers: { authorization: 'Bearer ' + process.env.BLOB_READ_WRITE_TOKEN, 'x-api-version': '7', 'x-content-type': 'application/json', 'x-add-random-suffix': '0', 'x-access': 'private' },
        body: JSON.stringify(lead)
      });
      if (r.ok) saved.push('blob'); else console.error('BLOB_SAVE_FAILED', r.status);
    }
    if (process.env.LEAD_WEBHOOK_URL) {
      const r = await fetch(process.env.LEAD_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(lead) });
      if (r.ok) saved.push('webhook'); else console.error('WEBHOOK_FAILED', r.status);
    }
  } catch (e) { console.error('LEAD_FORWARD_ERROR', e.message); }
  return res.status(200).json({ ok: true, id: lead.id, saved });
};
