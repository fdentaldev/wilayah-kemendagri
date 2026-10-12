import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SqlRow = {
  code: string;
  name: string;
};

export type Province = {
  id: string;
  name: string;
};

export type Regency = {
  id: string;
  province_id: string;
  name: string;
};

export type District = {
  id: string;
  regency_id: string;
  name: string;
};

export type Village = {
  id: string;
  district_id: string;
  name: string;
};

export type Collections = {
  provinces: Province[];
  regencies: Map<string, Regency[]>;
  districts: Map<string, District[]>;
  villages: Map<string, Village[]>;
};

export type OutputSummary = {
  provinces: number;
  regencies: number;
  districts: number;
  villages: number;
};

const projectDirectory = dirname(fileURLToPath(import.meta.url));
export const inputPath = resolve(projectDirectory, 'db/wilayah.sql');
export const outputDirectory = resolve(projectDirectory, 'dist');

function parseSqlString(input: string, start: number): { value: string; end: number } {
  if (input[start] !== "'") {
    throw new Error(`Expected SQL string at offset ${start}`);
  }

  let value = '';
  for (let index = start + 1; index < input.length; index += 1) {
    const character = input[index];
    if (character !== "'") {
      value += character;
      continue;
    }

    if (input[index + 1] === "'") {
      value += "'";
      index += 1;
      continue;
    }

    return { value, end: index + 1 };
  }

  throw new Error(`Unterminated SQL string at offset ${start}`);
}

export function parseSqlRows(sql: string): SqlRow[] {
  const rows: SqlRow[] = [];
  const tuplePattern = /\(\s*'/g;
  let match: RegExpExecArray | null;

  while ((match = tuplePattern.exec(sql)) !== null) {
    const codeStart = match.index + match[0].length - 1;
    const code = parseSqlString(sql, codeStart);
    let index = code.end;

    while (/\s/.test(sql[index] ?? '')) index += 1;
    if (sql[index] !== ',') continue;
    index += 1;
    while (/\s/.test(sql[index] ?? '')) index += 1;
    if (sql[index] !== "'") continue;

    const name = parseSqlString(sql, index);
    index = name.end;
    while (/\s/.test(sql[index] ?? '')) index += 1;
    if (sql[index] !== ')') continue;

    rows.push({ code: code.value, name: name.value });
  }

  return rows;
}

function normalizeCode(code: string): string {
  return code.replaceAll('.', '');
}

function parentCode(code: string): string | undefined {
  const lastSeparator = code.lastIndexOf('.');
  return lastSeparator === -1 ? undefined : code.slice(0, lastSeparator);
}

export function createCollections(rows: SqlRow[]): Collections {
  const seen = new Set<string>();
  const codes = new Set(rows.map((row) => row.code));
  const provinces: Province[] = [];
  const regencies = new Map<string, Regency[]>();
  const districts = new Map<string, District[]>();
  const villages = new Map<string, Village[]>();

  for (const row of rows) {
    const segments = row.code.split('.');
    if (segments.length < 1 || segments.length > 4 || segments.some((segment) => !/^\d+$/.test(segment))) {
      throw new Error(`Invalid wilayah code: ${row.code}`);
    }
    if (!row.name.trim()) throw new Error(`Empty wilayah name for code: ${row.code}`);

    const id = normalizeCode(row.code);
    if (seen.has(id)) throw new Error(`Duplicate wilayah code: ${row.code}`);
    seen.add(id);

    const parent = parentCode(row.code);
    if (parent && !codes.has(parent)) {
      throw new Error(`Missing parent ${parent} for wilayah ${row.code}`);
    }

    if (segments.length === 1) {
      provinces.push({ id, name: row.name });
    } else if (segments.length === 2) {
      const provinceId = normalizeCode(parent!);
      const items = regencies.get(provinceId) ?? [];
      items.push({ id, province_id: provinceId, name: row.name });
      regencies.set(provinceId, items);
      districts.set(id, []);
    } else if (segments.length === 3) {
      const regencyId = normalizeCode(parent!);
      const items = districts.get(regencyId) ?? [];
      items.push({ id, regency_id: regencyId, name: row.name });
      districts.set(regencyId, items);
      villages.set(id, []);
    } else {
      const districtId = normalizeCode(parent!);
      const items = villages.get(districtId) ?? [];
      items.push({ id, district_id: districtId, name: row.name });
      villages.set(districtId, items);
    }
  }

  const sortById = <T extends { id: string }>(items: T[]) => items.sort((a, b) => a.id.localeCompare(b.id));
  sortById(provinces);
  for (const items of regencies.values()) sortById(items);
  for (const items of districts.values()) sortById(items);
  for (const items of villages.values()) sortById(items);

  return { provinces, regencies, districts, villages };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, path);
}

export function summarizeCollections(collections: Collections): OutputSummary {
  return {
    provinces: collections.provinces.length,
    regencies: [...collections.regencies.values()].reduce((total, items) => total + items.length, 0),
    districts: [...collections.districts.values()].reduce((total, items) => total + items.length, 0),
    villages: [...collections.villages.values()].reduce((total, items) => total + items.length, 0),
  };
}

export async function writeCollections(collections: Collections, output = outputDirectory): Promise<void> {
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  await writeJson(join(output, 'provinces.json'), collections.provinces);
  for (const province of collections.provinces) {
    await writeJson(join(output, 'provinces', `${province.id}.json`), collections.regencies.get(province.id) ?? []);
  }
  for (const [regencyId, districts] of collections.districts) {
    await writeJson(join(output, 'regencies', `${regencyId}.json`), districts);
  }
  for (const [districtId, villages] of collections.villages) {
    await writeJson(join(output, 'districts', `${districtId}.json`), villages);
  }
}

export async function generate(): Promise<void> {
  const sql = await readFile(inputPath, 'utf8');
  const rows = parseSqlRows(sql);
  const collections = createCollections(rows);
  await writeCollections(collections);

  const summary = summarizeCollections(collections);
  console.log(
    `Generated ${rows.length} wilayah: ${summary.provinces} provinces, ` +
      `${summary.regencies} regencies, ${summary.districts} districts, ${summary.villages} villages.`,
  );
  console.log(`Output: ${outputDirectory}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  generate().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
