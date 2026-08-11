import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseEnvText(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    if (key) {
      values[key] = trimmed.slice(separator + 1).trim();
    }
  }
  return values;
}

export function loadEnv(cwd = process.cwd()) {
  const values = {};
  for (const filename of ['.env', '.env.local']) {
    const fullPath = resolve(cwd, filename);
    if (existsSync(fullPath)) {
      Object.assign(values, parseEnvText(readFileSync(fullPath, 'utf8')));
    }
  }
  return { ...values, ...process.env };
}
