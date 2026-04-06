import os

path = 'pwa/index.html'
with open(path, 'r', encoding='utf-8') as f:
    c = f.read()

# ARREGLAMOS LA RUTA DEL FETCH (Quitamos el /api sobrante)
# Buscamos la línea del fetch en handleRestock
c = c.replace("fetch('/api/data/restock'", "fetch('/data/restock'")

with open(path, 'w', encoding='utf-8') as f:
    f.write(c)

print('✅ URL de Stock (Restock) corregida con éxito!')
