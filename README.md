# BrickLens PWA

Progressive Web App móvil (React 19 + TypeScript + Vite + Dexie/IndexedDB) para escanear minifiguras de LEGO, detectar lotes múltiples sobre mesa, identificar cajas sorpresa CMF por código Data Matrix, comparar precios en **5 portales europeos (€)** y gestionar la rentabilidad del portfolio sin muros de pago.

## Características Principales

- **Escáner 3-en-1 minimalista**:
  - **Modo Individual**: captura por cámara (`getUserMedia`), subida/arrastre con recorte WebP en `<canvas>`, desambiguación de hasta **12 candidatos** (*Brickognize API* `/predict/figs/` + catálogo local) y precios lado a lado `Usada / Nueva`.
  - **Modo Lote (*Bulk Scanner*)**: segmentación multi-región `1..N` sobre mesa con cajas interactivas numeradas, filas compactas (`Usada / Nueva`, stepper `−/+`, reemplazo entre 12 alternativas) y botón **Añadir todas al inventario**.
  - **Modo Cajas CMF**: lector/buscador Data Matrix compatible con fábrica europea (**`S`**) y norteamericana (**`R`**) para Series 25 (`71045`), 26 Space (`71046`), D&D (`71047`), Serie 27 (`71048`) y Spider-Verse (`71050`).
- **Comparador Multi-Portal (€)**: BrickLink, BrickOwl, eBay España/UE, Wallapop y Vinted con selección de **Fuente de Precio Base**, enlaces directos de búsqueda y veredicto automático de arbitraje **Part-Out** (*pieza a pieza vs. completa*).
- **Portfolio Local-First & Importador/Exportador Universal**:
  - Almacenamiento offline en `IndexedDB` (`Dexie`), curva temporal **Sparkline** (`1D · 1S · 1M · 1A`) y tarjeta resumen compartible.
  - Importación y cotización automática desde texto libre (`sw0585 x3, sh0232 new 52`), **CSV**, **BrickLink XML** y **BrickStore `.bsx`**, además de exportación en los 3 formatos.
- **Proxy Edge Ligero (`/api/*`)**:
  - [`/api/brickognize`](api/brickognize.ts): reenvío multipart seguro para despliegues HTTPS en móvil.
  - [`/api/health`](api/health.ts): estado de proveedores y variables opcionales (`BRICKLINK_CONSUMER_KEY`, `EBAY_CLIENT_ID`).

## Desarrollo Local y Verificación

```bash
npm install
npm run dev      # Servidor de desarrollo Vite + PWA
npm run lint     # Linter estático oxlint
npm run test     # Suite unitaria e integración con Vitest + fake-indexeddb
npm run build    # Verificación TypeScript (tsc -b) + bundle + Service Worker Workbox
```
