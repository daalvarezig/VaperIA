const router = require('express').Router();
const db = require('../lib/db');
const supabase = require('../lib/supabase');
const PID = () => process.env.PROFILE_ID;

router.get('/inventory', async (_, res) => {
  try { res.json({ inventory: await db.getInventory() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/sales', async (_, res) => {
  try { res.json({ sales: await db.getRecentSales(30) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.get('/settings', async (_, res) => {
  try { res.json({ settings: await db.getSettings() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
router.patch('/settings', async (req, res) => {
  try {
    const { error } = await supabase.from('settings').update(req.body).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
