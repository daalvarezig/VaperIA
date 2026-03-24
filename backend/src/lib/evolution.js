const EVO_URL  = process.env.EVOLUTION_URL || 'http://evolution:8080';
const EVO_KEY  = process.env.EVOLUTION_API_KEY;
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'vaperia';

async function evoFetch(path, opts = {}) {
  const res = await fetch(`${EVO_URL}${path}`, {
    ...opts,
    headers: { 'apikey': EVO_KEY, 'Content-Type': 'application/json', ...(opts.headers||{}) },
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Evolution ${res.status}: ${t}`); }
  return res.json().catch(() => ({}));
}

async function getInstanceStatus() { return evoFetch(`/instance/fetchInstances?instanceName=${INSTANCE}`); }
async function getQRCode()         { return evoFetch(`/instance/connect/${INSTANCE}`); }

async function createInstance(webhookUrl) {
  return evoFetch('/instance/create', { method: 'POST', body: JSON.stringify({
    instanceName: INSTANCE, qrcode: true, integration: 'WHATSAPP-BAILEYS',
    webhook: { url: webhookUrl, byEvents: false, base64: false,
      events: ['MESSAGES_UPSERT','CONNECTION_UPDATE','QRCODE_UPDATED'] }
  })});
}

async function sendText(number, text) {
  return evoFetch(`/message/sendText/${INSTANCE}`, { method: 'POST',
    body: JSON.stringify({ number: number.replace(/\D/g,''), text, delay: 1200 }) });
}

async function sendTextWithTyping(number, text) {
  const n = number.replace(/\D/g,'');
  try { await evoFetch(`/chat/updatePresence/${INSTANCE}`, { method:'POST',
    body: JSON.stringify({ number: n, presence: 'composing' }) }); } catch {}
  await new Promise(r => setTimeout(r, Math.min(500 + text.length * 20, 3000)));
  return sendText(n, text);
}

async function setWebhook(url) {
  return evoFetch(`/webhook/set/${INSTANCE}`, { method: 'POST',
    body: JSON.stringify({ url, byEvents: false, base64: false,
      events: ['MESSAGES_UPSERT','CONNECTION_UPDATE','QRCODE_UPDATED'] }) });
}

module.exports = { getInstanceStatus, getQRCode, createInstance, sendText, sendTextWithTyping, setWebhook, INSTANCE };
