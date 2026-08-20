function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatWhatsappHtml(raw: string): string {
  const placeholders: string[] = [];
  const stash = (html: string): string => {
    const token = '\u0000PH' + String(placeholders.length) + '\u0000';
    placeholders.push(html);
    return token;
  };

  let text = String(raw || '');
  text = text.replace(/```([^`]+)```/g, (_match, code: string) =>
    stash('<code>' + escapeHtml(code) + '</code>')
  );
  text = text.replace(/https?:\/\/[^\s<]+|www\.[^\s<]+/gi, (url: string) => {
    const clean = url.replace(/[),.;!?*_~]+$/g, '');
    const suffix = url.slice(clean.length);
    const href = /^https?:\/\//i.test(clean) ? clean : 'https://' + clean;
    return (
      stash(
        '<a href="' +
          escapeHtml(href) +
          '" rel="noopener noreferrer" target="_blank">' +
          escapeHtml(clean) +
          '</a>'
      ) + suffix
    );
  });
  text = text.replace(
    /(?<!\d)(?:\+91[\s-]*)?[6-9]\d{9}(?!\d)/g,
    (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    const href =
      digits.length === 12 && digits.startsWith('91') ? '+' + digits : digits;
    return stash(
      '<a href="tel:' + escapeHtml(href) + '">' + escapeHtml(phone) + '</a>'
    );
  });
  text = text.replace(/_\*([^*\n]+)\*_/g, (_match, inner: string) =>
    stash('<em><strong>' + escapeHtml(inner) + '</strong></em>')
  );
  text = text.replace(/\*_([^_\n]+)_\*/g, (_match, inner: string) =>
    stash('<strong><em>' + escapeHtml(inner) + '</em></strong>')
  );
  text = text.replace(/\*([^*\n]+)\*/g, (_match, inner: string) =>
    stash('<strong>' + escapeHtml(inner) + '</strong>')
  );
  text = text.replace(/_([^_\n]+)_/g, (_match, inner: string) =>
    stash('<em>' + escapeHtml(inner) + '</em>')
  );
  text = text.replace(/~([^~\n]+)~/g, (_match, inner: string) =>
    stash('<s>' + escapeHtml(inner) + '</s>')
  );
  text = escapeHtml(text);
  for (let index = placeholders.length - 1; index >= 0; index -= 1) {
    text = text.replaceAll(
      '\u0000PH' + String(index) + '\u0000',
      placeholders[index]
    );
  }
  return text;
}
