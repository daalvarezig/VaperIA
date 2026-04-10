/* backend/src/routes/data.js - VERSIÓN FINAL Y COMPLETA */
const router = require('express').Router();
const db = require('../lib/db');
const supabase = require('../lib/supabase');
const PID = () => process.env.PROFILE_ID;

// 1. OBTENER INVENTARIO
router.get('/inventory', async (_, res) => {
  try { 
    res.json({ inventory: await db.getInventory() }); 
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 2. AÑADIR/ACTUALIZAR STOCK (RUTA RECUPERADA)
router.post('/restock', async (req, res) => {
  try {
    const { model_id, flavor_id, qty } = req.body;
    const { data: inv, error: getErr } = await supabase.from('inventory')
      .select('stock_units').eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id).single();
    
    if (getErr && getErr.code !== 'PGRST116') throw getErr;

    if (inv) {
      await supabase.from('inventory').update({ 
        stock_units: (inv.stock_units || 0) + Number(qty), 
        updated_at: new Date().toISOString() 
      }).eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id);
    } else {
      await supabase.from('inventory').insert({ 
        profile_id: PID(), model_id, flavor_id, stock_units: Number(qty) 
      });
    }
    res.json({ ok: true });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 3. OBTENER VENTAS
router.get('/sales', async (_, res) => {
  try { 
    res.json({ sales: await db.getRecentSales(60) }); 
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 4. OBTENER CLIENTES (Fix error 500)
router.get('/customers', async (_, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*')
      .eq('profile_id', PID()).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ customers: data || [] });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 5. REGISTRAR VENTA (Con fecha personalizada)
router.post('/sales', async (req, res) => {
  const { lines, customer, created_at } = req.body;
  if (!lines || !Array.isArray(lines) || lines.length === 0)
    return res.status(400).json({ error: 'lines[] requerido' });
  try {
    const total_amount = lines.reduce((a, l) => a + l.qty * l.price, 0);
    const total_cost   = lines.reduce((a, l) => a + l.qty * l.model.cost, 0);
    const total_margin = total_amount - total_cost;
    let customer_id = null;

    if (customer) {
      if (customer.id) { customer_id = customer.id; } 
      else if (customer.name) {
        const { data: newCust } = await supabase.from('customers').upsert({
          profile_id: PID(), display_name: customer.name,
          wa_phone: customer.phone || null, notes: customer.notes || null,
        }, { onConflict: 'profile_id, wa_phone' }).select().single();
        customer_id = newCust?.id;
      }
    }

    const { data: sale, error: saleErr } = await supabase.from('sales')
      .insert({ 
        profile_id: PID(), source: 'manual', status: 'confirmed', 
        total_amount, total_cost, total_margin, customer_id,
        created_at: created_at || new Date().toISOString() 
      })
      .select().single();
    if (saleErr) throw saleErr;

    for (const l of lines) {
      await supabase.from('sale_items').insert({ 
        sale_id: sale.id, model_id: l.model.id, flavor_id: l.flavor.flavor_id, 
        qty: l.qty, unit_price: l.price, unit_cost: l.model.cost 
      });
      const { data: inv } = await supabase.from('inventory').select('stock_units')
        .eq('profile_id', PID()).eq('model_id', l.model.id).eq('flavor_id', l.flavor.flavor_id).single();
      if (inv) await supabase.from('inventory').update({
        stock_units: Math.max(0, inv.stock_units - l.qty), updated_at: new Date().toISOString()
      }).eq('profile_id', PID()).eq('model_id', l.model.id).eq('flavor_id', l.flavor.flavor_id);
    }
    res.json({ ok: true, sale_id: sale.id });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 5b. CREAR CLIENTE MANUAL
router.post('/customers', async (req, res) => {
  const { name, phone, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'name requerido' });
  try {
    const { data, error } = await supabase.from('customers').insert({
      profile_id: PID(), display_name: name,
      wa_phone: phone || null, notes: notes || null,
    }).select().single();
    if (error) throw error;
    res.json({ ok: true, customer: data });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// 5c. EDITAR CLIENTE
router.patch('/customers/:id', async (req, res) => {
  const { name, phone, notes } = req.body;
  try {
    const update = {};
    if (name !== undefined) update.display_name = name;
    if (phone !== undefined) update.wa_phone = phone || null;
    if (notes !== undefined) update.notes = notes || null;
    const { error } = await supabase.from('customers').update(update)
      .eq('id', req.params.id).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 5d. BORRAR CLIENTE
router.delete('/customers/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('customers').delete()
      .eq('id', req.params.id).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// 6. EDITAR CLIENTE EN VENTA
router.patch('/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id } = req.body;
    const { error } = await supabase.from('sales').update({ customer_id }).eq('id', id).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 7. BORRAR VENTA (Y DEVOLVER STOCK)
router.delete('/sales/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: items } = await supabase.from('sale_items').select('*').eq('sale_id', id);
    if (items) {
      for (const item of items) {
        const { data: inv } = await supabase.from('inventory').select('stock_units').eq('profile_id', PID()).eq('model_id', item.model_id).eq('flavor_id', item.flavor_id).single();
        if (inv) {
          await supabase.from('inventory').update({ 
            stock_units: inv.stock_units + item.qty 
          }).eq('profile_id', PID()).eq('model_id', item.model_id).eq('flavor_id', item.flavor_id);
        }
      }
    }
    const { error } = await supabase.from('sales').delete().eq('id', id).eq('profile_id', PID());
    if (error) throw error;
    res.json({ ok: true });
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 8. OBTENER AJUSTES
router.get('/settings', async (_, res) => {
  try { 
    res.json({ settings: await db.getSettings() }); 
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

// 9. GUARDAR AJUSTES
router.patch('/settings', async (req, res) => {
  try { 
    await supabase.from('settings').update(req.body).eq('profile_id', PID()); 
    res.json({ ok: true }); 
  } catch(e) { 
    res.status(500).json({ error: e.message }); 
  }
});

module.exports = router;
