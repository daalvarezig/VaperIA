const router = require('express').Router();
const { chat }               = require('../lib/claude');
const { sendTextWithTyping } = require('../lib/evolution');
const db                     = require('../lib/db');

const inFlight = new Set();

router.post('/evolution', async (req, res) => {
  res.sendStatus(200);
  const { event, data } = req.body;
  if (event === 'messages.upsert') await handleMsg(data);
});

async function handleMsg(data) {
  try {
    if (data?.key?.fromMe) return;
    if (data?.key?.remoteJid?.includes('@g.us')) return;
    const waPhone = data?.key?.remoteJid?.replace('@s.whatsapp.net', '');
    if (!waPhone) return;
    const text = data?.message?.conversation
      || data?.message?.extendedTextMessage?.text
      || data?.message?.imageMessage?.caption || null;
    if (!text) return;
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
      console.log(`[WA] ${waPhone}: "${text.slice(0,40)}" → "${reply.slice(0,40)}"`);
    } finally { inFlight.delete(waPhone); }
  } catch(e) { console.error('[WA error]', e.message); }
}

module.exports = router;
