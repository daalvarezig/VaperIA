#!/bin/bash
set -e
[ -f .env ] && export $(grep -v '^#' .env | xargs)
BACKEND="${BACKEND_URL:-http://localhost:3001}"
EVO="${EVOLUTION_URL:-http://localhost:8080}"
WEBHOOK="${WEBHOOK_PUBLIC_URL}/webhook/evolution"
echo "⏳ Esperando backend..."
for i in $(seq 1 30); do curl -sf "$BACKEND/health" > /dev/null 2>&1 && echo "✅ Backend OK" && break || sleep 2; done
echo "⏳ Esperando Evolution API..."
for i in $(seq 1 30); do curl -sf "$EVO/" > /dev/null 2>&1 && echo "✅ Evolution OK" && break || sleep 2; done
echo "📱 Creando instancia WhatsApp..."
curl -s -X POST "$EVO/instance/create" \
  -H "apikey: $EVOLUTION_API_KEY" -H "Content-Type: application/json" \
  -d "{\"instanceName\":\"$EVOLUTION_INSTANCE\",\"qrcode\":true,\"integration\":\"WHATSAPP-BAILEYS\",\"webhook\":{\"url\":\"$WEBHOOK\",\"byEvents\":false,\"base64\":false,\"events\":[\"MESSAGES_UPSERT\",\"CONNECTION_UPDATE\",\"QRCODE_UPDATED\"]}}"
echo ""
echo "✅ Listo. Escanea el QR en: $EVO/instance/connect/$EVOLUTION_INSTANCE"
echo "   (usa la cabecera apikey: $EVOLUTION_API_KEY)"
