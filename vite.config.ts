import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BrickLens — Escáner y Valoración de Minifiguras LEGO',
        short_name: 'BrickLens',
        description:
          'Escanea minifiguras de LEGO con la cámara, compara precios en BrickLink, BrickOwl, eBay, Wallapop y Vinted, y calcula el valor total de tu colección.',
        theme_color: '#101216',
        background_color: '#101216',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,jpg,png,svg,woff2}']
      }
    })
  ]
});
