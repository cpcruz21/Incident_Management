import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const dataDir = process.env.SMAC_DATA_DIR || path.join(process.cwd(), 'data');

export function dataFile(category: string, filename: string): string {
  return path.join(dataDir, category, filename);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

export function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

export function readCategory<T>(category: string, filename: string, fallback: T): T {
  const current = readJson<T | undefined>(dataFile(category, filename), undefined);
  if (current !== undefined) return current;
  const legacy = readJson<T | undefined>(dataFile('', filename), undefined);
  if (legacy === undefined) return fallback;
  writeJson(dataFile(category, filename), legacy);
  return legacy;
}
