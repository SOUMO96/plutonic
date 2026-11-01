import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

/**
 * Dev only: Vite does not run Vercel functions, so mount the same `api/` handlers as
 * middleware. Server env vars (ADMIN_*) are read from .env.local / the shell, never exposed
 * to the browser bundle. On Vercel the real serverless functions are used instead.
 */
/** Plain KEY=VALUE reader with NO `$` expansion (Vite's loadEnv would mangle password hashes like `scrypt$16384$8$1$...`). */
function rawEnv(mode: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
    let text = ''; try { text = fs.readFileSync(path.resolve(__dirname, f), 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith('#')) continue;
      out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return out;
}

function devApi(mode: string): Plugin {
  const env = rawEnv(mode);
  for (const k of ['ADMIN_EMAIL', 'ADMIN_PASSWORD_HASH', 'ADMIN_SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'CASHFREE_ENV', 'SITE_URL', 'COURIER', 'SIM_STEP_SECONDS', 'AUTOMATION_SECRET']) if (env[k] && !process.env[k]) process.env[k] = env[k];
  // Local development uses the courier simulator unless you choose another (COURIER=manual turns courier automation off).
  process.env.COURIER ??= 'simulator';
  return {
    name: 'plutonic-dev-api',
    configureServer(server) {
      // Local stand-in for a scheduler: run the fulfilment automation every few seconds (it is idempotent).
      if (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.AUTOMATION_DEV !== 'off') {
        const timer = setInterval(async () => {
          try { await (await server.ssrLoadModule('/server/automation/engine.ts')).tick(); } catch { /* logged by the engine */ }
        }, Number(process.env.AUTOMATION_DEV_INTERVAL_MS ?? 4000));
        server.httpServer?.on('close', () => clearInterval(timer));
      }
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
    plugins: [react(), tailwindcss(), devApi(mode)],
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
