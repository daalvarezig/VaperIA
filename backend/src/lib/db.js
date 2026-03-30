/* backend/src/lib/db.js */
const supabase = require('./supabase');
const PID = () => process.env.PROFILE_ID;

async function getInventory() {
  const { data, error } = await supabase.from('inventory')
    .select('*, product_models(id,code,name,cost_per_unit), product_flavors(id,flavor_name)')
    .eq('profile_id', PID());
  if (error) throw error;
  return (data||[]).map(i => ({
    id: i.id,
    model_id: i.product_models?.id || i.model_id,
    model_code: i.product_models?.code || '?',
    model_name: i.product_models?.name || '?',
    cost_per_unit: i.product_models?.cost_per_unit || 0,
    flavor_id: i.product_flavors?.id || i.flavor_id,
    flavor_name: i.product_flavors?.flavor_name || '?',
    stock_units: i.stock_units,
    low_stock_threshold: i.low_stock_threshold,
  }));
}

async function getRecentSales(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase.from('sales').select('*,sale_items(*)')
    .eq('profile_id', PID()).gte('created_at', since).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getSettings() {
  const { data } = await supabase.from('settings').select('*').eq('profile_id', PID()).single();
  return data || {};
}

async function getOrCreateCustomer(waPhone, displayName) {
  const { data: ex } = await supabase.from('customers').select('*')
    .eq('profile_id', PID()).eq('wa_phone', waPhone).single();
  if (ex) {
    await supabase.from('customers').update({ last_seen_at: new Date().toISOString() }).eq('id', ex.id);
    return ex;
  }
  const { data, error } = await supabase.from('customers')
    .insert({ profile_id: PID(), wa_phone: waPhone, display_name: displayName || waPhone, last_seen_at: new Date().toISOString() })
    .select().single();
  if (error) throw error;
  return data;
}

async function getConversationHistory(customerId, limit = 20) {
  const { data } = await supabase.from('message_log').select('direction,payload')
    .eq('profile_id', PID()).eq('customer_id', customerId)
    .order('created_at', { ascending: false }).limit(limit);
  if (!data) return [];
  return data.reverse()
    .map(m => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.payload?.text || '' }))
    .filter(m => m.content);
}

async function saveMessage({ customerId, direction, channel, text, waMessageId }) {
  await supabase.from('message_log').insert({
    profile_id: PID(), customer_id: customerId, direction,
    channel: channel || 'whatsapp', message_type: 'text',
    wa_message_id: waMessageId, payload: { text },
  });
}

// Lógica de reposición (Restock) completa con registro de movimientos
async function restock({ model_id, flavor_id, flavor_name, model_code, qty, unit_cost }) {
  try {
    // 1. Crear registro en la tabla de compras
    const { data: purchase, error: pErr } = await supabase.from('purchases')
      .insert({ profile_id: PID(), supplier_name: 'Manual', notes: 'Reposición ' + model_code + ' ' + flavor_name })
      .select().single();
    if (pErr) throw pErr;

    // 2. Registrar el ítem comprado
    await supabase.from('purchase_items').insert({ purchase_id: purchase.id, model_id, flavor_id, qty, unit_cost });

    // 3. Obtener stock actual para actualizar
    const { data: inv } = await supabase.from('inventory').select('stock_units')
      .eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id).single();
    
    // 4. Actualizar inventario
    if (inv) {
      await supabase.from('inventory').update({
        stock_units: (inv.stock_units || 0) + Number(qty), updated_at: new Date().toISOString()
      }).eq('profile_id', PID()).eq('model_id', model_id).eq('flavor_id', flavor_id);
    }

    // 5. Registrar el movimiento de inventario para el historial
    await supabase.from('inventory_movements').insert({
      profile_id: PID(), model_id, flavor_id, movement_type: 'purchase',
      qty_delta: Number(qty), reference_type: 'purchase', reference_id: purchase.id
    });

    return { ok: true };
  } catch (e) {
    throw e;
  }
}

module.exports = { 
  getInventory, getRecentSales, getSettings, 
  getOrCreateCustomer, getConversationHistory, saveMessage, restock 
};
