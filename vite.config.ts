import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import prerender from 'vite-plugin-prerender'

export default defineConfig({
  plugins: [
    react(),
    prerender({
      routes: ['/'], // Add dynamic property slugs later via build script
      minify: true,
      inject: { head: '<meta name="viewport" content="width=device-width, initial-scale=1">' }
    })
  ],
  css: {
    postcss: { plugins: [tailwindcss()] }
  }
})
