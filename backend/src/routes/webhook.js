const router = require('express').Router();
const { chat }               = require('../lib/claude');
const { sendTextWithTyping } = require('../lib/evolution');
const db                     = require('../lib/db');

const inFlight = new Set();

router.post('/evolution', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  
  // LOG COMPLETO para debug
  console.log('[WH RAW] event:', body.event, '| keys:', Object.keys(body));
  if (body.data) console.log('[WH DATA] keys:', Object.keys(body.data));

  const event = (body.event || '').toLowerCase().replace(/\./g, '_');
  if (event === 'messages_upsert') await handleMsg(body.data);
});

async function handleMsg(data) {
  try {
    console.log('[WH MSG] Processing message...');
    if (data?.key?.fromMe) { console.log('[WH MSG] Skipping fromMe'); return; }
    if (data?.key?.remoteJid?.includes('@g.us')) { console.log('[WH MSG] Skipping group'); return; }
    const waPhone = data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!waPhone) { console.log('[WH MSG] No phone'); return; }
    const text = data?.message?.conversation
      || data?.message?.extendedTextMessage?.text
      || data?.message?.imageMessage?.caption || null;
    if (!text) { console.log('[WH MSG] No text, message type:', Object.keys(data?.message || {})); return; }
    console.log(`[WH MSG] From ${waPhone}: "${text}"`);
    if (inFlight.has(waPhone)) return;
    inFlight.add(waPhone);
    try {
      const customer = await db.getOrCreateCustomer(waPhone, data?.pushName || waPhone);
      await db.saveMessage({ customerId: customer.id, direction: 'inbound', channel: 'whatsapp', text, waMessageId: data?.key?.id });
      const [inventory, sales, settings, history] = await Promise.all([
        db.getInventory(), db.getRecentSales(7), db.getSettings(),
        db.getConversationHistory(customer.id, 10),
      ]);
      const reply = await chat({ messages: [...history, { role: 'user', content: text }], mode: 'customer', inventory, sales, settings });
      await sendTextWithTyping(waPhone, reply);
      await db.saveMessage({ customerId: customer.id, direction: 'outbound', channel: 'whatsapp', text: reply });
      console.log(`[WH OK] ${waPhone}: "${text.slice(0,40)}" → "${reply.slice(0,40)}"`);
    } finally { inFlight.delete(waPhone); }
  } catch(e) { console.error('[WH ERROR]', e.message); }
}

module.exports = router;
