import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicPageUrl = new URL('../../src/index.html', import.meta.url);
const sevaPageUrl = new URL('../../src/seva.html', import.meta.url);
const legacyLoginUrl = new URL('../../src/login.html', import.meta.url);
const viteConfigUrl = new URL('../../vite.config.ts', import.meta.url);
const vercelConfigUrl = new URL('../../vercel.json', import.meta.url);
const mainModuleUrl = new URL('../../src/main.ts', import.meta.url);
const logoUrl = new URL(
  '../../public/assets/aolf-connect-logo.png',
  import.meta.url
);

const readText = (url: URL) => readFileSync(url, 'utf8');

describe('AOLF Connect frontend presentation', () => {
  it('keeps the public chapter page independent from the private app', () => {
    const page = readText(publicPageUrl);

    expect(page).toContain('<title>AOLF Connect');
    expect(page).toContain('href="/seva"');
    expect(page).toContain('id="programs"');
    expect(page).toContain('id="participants"');
    expect(page).toContain('id="about"');
    expect(page).toContain('id="connect"');
    expect(page).not.toContain('sevaWorkspace()');
    expect(page).not.toContain('src="./main.ts"');
  });

  it('publishes only the public page and protected Seva workspace', () => {
    const viteConfig = readText(viteConfigUrl);
    const vercelConfig = JSON.parse(readText(vercelConfigUrl)) as {
      redirects: Array<{ source: string; destination: string }>;
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(viteConfig).toContain("main: resolve(__dirname, 'src/index.html')");
    expect(viteConfig).toContain("seva: resolve(__dirname, 'src/seva.html')");
    expect(viteConfig).not.toContain(
      "login: resolve(__dirname, 'src/login.html')"
    );
    expect(vercelConfig.rewrites).toEqual([
      { source: '/seva', destination: '/seva.html' }
    ]);
    expect(vercelConfig.redirects).toContainEqual({
      source: '/login',
      destination: '/seva',
      permanent: false
    });
    expect(existsSync(legacyLoginUrl)).toBe(false);
  });

  it('shows Google login before exposing the Seva workspace', () => {
    const page = readText(sevaPageUrl);

    expect(page).toContain('<title>AOLF Connect | Seva Workspace</title>');
    expect(page).toContain('x-data="sevaWorkspace()"');
    expect(page).toContain('x-show="isVolunteerModalOpen"');
    expect(page).toContain('x-show="!isVolunteerModalOpen"');
    expect(page).toContain('x-cloak');
    expect(page).toContain('Continue with Google');
    expect(page).toContain('await startAuthFlow()');
    expect(page).not.toContain('Featured Programs');
    expect(page).not.toContain('Upcoming Events');
  });

  it('uses the supplied logo without changing the workspace header images', () => {
    const publicPage = readText(publicPageUrl);
    const sevaPage = readText(sevaPageUrl);
    const leftHeaderImage =
      'https://virtualgallery.ssrvm.org/assets/x3c522afe-a827-4fc7-b0ea-9685495d4a56.png.pagespeed.ic.IbyWpMz_OF.png';
    const centerHeaderImage =
      'https://www.artofliving.org/ca-en/iimg/2252/i.webp';

    expect(publicPage).toContain('/assets/aolf-connect-logo.png');
    expect(sevaPage).toContain('/assets/aolf-connect-logo.png');
    expect(sevaPage).toContain(leftHeaderImage);
    expect(sevaPage).toContain(centerHeaderImage);
    expect(statSync(logoUrl).size).toBeGreaterThan(1_000_000);
  });

  it('uses a WhatsApp brand icon without changing the message action', () => {
    const sevaPage = readText(sevaPageUrl);
    const mainModule = readText(mainModuleUrl);

    expect(sevaPage).toContain(':href="buildWhatsappHref(lead)"');
    expect(sevaPage).toContain('target="_blank"');
    expect(sevaPage).toContain('rel="noopener noreferrer"');
    expect(sevaPage).toContain('aria-label="Open WhatsApp"');
    expect(sevaPage).toContain('data-icon="whatsapp"');
    expect(sevaPage).not.toContain('data-lucide="message-circle"');
    expect(mainModule).not.toContain('MessageCircle');
  });
});
