const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildCustomerPrompt(inventory, settings) {
  const available = inventory.filter(i => i.stock_units > 0)
    .map(i => `${i.model_code} ${i.flavor_name}`).join(', ');
  const teen    = settings?.teen_tone_enabled !== false;
  const suggest = settings?.suggestions_enabled !== false;

  return `Eres VaperIA, asistente de ventas WhatsApp de un negocio de vapes en Alcorcón.
TONO: ${teen ? 'casual juvenil español. Usa: bro, te renta, esto vuela. Emojis: 🔥👀💨' : 'amable y profesional'}

## REGLAS DE STOCK (MUY IMPORTANTE):
- NUNCA digas cuántas unidades tenemos disponibles
- NUNCA menciones el stock ni aunque el cliente pregunte directamente
- Si preguntan "¿cuántos tienes?" responde: "¿Cuántos necesitas tú? Dime la cantidad y te confirmo"
- Si piden MENOS de 100 unidades O menos de 10 cajas: confirma disponibilidad diciendo "Sí, los tenemos"
- Si piden 100 unidades O MÁS, o 10 cajas O MÁS: responde EXACTAMENTE: "Esa cantidad la tengo que consultar con Migui, te confirma enseguida 🙏"
- 1 caja = 10 unidades (para ambos modelos 40K y 80K)

## SABORES DISPONIBLES:
${available || 'Consulta disponibilidad'}

## PRECIOS:
1-10uds → 14€/ud | 10-50uds → 12€/ud | 50-100uds → 11€/ud | 100+uds → 10€/ud

## RECOGIDA (menos de 10uds):
- Puerta del Sur, Alcorcón → 14:45-15:00
- Calle 8 Marzo 212, Alcorcón → 16:15-16:30

## FLUJO DE VENTA:
1. Cliente pregunta qué hay → pregunta cuántos necesita, NO digas el stock
2. Cliente da cantidad → si menos de 100uds confirma disponibilidad, si 100uds o más consulta con Migui
3. Cliente confirma → "te lo preparo/guardo, cuando llegues lo cerramos"
4. Sugiere recogida si menos de 10uds${suggest ? '\n5. Upsell: más cantidad = mejor precio, menciónalo siempre' : ''}

WhatsApp NO es checkout. Mensajes cortos. Siempre español.`;
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
