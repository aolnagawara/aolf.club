import { normalizeIndianMobile } from '../http/normalization.js';

export type ParserTerm = {
  canonical: string;
  aliases: string[];
};

export type LeadParserCatalog = {
  courses: ParserTerm[];
  leadQualities: ParserTerm[];
  months: ParserTerm[];
};

export type ParsedLeadMessage = {
  mobile: string;
  name: string;
  course: string;
  leadQuality: string;
  month: string;
  notes: string;
  originalMessage: string;
};

type Token = {
  original: string;
  normalized: string;
};

type Span = {
  start: number;
  end: number;
};

type AliasEntry = {
  kind: 'course' | 'leadQuality' | 'month';
  canonical: string;
  aliasTokens: string[];
};

function normalizeWhitespace(message: string): string {
  return String(message || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function trimTokenForMatching(value: string): string {
  let start = 0;
  let end = value.length - 1;

  const isTokenChar = (char: string) => {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    return isDigit || isUpper || isLower || char === '+';
  };

  while (start <= end && !isTokenChar(value[start])) {
    start += 1;
  }

  while (end >= start && !isTokenChar(value[end])) {
    end -= 1;
  }

  if (start > end) {
    return '';
  }

  return value.slice(start, end + 1).toLowerCase();
}

function toTokens(message: string): Token[] {
  if (!message) {
    return [];
  }

  return message.split(' ').map((part) => ({
    original: part,
    normalized: trimTokenForMatching(part)
  }));
}

function isPhoneLikeToken(token: string): boolean {
  const value = String(token || '').trim();
  if (!value) {
    return false;
  }

  let hasDigit = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const isDigit = char >= '0' && char <= '9';
    if (isDigit) {
      hasDigit = true;
      continue;
    }

    if (char === '+' || char === '-' || char === '(' || char === ')') {
      continue;
    }

    return false;
  }

  return hasDigit;
}

function findMobile(tokens: Token[]): { mobile: string; span: Span | null } {
  for (let i = 0; i < tokens.length; i += 1) {
    for (let j = i; j < Math.min(i + 4, tokens.length); j += 1) {
      let allPhoneLike = true;
      let combined = '';
      for (let k = i; k <= j; k += 1) {
        if (!isPhoneLikeToken(tokens[k].original)) {
          allPhoneLike = false;
          break;
        }
        combined += tokens[k].original;
      }

      if (!allPhoneLike) {
        continue;
      }

      const mobile = normalizeIndianMobile(combined);
      if (mobile) {
        return {
          mobile,
          span: { start: i, end: j }
        };
      }
    }
  }

  return { mobile: '', span: null };
}

function splitAliasTokens(alias: string): string[] {
  const normalized = normalizeWhitespace(alias);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(' ')
    .map((token) => trimTokenForMatching(token))
    .filter(Boolean);
}

function buildAliasEntries(catalog: LeadParserCatalog): AliasEntry[] {
  const entries: AliasEntry[] = [];
  const pushTerm = (kind: AliasEntry['kind'], term: ParserTerm) => {
    const allAliases = [term.canonical, ...term.aliases];
    for (const alias of allAliases) {
      const aliasTokens = splitAliasTokens(alias);
      if (!aliasTokens.length) {
        continue;
      }

      entries.push({
        kind,
        canonical: term.canonical,
        aliasTokens
      });
    }
  };

  catalog.courses.forEach((term) => pushTerm('course', term));
  catalog.leadQualities.forEach((term) => pushTerm('leadQuality', term));
  catalog.months.forEach((term) => pushTerm('month', term));

  entries.sort((a, b) => b.aliasTokens.length - a.aliasTokens.length);
  return entries;
}

function spanIsFree(used: boolean[], start: number, end: number): boolean {
  for (let i = start; i <= end; i += 1) {
    if (used[i]) {
      return false;
    }
  }

  return true;
}

function markSpan(used: boolean[], start: number, end: number) {
  for (let i = start; i <= end; i += 1) {
    used[i] = true;
  }
}

function matchAliasAt(
  tokens: Token[],
  index: number,
  aliasTokens: string[]
): boolean {
  if (index + aliasTokens.length > tokens.length) {
    return false;
  }

  for (let i = 0; i < aliasTokens.length; i += 1) {
    if (tokens[index + i].normalized !== aliasTokens[i]) {
      return false;
    }
  }

  return true;
}

function matchCommaSeparatedCourses(
  token: Token,
  aliasEntries: AliasEntry[]
): string[] {
  if (!token.original.includes(',')) {
    return [];
  }

  const parts = token.original
    .split(',')
    .map((part) => trimTokenForMatching(part))
    .filter(Boolean);

  if (parts.length < 2) {
    return [];
  }

  const courses: string[] = [];
  for (const part of parts) {
    const match = aliasEntries.find(
      (entry) =>
        entry.kind === 'course' &&
        entry.aliasTokens.length === 1 &&
        entry.aliasTokens[0] === part
    );

    // Only consume the token when every comma-delimited value is a course.
    // This keeps ordinary commas in names and notes untouched.
    if (!match) {
      return [];
    }

    if (!courses.includes(match.canonical)) {
      courses.push(match.canonical);
    }
  }

  return courses;
}

function isSimpleNameToken(token: string): boolean {
  if (!token) {
    return false;
  }

  for (let i = 0; i < token.length; i += 1) {
    const code = token.charCodeAt(i);
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    if (!isUpper && !isLower) {
      return false;
    }
  }

  return true;
}

function collectNameBefore(
  tokens: Token[],
  mobileSpan: Span,
  used: boolean[]
): Span | null {
  const indices: number[] = [];
  for (let i = mobileSpan.start - 1; i >= 0 && indices.length < 2; i -= 1) {
    if (used[i]) {
      break;
    }
    if (!isSimpleNameToken(tokens[i].normalized)) {
      break;
    }

    indices.push(i);
  }

  if (!indices.length) {
    return null;
  }

  return {
    start: indices[indices.length - 1],
    end: indices[0]
  };
}

function collectNameAfter(
  tokens: Token[],
  mobileSpan: Span,
  used: boolean[]
): Span | null {
  const indices: number[] = [];
  for (
    let i = mobileSpan.end + 1;
    i < tokens.length && indices.length < 2;
    i += 1
  ) {
    if (used[i]) {
      break;
    }
    if (!isSimpleNameToken(tokens[i].normalized)) {
      break;
    }

    indices.push(i);
  }

  if (!indices.length) {
    return null;
  }

  return {
    start: indices[0],
    end: indices[indices.length - 1]
  };
}

function spanToText(tokens: Token[], span: Span | null): string {
  if (!span) {
    return '';
  }

  return tokens
    .slice(span.start, span.end + 1)
    .map((token) => token.original)
    .join(' ')
    .trim();
}

function spanLength(span: Span | null): number {
  if (!span) {
    return 0;
  }

  return span.end - span.start + 1;
}

export function parseLeadMessage(
  rawMessage: string,
  catalog: LeadParserCatalog
): ParsedLeadMessage {
  const originalMessage = String(rawMessage || '').trim();
  const normalizedMessage = normalizeWhitespace(originalMessage);
  const tokens = toTokens(normalizedMessage);

  const used = new Array(tokens.length).fill(false);
  const mobileMatch = findMobile(tokens);
  if (mobileMatch.span) {
    markSpan(used, mobileMatch.span.start, mobileMatch.span.end);
  }

  const extracted = {
    courses: [] as string[],
    leadQuality: '',
    month: ''
  };

  const aliasEntries = buildAliasEntries(catalog);
  for (let i = 0; i < tokens.length; i += 1) {
    if (used[i]) {
      continue;
    }

    const commaSeparatedCourses = matchCommaSeparatedCourses(
      tokens[i],
      aliasEntries
    );
    if (commaSeparatedCourses.length) {
      commaSeparatedCourses.forEach((course) => {
        if (!extracted.courses.includes(course)) {
          extracted.courses.push(course);
        }
      });
      used[i] = true;
      continue;
    }

    for (const entry of aliasEntries) {
      if (entry.kind !== 'course' && extracted[entry.kind]) {
        continue;
      }

      const end = i + entry.aliasTokens.length - 1;
      if (!spanIsFree(used, i, end)) {
        continue;
      }

      if (!matchAliasAt(tokens, i, entry.aliasTokens)) {
        continue;
      }

      if (entry.kind === 'course') {
        if (!extracted.courses.includes(entry.canonical)) {
          extracted.courses.push(entry.canonical);
        }
      } else {
        extracted[entry.kind] = entry.canonical;
      }
      markSpan(used, i, end);
      break;
    }
  }

  let nameSpan: Span | null = null;
  if (mobileMatch.span) {
    const before = collectNameBefore(tokens, mobileMatch.span, used);
    const after = collectNameAfter(tokens, mobileMatch.span, used);

    if (before && after) {
      const beforeCount = spanLength(before);
      const afterCount = spanLength(after);

      // If text before mobile looks like longer context and text after looks like a compact name,
      // prefer the post-mobile candidate; otherwise keep before-mobile preference.
      if (beforeCount > 1 && afterCount === 1) {
        nameSpan = after;
      } else {
        nameSpan = before;
      }
    } else {
      nameSpan = before || after;
    }

    if (nameSpan) {
      markSpan(used, nameSpan.start, nameSpan.end);
    }
  }

  const notes = tokens
    .map((token, index) => ({ token, index }))
    .filter((item) => !used[item.index])
    .map((item) => item.token.original)
    .join(' ')
    .trim();

  return {
    mobile: mobileMatch.mobile,
    name: spanToText(tokens, nameSpan),
    course: extracted.courses.join(','),
    leadQuality: extracted.leadQuality,
    month: extracted.month,
    notes,
    originalMessage
  };
}
