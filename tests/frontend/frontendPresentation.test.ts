import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicPageUrl = new URL('../../src/index.html', import.meta.url);
const volunteerPageUrl = new URL('../../src/volunteer.html', import.meta.url);
const legacyLoginUrl = new URL('../../src/login.html', import.meta.url);
const viteConfigUrl = new URL('../../vite.config.ts', import.meta.url);
const vercelConfigUrl = new URL('../../vercel.json', import.meta.url);
const mainModuleUrl = new URL('../../src/main.ts', import.meta.url);
const publicModuleUrl = new URL('../../src/publicPage.ts', import.meta.url);
const logoUrl = new URL(
  '../../public/assets/aolf-connect-logo.png',
  import.meta.url
);

const readText = (url: URL) => readFileSync(url, 'utf8');

describe('AOLF Connect frontend presentation', () => {
  it('keeps the public chapter page independent from the private app', () => {
    const page = readText(publicPageUrl);

    expect(page).toContain('<title>AOLF Connect');
    expect(page).toContain('href="/volunteer"');
    expect(page).toContain('id="programs"');
    expect(page).toContain('id="schedule"');
    expect(page).not.toContain('sevaWorkspace()');
    expect(page).not.toContain('src="./main.ts"');
    expect(page).not.toContain('@tailwindcss/browser');
    expect(page).not.toContain('alpinejs@');
    expect(page).not.toContain('x-init="init()"');
    expect(readText(publicModuleUrl)).toContain(
      "import Alpine from 'alpinejs'"
    );
  });

  it('publishes only the public page and protected Seva workspace', () => {
    const viteConfig = readText(viteConfigUrl);
    const vercelConfig = JSON.parse(readText(vercelConfigUrl)) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(viteConfig).toContain("main: resolve(__dirname, 'src/index.html')");
    expect(viteConfig).toContain(
      "volunteer: resolve(__dirname, 'src/volunteer.html')"
    );
    expect(viteConfig).toContain('servePublicCoursePage');
    expect(viteConfig).not.toContain(
      "login: resolve(__dirname, 'src/login.html')"
    );
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/volunteer',
      destination: '/volunteer.html'
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/course/:id/pamphlet',
      destination: '/api/course/:id/pamphlet'
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/course/:id',
      destination: '/api/course/:id'
    });
    expect(existsSync(legacyLoginUrl)).toBe(false);
  });

  it('shows Google login before exposing the Seva workspace', () => {
    const page = readText(volunteerPageUrl);

    expect(page).toContain('<title>AOLF Connect | Seva Workspace</title>');
    expect(page).toContain('x-data="sevaWorkspace()"');
    expect(page).toContain('x-show="isVolunteerModalOpen"');
    expect(page).toContain('x-show="!isVolunteerModalOpen"');
    expect(page).toContain('x-cloak');
    expect(page).toContain('Continue with Google');
    expect(page).toContain('@click="startAuthFlow()"');
    expect(page).not.toContain('Featured Programs');
    expect(page).not.toContain('Upcoming Events');
  });

  it('uses the supplied local logo across public and workspace pages', () => {
    const publicPage = readText(publicPageUrl);
    const volunteerPage = readText(volunteerPageUrl);

    expect(publicPage).toContain('/assets/aolf-connect-logo.png');
    expect(volunteerPage).toContain('/assets/aolf-connect-logo.png');
    expect(statSync(logoUrl).size).toBeGreaterThan(1_000_000);
  });

  it('uses a WhatsApp brand icon without changing the message action', () => {
    const volunteerPage = readText(volunteerPageUrl);
    const mainModule = readText(mainModuleUrl);

    expect(volunteerPage).toContain('@click="openWhatsappForLead(lead)"');
    expect(volunteerPage).toContain('aria-label="Open WhatsApp"');
    expect(volunteerPage).toContain('data-icon="whatsapp"');
    expect(volunteerPage).not.toContain('data-lucide="message-circle"');
    expect(mainModule).not.toContain('MessageCircle');
    expect(volunteerPage).toContain('x-show="canOpenWhatsapp(lead)"');
    expect(volunteerPage).toContain(':disabled="!cleanPhone(lead.mobile)"');
    expect(volunteerPage).toContain('Call Tracker');
    expect(volunteerPage).toContain('Course Management');
    expect(volunteerPage).toContain('type="month"');
    expect(volunteerPage).toContain('type="file"');
    expect(volunteerPage).toContain('WhatsApp template');
    expect(volunteerPage).not.toContain('Pamphlet image URL');
    expect(volunteerPage).not.toContain('x-model="courseDraft.title"');
    expect(volunteerPage).not.toContain('x-model="courseDraft.courseCode"');
  });

  it('does not show an inactive notification control', () => {
    const volunteerPage = readText(volunteerPageUrl);

    expect(volunteerPage).not.toContain('aria-label="Notifications"');
    expect(volunteerPage).not.toContain('data-lucide="bell"');
    expect(volunteerPage).not.toContain('aria-label="Contact via WhatsApp"');
  });

  it('shows action feedback as a viewport-floating status', () => {
    const volunteerPage = readText(volunteerPageUrl);

    expect(volunteerPage).toContain('<template x-teleport="body">');
    expect(volunteerPage).toContain('x-show="actionMessage"');
    expect(volunteerPage).toContain('class="fixed left-1/2 z-[100]');
    expect(volunteerPage).toContain(
      'style="bottom: calc(5.5rem + env(safe-area-inset-bottom))"'
    );
  });
});
