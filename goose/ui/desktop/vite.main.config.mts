import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  define: {
    'process.env.GITHUB_OWNER': JSON.stringify(process.env.GITHUB_OWNER || 'aaif-mayhem'),
    'process.env.GITHUB_REPO': JSON.stringify(process.env.GITHUB_REPO || 'mayhem'),
    'process.env.MAYHEM_BUNDLE_NAME': JSON.stringify(process.env.MAYHEM_BUNDLE_NAME || 'Mayhem'),
  },
});
