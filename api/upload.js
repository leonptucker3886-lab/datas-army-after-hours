// Saves uploaded documents (FAQs, price lists, policies) for the AI receptionist.
// The browser POSTs each file's raw bytes with an x-filename header.
// If BLOB_READ_WRITE_TOKEN is set (shared Vercel Blob store connected), the file is stored as a PRIVATE Blob object.
// Without the token it returns 503 so the page can tell the user storage is not connected yet.
const MAX = 4 * 1024 * 1024; // Vercel function request limit is 4.5 MB
const OK_EXT = /\.(pdf|docx?|txt)$/i;
const TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain' };
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let size = 0;
  req.on('data', (c) => { size += c.length; if (size > MAX) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let name = '';
  try { name = decodeURIComponent(String(req.headers['x-filename'] || '')); } catch { name = ''; }
  name = name.replace(/[^\w.\- ]+/g, '_').trim().slice(0, 120);
  if (!name || !OK_EXT.test(name)) return res.status(400).json({ error: 'Only PDF, DOC, DOCX or TXT files are allowed' });
  let body;
  try { body = await readBody(req); } catch (e) { return res.status(413).json({ error: 'File is over 4 MB' }); }
  if (!body.length) return res.status(400).json({ error: 'File is empty' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const ext = name.split('.').pop().toLowerCase();
  const path = 'uploads/' + new Date().toISOString().slice(0, 10) + '-' + id + '-' + name.replace(/ /g, '_');
  console.log('NEW_UPLOAD ' + JSON.stringify({ id, name, size: body.length }));
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'Storage not connected yet', id, saved: ['log'] });
  try {
    const r = await fetch('https://blob.vercel-storage.com/' + path, {
      method: 'PUT',
      headers: { authorization: 'Bearer ' + process.env.BLOB_READ_WRITE_TOKEN, 'x-api-version': '7', 'x-content-type': TYPES[ext], 'x-add-random-suffix': '0', 'x-access': 'private' },
      body
    });
    if (!r.ok) { console.error('UPLOAD_BLOB_FAILED', r.status); return res.status(502).json({ error: 'Storage save failed', id, saved: ['log'] }); }
  } catch (e) { console.error('UPLOAD_ERROR', e.message); return res.status(502).json({ error: 'Storage save failed', id, saved: ['log'] }); }
  return res.status(200).json({ ok: true, id, name, saved: ['log', 'blob'] });
};
module.exports.config = { api: { bodyParser: false } };
