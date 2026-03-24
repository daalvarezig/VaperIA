const router = require('express').Router();
const db = require('../lib/db');
const supabase = require('../lib/supabase');
const PID = () => process.env.PROFILE_ID;

// GET /data/inventory
router.get('/inventory', async (_, res) => {
  try {
    const inventory = await db.getInventory();
    res.json({ inventory });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /data/sales
router.get('/sales', async (_, res) => {
  try {
    const sales = await db.getRecentSales(30);
    res.json({ sales });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /data/settings
router.get('/settings', async (_, res) => {
  try {
    const settings = await db.getSettings();
    res.json({ settings });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /data/settings
router.patch('/settings', async (req, res) => {
  try {
    const updates = req.body;
    const { error } = await supabase
      .from('settings')
      .update(updates)
      .eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// POST /data/sales — registrar venta manual
router.post('/sales', async (req, res) => {
  const { model_id, flavor_id, model_code, flavor_name, qty, unit_price, unit_cost } = req.body;
  if (!model_id || !flavor_id || !qty || !unit_price) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }
  try {
    const total_amount = qty * unit_price;
    const total_cost   = qty * unit_cost;
    const total_margin = qty * (unit_price - unit_cost);

    // 1. Crear cabecera venta
    const { data: sale, error: saleErr } = await supabase
      .from('sales')
      .insert({ profile_id: PID(), source: 'manual', status: 'confirmed', total_amount, total_cost, total_margin })
      .select().single();
    if (saleErr) throw saleErr;

    // 2. Crear línea venta
    const { error: itemErr } = await supabase.from('sale_items').insert({
      sale_id: sale.id, model_id, flavor_id, qty, unit_price, unit_cost,
    });
    if (itemErr) throw itemErr;

    // 3. Descontar stock
    const { data: inv } = await supabase.from('inventory').select('stock_units')
      .eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id).single();
    if (inv) {
      await supabase.from('inventory').update({
        stock_units: Math.max(0, inv.stock_units - qty),
        updated_at: new Date().toISOString(),
      }).eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id);
    }

    // 4. Log movimiento
    await supabase.from('inventory_movements').insert({
      profile_id: PID(), model_id, flavor_id,
      movement_type: 'sale', qty_delta: -qty,
      reference_type: 'sale', reference_id: sale.id,
    });

    res.json({ ok: true, sale_id: sale.id, total_amount, total_margin });
  } catch(e) {
    console.error('[SALE POST]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// DELETE /data/sales/today — borrar ventas del día actual
router.delete('/sales/today', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Get today's sale IDs
    const { data: todaySales } = await supabase
      .from('sales')
      .select('id')
      .eq('profile_id', PID())
      .gte('created_at', today + 'T00:00:00.000Z')
      .lte('created_at', today + 'T23:59:59.999Z');

    if (todaySales && todaySales.length > 0) {
      const ids = todaySales.map(s => s.id);
      await supabase.from('sale_items').delete().in('sale_id', ids);
      await supabase.from('sales').delete().in('id', ids);
    }
    res.json({ ok: true, deleted: todaySales?.length || 0 });
  } catch(e) {
    console.error('[DELETE SALES]', e.message);
    res.status(500).json({ error: e.message });
  }
});


// DELETE /data/sales/:id — borrar una venta específica
router.delete('/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Verify it belongs to this profile
    const { data: sale } = await supabase.from('sales').select('id').eq('id', id).eq('profile_id', PID()).single();
    if (!sale) return res.status(404).json({ error: 'Venta no encontrada' });
    await supabase.from('sale_items').delete().eq('sale_id', id);
    await supabase.from('sales').delete().eq('id', id);
    res.json({ ok: true });
  } catch(e) {
    console.error('[DELETE SALE]', e.message);
    res.status(500).json({ error: e.message });
  }
});
