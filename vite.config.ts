import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // 允许局域网访问，等价于 --host 0.0.0.0
    host: true,
    // 如需固定端口可在此调整，默认 5173
    port: 5173
  }
});

