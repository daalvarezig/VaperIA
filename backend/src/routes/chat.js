const router = require('express').Router();
const { chat } = require('../lib/claude');
const db       = require('../lib/db');

router.post('/', async (req, res) => {
  try {
    const { messages, mode = 'customer' } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages[] required' });
    const [inventory, sales, settings] = await Promise.all([
      db.getInventory(), db.getRecentSales(7), db.getSettings(),
    ]);
    const reply = await chat({ messages, mode, inventory, sales, settings });
    res.json({ reply });
  } catch(e) {
    console.error('[CHAT]', e.message);
    res.status(500).json({ error: 'Error al procesar' });
  }
});

module.exports = router;
