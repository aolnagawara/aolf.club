import { defineConfig } from 'vite';
import { resolve } from 'node:path';

function sevaRewritePlugin() {
  const rewriteSevaUrl = (url?: string) => {
    if (!url) {
      return url;
    }

    const queryIndex = url.indexOf('?');
    const pathname = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
    const query = queryIndex >= 0 ? url.slice(queryIndex) : '';

    return pathname === '/seva' || pathname === '/seva/'
      ? `/seva.html${query}`
      : url;
  };

  return {
    name: 'aolf-seva-rewrite',
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            req: { url?: string },
            _res: unknown,
            next: () => void
          ) => void
        ) => void;
      };
    }) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewriteSevaUrl(req.url);
        next();
      });
    },
    configurePreviewServer(server: {
      middlewares: {
        use: (
          handler: (
            req: { url?: string },
            _res: unknown,
            next: () => void
          ) => void
        ) => void;
      };
    }) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewriteSevaUrl(req.url);
        next();
      });
    }
  };
}

export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  plugins: [sevaRewritePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        seva: resolve(__dirname, 'src/seva.html'),
        privacy: resolve(__dirname, 'src/privacy.html'),
        terms: resolve(__dirname, 'src/terms.html')
      }
    },
    outDir: '../dist',
    emptyOutDir: true
  }
});
