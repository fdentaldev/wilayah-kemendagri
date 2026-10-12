import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCollections, parseSqlRows, summarizeCollections, writeCollections } from '../generate.ts';

const fixture = `
INSERT INTO wilayah (kode, nama) VALUES
('33','Jawa Tengah'),
('33.01','Kabupaten Cilacap'),
('33.01.01','Dayeuhluhur'),
('33.01.01.2001','Danasri'),
('33.01.01.2002','Pasi Kuala Ba''u'),
('33.02','Kabupaten Banyumas');
`;

test('parses SQL strings and unescapes apostrophes', () => {
  assert.deepEqual(parseSqlRows(fixture), [
    { code: '33', name: 'Jawa Tengah' },
    { code: '33.01', name: 'Kabupaten Cilacap' },
    { code: '33.01.01', name: 'Dayeuhluhur' },
    { code: '33.01.01.2001', name: 'Danasri' },
    { code: '33.01.01.2002', name: "Pasi Kuala Ba'u" },
    { code: '33.02', name: 'Kabupaten Banyumas' },
  ]);
});

test('creates emsifa-style collections with dotted codes removed', () => {
  const collections = createCollections(parseSqlRows(fixture));

  assert.deepEqual(summarizeCollections(collections), {
    provinces: 1,
    regencies: 2,
    districts: 1,
    villages: 2,
  });
  assert.deepEqual(collections.provinces, [{ id: '33', name: 'Jawa Tengah' }]);
  assert.deepEqual(collections.regencies.get('33'), [
    { id: '3301', province_id: '33', name: 'Kabupaten Cilacap' },
    { id: '3302', province_id: '33', name: 'Kabupaten Banyumas' },
  ]);
  assert.deepEqual(collections.districts.get('3301'), [
    { id: '330101', regency_id: '3301', name: 'Dayeuhluhur' },
  ]);
  assert.deepEqual(collections.villages.get('330101'), [
    { id: '3301012001', district_id: '330101', name: 'Danasri' },
    { id: '3301012002', district_id: '330101', name: "Pasi Kuala Ba'u" },
  ]);
});

test('rejects rows whose parent is missing', () => {
  assert.throws(
    () => createCollections([{ code: '33.01', name: 'Kabupaten Cilacap' }]),
    /Missing parent 33 for wilayah 33\.01/,
  );
});

test('writes files grouped by parent', async () => {
  const output = await mkdtemp(join(tmpdir(), 'wilayah-test-'));
  try {
    await writeCollections(createCollections(parseSqlRows(fixture)), output);

    assert.deepEqual(JSON.parse(await readFile(join(output, 'provinces.json'), 'utf8')), [
      { id: '33', name: 'Jawa Tengah' },
    ]);
    assert.deepEqual(JSON.parse(await readFile(join(output, 'regencies/33.json'), 'utf8')), [
      { id: '3301', province_id: '33', name: 'Kabupaten Cilacap' },
      { id: '3302', province_id: '33', name: 'Kabupaten Banyumas' },
    ]);
    assert.deepEqual(JSON.parse(await readFile(join(output, 'districts/3301.json'), 'utf8')), [
      { id: '330101', regency_id: '3301', name: 'Dayeuhluhur' },
    ]);
    assert.deepEqual(JSON.parse(await readFile(join(output, 'villages/330101.json'), 'utf8')), [
      { id: '3301012001', district_id: '330101', name: 'Danasri' },
      { id: '3301012002', district_id: '330101', name: "Pasi Kuala Ba'u" },
    ]);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
