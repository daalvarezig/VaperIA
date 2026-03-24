const router = require('express').Router();
const evo    = require('../lib/evolution');

router.get('/status', async (_, res) => {
  try { res.json(await evo.getInstanceStatus()); } catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/qr', async (_, res) => {
  try { res.json(await evo.getQRCode()); } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/create', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: 'webhookUrl required' });
  try { res.json(await evo.createInstance(webhookUrl)); } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/send', async (req, res) => {
  const { number, text } = req.body;
  if (!number || !text) return res.status(400).json({ error: 'number and text required' });
  try { res.json(await evo.sendText(number, text)); } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
