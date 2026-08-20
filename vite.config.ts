import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { mockCourses } from './src/repositories/mock/mockCourses';
import { pickPublicCourseByKey } from './shared/contracts/courseDefaults.mjs';
import {
  renderPublicCourseHtml,
  toPublicCourseView
} from './api/_lib/courses/publicHtml';

const COURSE_PAMPHLET_PATH =
  /^\/(?:course|c)\/([^/?#]+)\/pamphlet\/?$/;
const COURSE_PATH = /^\/(?:course|c)\/([^/?#]+)\/?$/;

type MiddlewareRes = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string | Buffer) => void;
};

function servePublicCoursePamphlet(
  url: string | undefined,
  res: MiddlewareRes
): boolean {
  const pathname = String(url || '').split('?')[0];
  const match = pathname.match(COURSE_PAMPHLET_PATH);
  if (!match) {
    return false;
  }
  const key = decodeURIComponent(match[1] || '');
  const course = pickPublicCourseByKey(mockCourses, key);
  if (!course?.hasPamphlet) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Pamphlet not found.');
    return true;
  }
  res.statusCode = 404;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('Pamphlet not found.');
  return true;
}

function servePublicCoursePage(
  url: string | undefined,
  host: string | string[] | undefined,
  res: MiddlewareRes
): boolean {
  const pathname = String(url || '').split('?')[0];
  if (COURSE_PAMPHLET_PATH.test(pathname)) {
    return false;
  }
  const match = pathname.match(COURSE_PATH);
  if (!match) {
    return false;
  }
  const key = decodeURIComponent(match[1] || '');
  const hostname = Array.isArray(host) ? host[0] : host || 'localhost:5173';
  const origin = 'http://' + hostname;
  const course = pickPublicCourseByKey(mockCourses, key);
  const rendered = renderPublicCourseHtml({
    course: course ? toPublicCourseView(course) : null,
    origin,
    logoUrl: origin + '/assets/aolf-connect-logo.png'
  });
  res.statusCode = rendered.status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(rendered.html);
  return true;
}

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
            req: { url?: string; headers?: { host?: string | string[] } },
            res: MiddlewareRes,
            next: () => void
          ) => void
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        if (servePublicCoursePamphlet(req.url, res)) {
          return;
        }
        if (servePublicCoursePage(req.url, req.headers?.host, res)) {
          return;
        }
        req.url = rewriteVolunteerUrl(req.url);
        next();
      });
    },
    configurePreviewServer(server: {
      middlewares: {
        use: (
          handler: (
            req: { url?: string; headers?: { host?: string | string[] } },
            res: MiddlewareRes,
            next: () => void
          ) => void
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        if (servePublicCoursePamphlet(req.url, res)) {
          return;
        }
        if (servePublicCoursePage(req.url, req.headers?.host, res)) {
          return;
        }
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
