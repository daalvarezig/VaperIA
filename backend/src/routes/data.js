/* backend/src/routes/data.js */
const router = require('express').Router();
const db = require('../lib/db');
const supabase = require('../lib/supabase');
const PID = () => process.env.PROFILE_ID;

router.get('/inventory', async (_, res) => {
  try { res.json({ inventory: await db.getInventory() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/sales', async (_, res) => {
  try { res.json({ sales: await db.getRecentSales(60) }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/settings', async (_, res) => {
  try { res.json({ settings: await db.getSettings() }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/customers', async (_, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*')
      .eq('profile_id', PID()).order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ customers: data || [] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/settings', async (req, res) => {
  try {
    const { error } = await supabase.from('settings').update(req.body).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/sales', async (req, res) => {
  const { lines, customer } = req.body;
  if (!lines || !Array.isArray(lines) || lines.length === 0)
    return res.status(400).json({ error: 'lines[] requerido' });
  try {
    const total_amount = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const total_cost   = lines.reduce((a, l) => a + l.qty * l.model.cost, 0);
    const total_margin = total_amount - total_cost;

    let customer_id = null;
    let customer_name = null;
    if (customer) {
      if (customer.id) {
        customer_id = customer.id;
        customer_name = customer.name;
      } else if (customer.name) {
        const { data: newCust } = await supabase.from('customers').insert({
          profile_id: PID(), display_name: customer.name,
          wa_phone: customer.phone || null, notes: customer.notes || null,
        }).select().single();
        customer_id = newCust?.id;
        customer_name = customer.name;
      }
    }

    const { data: sale, error: saleErr } = await supabase.from('sales')
      .insert({ profile_id: PID(), source: 'manual', status: 'confirmed', total_amount, total_cost, total_margin, customer_id, customer_name })
      .select().single();
    if (saleErr) throw saleErr;

    for (const l of lines) {
      await supabase.from('sale_items').insert({ 
        sale_id: sale.id, model_id: l.model.id, flavor_id: l.flavor.flavor_id, 
        qty: l.qty, unit_price: l.price, unit_cost: l.model.cost 
      });
      // Actualizar inventario
      const { data: inv } = await supabase.from('inventory').select('stock_units')
        .eq('profile_id', PID()).eq('model_id', l.model.id).eq('flavor_id', l.flavor.flavor_id).single();
      if (inv) await supabase.from('inventory').update({
        stock_units: Math.max(0, inv.stock_units - l.qty), updated_at: new Date().toISOString()
      }).eq('profile_id', PID()).eq('model_id', l.model.id).eq('flavor_id', l.flavor.flavor_id);
    }
    res.json({ ok: true, sale_id: sale.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/restock', async (req, res) => {
  try {
    const result = await db.restock(req.body);
    res.json(result);
  } catch (e) {
    console.error('Error en restock:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await supabase.from('sale_items').delete().eq('sale_id', id);
    await supabase.from('sales').delete().eq('id', id).eq('profile_id', PID());
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
