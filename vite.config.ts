import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

// Esegue le funzioni di /api come su Vercel, cosi' `npm run dev` / `preview` funzionano end-to-end,
// e serve admin.html per tutte le rotte /admin/*.
function vercelLike(): Plugin {
  const mount = (
    middlewares: { use: (fn: (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void) => void },
    load: (file: string) => Promise<{ default: Handler }>,
  ) => {
    middlewares.use(async (req, res, next) => {
      const url = req.url ?? '/';
      if (/^\/admin(\/[^.]*)?(\?.*)?$/.test(url)) req.url = '/admin.html';
      const name = /^\/api\/([\w-]+)(?:[/?]|$)/.exec(url)?.[1];
      const file = name && !name.startsWith('_') ? resolve('api', `${name}.js`) : '';
      if (!file || !existsSync(file)) return next();
      try {
        await (await load(file)).default(req, res);
      } catch (err) {
        next(err);
      }
    });
  };
  return {
    name: 'vercel-like',
    configureServer: (server) => mount(server.middlewares, (file) => server.ssrLoadModule(file) as Promise<{ default: Handler }>),
    configurePreviewServer: (server) => mount(server.middlewares, (file) => import(pathToFileURL(file).href)),
  };
}

export default defineConfig(({ mode }) => {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) process.env[key] ??= value;

  return {
    plugins: [react(), vercelLike()],
    build: {
      target: ['es2020', 'chrome87', 'edge88', 'firefox78', 'safari14'],
      rolldownOptions: {
        input: { main: resolve('index.html'), admin: resolve('admin.html'), login: resolve('admin-login.html') },
      },
    },
  };
});
