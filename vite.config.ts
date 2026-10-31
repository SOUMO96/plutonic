import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Dev only: Vite does not run Vercel functions, so mount the same `api/` handlers as
 * middleware. Server env vars (ADMIN_*) are read from .env.local / the shell, never exposed
 * to the browser bundle. On Vercel the real serverless functions are used instead.
 */
function devApi(env: Record<string, string>): Plugin {
  for (const k of ['ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'CASHFREE_ENV', 'SITE_URL']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  return {
    name: 'plutonic-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const m = /^\/api\/admin\/(login|session|logout|data|mutate)\/?(\?.*)?$/.exec(req.url ?? '');
        const v1 = (req.url ?? '').startsWith('/api/v1/');
        if (!m && !v1) return next();
        try {
          if (v1) await (await server.ssrLoadModule('/server/v1/routes.ts')).handleV1(req, res);
          else await (await server.ssrLoadModule(`/api/admin/${m![1]}.ts`)).default(req, res);
        } catch (e) {
          server.config.logger.error(String(e));
          res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end('{"error":"server_error"}');
        }
      });
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss(), devApi(env)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
