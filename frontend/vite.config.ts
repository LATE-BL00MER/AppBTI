import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'APPBTI_DEV_');
  return {
    plugins: [react()],
    optimizeDeps: { include: ['recharts'] },
    server: {
      host: '127.0.0.1',
      port: Number(env.APPBTI_DEV_PORT || 5173),
      strictPort: true,
      cors: false,
      fs: { allow: ['.'] },
      proxy: {
        '/api': `http://127.0.0.1:${env.APPBTI_DEV_API_PORT || 8080}`,
      },
    },
  };
});
