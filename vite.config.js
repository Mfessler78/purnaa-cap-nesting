import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import stylesApi from './server/styles-api.js'

export default defineConfig({
  plugins: [react(), stylesApi()],
})
