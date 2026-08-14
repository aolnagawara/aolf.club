import { defineConfig } from 'vite';
import { resolve } from 'node:path';

function volunteerRewritePlugin() {
  const rewriteVolunteerUrl = (url?: string) => {
    if (!url) {
      return url;
    }

    const queryIndex = url.indexOf('?');
    const pathname = queryIndex >= 0 ? url.slice(0, queryIndex) : url;
    const query = queryIndex >= 0 ? url.slice(queryIndex) : '';

    return pathname === '/volunteer' || pathname === '/volunteer/'
      ? `/volunteer.html${query}`
      : url;
  };

  return {
    name: 'aolf-volunteer-rewrite',
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
        req.url = rewriteVolunteerUrl(req.url);
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
        req.url = rewriteVolunteerUrl(req.url);
        next();
      });
    }
  };
}

export default defineConfig({
  root: 'src',
  publicDir: resolve(__dirname, 'public'),
  plugins: [volunteerRewritePlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        volunteer: resolve(__dirname, 'src/volunteer.html'),
        privacy: resolve(__dirname, 'src/privacy.html'),
        terms: resolve(__dirname, 'src/terms.html')
      }
    },
    outDir: '../dist',
    emptyOutDir: true
  }
});