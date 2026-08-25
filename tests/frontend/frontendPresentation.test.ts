import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const publicPageUrl = new URL('../../src/index.html', import.meta.url);
const sevaPageUrl = new URL('../../src/seva.html', import.meta.url);
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
    expect(page).toContain('href="/seva"');
    expect(page).toContain('id="programs"');
    expect(page).toContain('id="schedule"');
    expect(page).not.toContain('sevaWorkspace()');
    expect(page).not.toContain('src="./main.ts"');
    expect(page).toContain('src="./publicPage.ts"');
    expect(page).toContain('x-data="homepagePrograms"');
    expect(page).toContain('class="program-cta"');
    expect(page).toMatch(/text-decoration:\s*underline/);
    expect(page).toContain('Know More');
    expect(page).toContain('Happiness Program (Adults)');
    expect(page).toContain('Intuition Program (Kids & Teens)');
    expect(page).toContain('Sahaj Samadhi Meditation (Adults)');
    expect(page).not.toContain('class="program-type"');
    expect(page).not.toContain('Art of Living Intuition Program');
    expect(page).not.toContain('id="upcoming"');
    expect(page).not.toContain('Upcoming program');
    expect(page).not.toContain('@tailwindcss/browser');
    expect(page).not.toContain('alpinejs@');
    expect(page).not.toContain('x-init="init()"');
    expect(readText(publicModuleUrl)).toContain(
      "import Alpine from 'alpinejs'"
    );
    expect(readText(publicModuleUrl)).toContain('/api/courses?catalog=1');
  });

  it('publishes only the public page and protected Seva workspace', () => {
    const viteConfig = readText(viteConfigUrl);
    const vercelConfig = JSON.parse(readText(vercelConfigUrl)) as {
      rewrites: Array<{ source: string; destination: string }>;
    };

    expect(viteConfig).toContain("main: resolve(__dirname, 'src/index.html')");
    expect(viteConfig).toContain("seva: resolve(__dirname, 'src/seva.html')");
    expect(viteConfig).toContain('servePublicCoursesPage');
    expect(viteConfig).not.toContain(
      "login: resolve(__dirname, 'src/login.html')"
    );
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/seva',
      destination: '/seva.html'
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/api/courses/:id',
      destination: '/api/courses?id=:id'
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/courses',
      destination: '/api/public-courses'
    });
    expect(vercelConfig.rewrites).toContainEqual({
      source: '/course/:id/image',
      destination: '/api/public-courses?asset=image&id=:id'
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
    expect(page).toContain('@click="startAuthFlow()"');
    expect(page).toContain('x-show="isProgramEditorOpen"');
    expect(page).toContain('x-text="lead.programSummary"');
    expect(page).toContain('x-for="lead in visibleLeads()"');
    expect(page).toContain("getLeadKey(lead) + '|' + lead.programSummary");
    expect(page).toContain('@click="applyFollowUpPicker()"');
    expect(page).toContain('@click.self="closeProgramEditor()"');
    expect(page).toContain('@click="applyProgramEditor()"');
    expect(page).not.toContain('saveFollowUpPicker()');
    expect(page).not.toContain('saveProgramEditor()');
    expect(page).toContain('@click="closeProgramEditor()"');
    expect(page).not.toContain('Featured Programs');
    expect(page).not.toContain('Upcoming Events');
  });

  it('uses the supplied local logo across public and workspace pages', () => {
    const publicPage = readText(publicPageUrl);
    const sevaPage = readText(sevaPageUrl);

    expect(publicPage).toContain('/assets/aolf-connect-logo.png');
    expect(sevaPage).toContain('/assets/aolf-connect-logo.png');
    expect(statSync(logoUrl).size).toBeGreaterThan(1_000_000);
  });

  it('uses a WhatsApp brand icon without changing the message action', () => {
    const sevaPage = readText(sevaPageUrl);
    const mainModule = readText(mainModuleUrl);

    expect(sevaPage).toContain('@click="openWhatsappForLead(lead)"');
    expect(sevaPage).toContain('@click="openImageShareForLead(lead)"');
    expect(sevaPage).toContain('aria-label="Open WhatsApp"');
    expect(sevaPage).toContain('aria-label="Share activity image"');
    expect(sevaPage).toContain('data-icon="whatsapp"');
    expect(sevaPage).toContain('data-lucide="paperclip"');
    expect(sevaPage).not.toContain('data-lucide="message-circle"');
    expect(mainModule).not.toContain('MessageCircle');
    expect(mainModule).toContain('Paperclip');
    expect(mainModule).toContain('Download');
    expect(mainModule).toContain('UserRoundPlus');
    expect(sevaPage).toContain('x-show="canOpenWhatsapp(lead)"');
    expect(sevaPage).toContain(':disabled="!cleanPhone(lead.mobile)"');
    expect(sevaPage).toContain('Call Tracker');
    expect(sevaPage).toContain('Activity Management');
    expect(sevaPage).toContain('x-text="courseCardSubtitle(course)"');
    expect(sevaPage).toContain(
      'class="aspect-square w-full rounded-lg bg-slate-100 object-contain"'
    );
    expect(sevaPage).not.toContain('type="month"');
    expect(sevaPage).toContain('showsProgramTabs()');
    expect(sevaPage).toContain('type="file"');
    expect(sevaPage).toContain('@click="clearCourseImage()"');
    expect(sevaPage).toContain('@click="downloadCourseImage(course)"');
    expect(sevaPage).toContain('WhatsApp template');
    expect(sevaPage).toContain('x-model="courseDraft.title"');
    expect(sevaPage).not.toContain('x-model="courseDraft.courseCode"');
  });

  it('does not show an inactive notification control', () => {
    const sevaPage = readText(sevaPageUrl);

    expect(sevaPage).not.toContain('aria-label="Notifications"');
    expect(sevaPage).not.toContain('data-lucide="bell"');
    expect(sevaPage).not.toContain('aria-label="Contact via WhatsApp"');
  });

  it('shows action feedback as a viewport-floating status', () => {
    const sevaPage = readText(sevaPageUrl);

    expect(sevaPage).toContain('<template x-teleport="body">');
    expect(sevaPage).toContain('x-show="actionMessage"');
    expect(sevaPage).toContain('class="fixed left-1/2 z-[100]');
    expect(sevaPage).toContain(
      'style="bottom: calc(5.5rem + env(safe-area-inset-bottom))"'
    );
  });
});
