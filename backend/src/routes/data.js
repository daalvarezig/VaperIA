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
    const updates = req.body;
    const currentSettings = await db.getSettings();
    if (updates.ai_enabled === true && currentSettings.ai_enabled === false) {
      const pausedAt = currentSettings.paused_at;
      if (pausedAt) {
        const { data: missed } = await supabase.from('message_log').select('customer_id')
          .eq('profile_id', PID()).eq('direction', 'inbound').gte('created_at', pausedAt);
        if (missed && missed.length > 0) {
          const ids = [...new Set(missed.map(m => m.customer_id))];
          const { data: customers } = await supabase.from('customers').select('wa_phone').in('id', ids);
          const msg = currentSettings.reactivation_msg || 'Perdona la espera! Ya estoy de vuelta';
          const { sendTextWithTyping } = require('../lib/evolution');
          if (customers) {
            for (const c of customers) {
              try { await sendTextWithTyping(c.wa_phone, msg); } catch(e) { console.error(e.message); }
            }
          }
        }
      }
      updates.paused_at = null;
    }
    if (updates.ai_enabled === false && currentSettings.ai_enabled !== false) {
      updates.paused_at = new Date().toISOString();
    }
    const { error } = await supabase.from('settings').update(updates).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
router.post('/sales', async (req, res) => {
  const { lines } = req.body;
  if (!lines || !Array.isArray(lines) || lines.length === 0)
    return res.status(400).json({ error: 'lines[] requerido' });
  try {
    const total_amount = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const total_cost   = lines.reduce((a, l) => a + l.qty * l.model.cost, 0);
    const total_margin = total_amount - total_cost;
    const { data: sale, error: saleErr } = await supabase.from('sales')
      .insert({ profile_id: PID(), source: 'manual', status: 'confirmed', total_amount, total_cost, total_margin })
      .select().single();
    if (saleErr) throw saleErr;
    for (const l of lines) {
      const model_id = l.model.id, flavor_id = l.flavor.flavor_id, unit_cost = l.model.cost;
      await supabase.from('sale_items').insert({ sale_id: sale.id, model_id, flavor_id, qty: l.qty, unit_price: l.price, unit_cost });
      const { data: inv } = await supabase.from('inventory').select('stock_units')
        .eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id).single();
      if (inv) await supabase.from('inventory').update({
        stock_units: Math.max(0, inv.stock_units - l.qty), updated_at: new Date().toISOString()
      }).eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id);
      await supabase.from('inventory_movements').insert({
        profile_id: PID(), model_id, flavor_id, movement_type: 'sale', qty_delta: -l.qty,
        reference_type: 'sale', reference_id: sale.id
      });
    }
    res.json({ ok: true, sale_id: sale.id, total_amount, total_margin });
  } catch(e) { console.error('[SALE POST]', e.message); res.status(500).json({ error: e.message }); }
});
router.delete('/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: sale } = await supabase.from('sales').select('id').eq('id', id).eq('profile_id', PID()).single();
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    await supabase.from('sale_items').delete().eq('sale_id', id);
    await supabase.from('sales').delete().eq('id', id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
module.exports = router;
