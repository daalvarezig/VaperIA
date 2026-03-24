const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildCustomerPrompt(inventory, settings) {
  const available = inventory.filter(i => i.stock_units > 0)
    .map(i => `${i.model_code} ${i.flavor_name} (${i.stock_units}uds)`).join('\n');
  const low = inventory.filter(i => i.stock_units > 0 && i.stock_units <= (i.low_stock_threshold || 5))
    .map(i => `${i.model_code} ${i.flavor_name}`).join(', ');
  const teen    = settings?.teen_tone_enabled !== false;
  const suggest = settings?.suggestions_enabled !== false;
  return `Eres VaperIA, asistente de ventas WhatsApp de un negocio de vapes en Alcorcón.
TONO: ${teen ? 'casual juvenil español. Usa: bro, te renta, esto vuela. Emojis: 🔥👀💨' : 'amable y profesional'}
STOCK DISPONIBLE:
${available || 'Sin stock disponible'}${low && suggest ? '\nCASI AGOTADO (crea urgencia): ' + low : ''}
PRECIOS: 1-10uds→14€ | 10-50→12€ | 50-100→11€ | 100-500→10€
RECOGIDA (<10uds): Puerta del Sur 14:45-15:00 | Calle 8 Marzo 212, Alcorcón 16:15-16:30
REGLAS: WhatsApp NO es checkout. Di "te lo guardo/preparo/cuando llegues lo cerramos".
Para pedidos<10uds sugerir recogida presencial.${suggest ? '\nUpsell: más cantidad=mejor precio.' : ''}
Mensajes cortos. Siempre español.`;
}

function buildOwnerPrompt(inventory, sales, settings) {
  const today = new Date().toISOString().split('T')[0];
  const ts  = sales.filter(s => s.created_at?.startsWith(today));
  const rev = ts.reduce((a, s) => a + Number(s.total_amount || 0), 0);
  const mgn = ts.reduce((a, s) => a + Number(s.total_margin || 0), 0);
  return `Eres VaperIA modo INTERNO. Asistente del propietario de un negocio de vapes.
INVENTARIO HOY (${today}):
${inventory.map(i => `  ${i.model_code} ${i.flavor_name}: ${i.stock_units}uds`).join('\n') || '  Sin datos'}
VENTAS HOY: ${rev.toFixed(2)}€ ingresos | ${mgn.toFixed(2)}€ margen | ${ts.length} ventas
PRECIOS: 1-10→14€ | 10-50→12€ | 50-100→11€ | 100-500→10€
COSTES: 40K=5.70€/ud | 80K=7.00€/ud  |  profit=(precio-coste)×qty
PICKUP <10uds: Puerta del Sur 14:45-15:00 | Calle 8 Marzo 212 16:15-16:30
Comandos: stock? | profit hoy | vende N sabor modelo | repone N sabor modelo | low stock?
Conciso. Confirma antes de registrar. Español.`;
}

async function chat({ messages, mode = 'customer', inventory = [], sales = [], settings = {} }) {
  const system  = mode === 'owner'
    ? buildOwnerPrompt(inventory, sales, settings)
    : buildCustomerPrompt(inventory, settings);
  const trimmed = messages.slice(-20).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content).slice(0, 2000),
  }));
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514', max_tokens: 500, system, messages: trimmed,
  });
  return response.content[0]?.text || '¿Puedes repetir eso?';
}

module.exports = { chat };
