const router = require('express').Router();
const { chat }               = require('../lib/claude');
const { sendTextWithTyping } = require('../lib/evolution');
const db                     = require('../lib/db');
const inFlight = new Set();

router.post('/evolution', async (req, res) => {
  res.sendStatus(200);
  const body = req.body;
  const event = (body.event || '').toLowerCase().replace(/\./g, '_');
  if (event === 'messages_upsert') await handleMsg(body.data);
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
      const settings = await db.getSettings();
      if (settings.ai_enabled === false) {
        console.log('[WH] IA desactivada, ignorando ' + waPhone);
        return;
      }
      console.log('[WH MSG] From ' + waPhone + ': "' + text + '"');
      const customer = await db.getOrCreateCustomer(waPhone, data?.pushName || waPhone);
      await db.saveMessage({ customerId: customer.id, direction: 'inbound', channel: 'whatsapp', text, waMessageId: data?.key?.id });
      const [inventory, sales, history] = await Promise.all([
        db.getInventory(), db.getRecentSales(7),
        db.getConversationHistory(customer.id, 10),
      ]);
      const reply = await chat({ messages: [...history, { role: 'user', content: text }], mode: 'customer', inventory, sales, settings });
      await sendTextWithTyping(waPhone, reply);
      await db.saveMessage({ customerId: customer.id, direction: 'outbound', channel: 'whatsapp', text: reply });
      console.log('[WH OK] ' + waPhone + ': replied');
    } finally { inFlight.delete(waPhone); }
  } catch(e) { console.error('[WH ERROR]', e.message); }
}
module.exports = router;
