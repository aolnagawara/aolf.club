import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { mockCourses } from './src/repositories/mock/mockCourses';
import {
  homepageProgramOffers,
  selectActivePublicCourses
} from './shared/contracts/courseDefaults.mjs';
import {
  renderPublicCourseHtml,
  toPublicCourseView
} from './api/_lib/courses/publicHtml';

const COURSE_PAMPHLET_PATH = /^\/course\/([^/?#]+)\/pamphlet\/?$/;

type MiddlewareRes = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string | Buffer) => void;
};

function servePublicCourseCatalog(
  url: string | undefined,
  res: MiddlewareRes
): boolean {
  const raw = String(url || '');
  const queryIndex = raw.indexOf('?');
  const pathname = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  const query = queryIndex >= 0 ? raw.slice(queryIndex + 1) : '';
  if (pathname !== '/api/courses' && pathname !== '/api/courses/') {
    return false;
  }
  const params = new URLSearchParams(query);
  if (params.get('catalog') !== '1') {
    return false;
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.end(
    JSON.stringify({
      success: true,
      offers: homepageProgramOffers(mockCourses)
    })
  );
  return true;
}

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
  const course = mockCourses.find((item) => item.id === key);
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

function servePublicCoursesPage(
  url: string | undefined,
  host: string | string[] | undefined,
  res: MiddlewareRes
): boolean {
  const requestUrl = new URL(String(url || ''), 'http://localhost');
  if (requestUrl.pathname !== '/courses') {
    return false;
  }
  const programKey = requestUrl.searchParams.get('program') || '';
  const hostname = Array.isArray(host) ? host[0] : host || 'localhost:5173';
  const origin = 'http://' + hostname;
  const page = selectActivePublicCourses(mockCourses, programKey);
  const courses = page.courses.map((course) => toPublicCourseView(course));
  const selected = page.selected
    ? toPublicCourseView(page.selected)
    : courses[0] || null;
  const rendered = renderPublicCourseHtml({
    selected,
    courses,
    origin,
    fallbackImageUrl: origin + '/assets/course.webp',
    programKey: page.selectionMatched ? programKey : ''
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
        if (servePublicCourseCatalog(req.url, res)) {
          return;
        }
        if (servePublicCoursePamphlet(req.url, res)) {
          return;
        }
        if (servePublicCoursesPage(req.url, req.headers?.host, res)) {
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
        if (servePublicCourseCatalog(req.url, res)) {
          return;
        }
        if (servePublicCoursePamphlet(req.url, res)) {
          return;
        }
        if (servePublicCoursesPage(req.url, req.headers?.host, res)) {
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
