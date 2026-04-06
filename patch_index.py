import os
import re

path = 'pwa/index.html'
if not os.path.exists(path):
    print(f"❌ Error: No se encuentra {path}")
    exit(1)

with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. ACTUALIZAR handleConfirmSale (Para la fecha)
c = c.replace('const handleConfirmSale = async (lines, customer) => {', 'const handleConfirmSale = async (lines, customer, date) => {')
c = c.replace('body: JSON.stringify({ lines, customer })', 'body: JSON.stringify({ lines, customer, created_at: new Date(date).toISOString() })')

# 2. ACTUALIZAR LLAMADA A SalesPage
# Buscamos la llamada antigua y le inyectamos los props que faltan
old_call = "tab === 'sales' && <SalesPage sales={sales} onRegisterSale={() => setShowSale(true)} onDeleteSale={handleDeleteSale} />"
new_call = "tab === 'sales' && <SalesPage sales={sales} customers={customers} onRegisterSale={() => setShowSale(true)} onDeleteSale={handleDeleteSale} onUpdateSale={loadData} />"
c = c.replace(old_call, new_call)

# 3. ACTUALIZAR LLAMADA A RegisterSaleModal
c = c.replace('onConfirm={(lines, cust) => handleConfirmSale(lines, cust)}', 'onConfirm={handleConfirmSale}')

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('✅ index.html actualizado con éxito!')
