# Wilayah Kemendagri

Generator data wilayah Indonesia dari dump SQL Kemendagri menjadi file JSON statis. Hasil generate disusun berdasarkan pola struktur data wilayah seperti project [emsifa](https://github.com/emsifa/api-wilayah-indonesia).

## Fitur

- Membaca data dari `db/wilayah.sql`.
- Menghasilkan JSON statis tanpa membutuhkan database runtime.
- Menghapus tanda titik dari kode wilayah.
  - `33` → `33`
  - `33.01` → `3301`
  - `33.01.01` → `330101`
- Mengelompokkan data berdasarkan tingkatan wilayah.
- Validasi kode, nama, kode duplikat, dan parent wilayah.
- Output deterministik dan diurutkan berdasarkan ID.
- GitHub Actions untuk generate dan sinkronisasi ke Cloudflare R2.

## Persyaratan

- Node.js 22 atau lebih baru
- pnpm 11 atau lebih baru

Versi package manager project ditetapkan pada `pnpm@11.10.0`.

## Instalasi

```bash
pnpm install
```

## Generate JSON

Pastikan file sumber tersedia di:

```text
db/wilayah.sql
```

Jalankan generator:

```bash
pnpm generate
```

Folder `dist/` akan dibuat ulang setiap kali generator dijalankan.

## Struktur Output

Contoh struktur output:

```text
dist/
├── provinces.json
├── regencies/
│   ├── 11.json
│   ├── 12.json
│   └── 33.json
├── districts/
│   ├── 3301.json
│   └── 3302.json
└── villages/
    ├── 330101.json
    └── 330102.json
```

### `provinces.json`

Berisi seluruh provinsi:

```json
[
  {
    "id": "33",
    "name": "Jawa Tengah"
  }
]
```

### Endpoint kompatibel Emsifa

Struktur file mengikuti endpoint API Wilayah Indonesia Emsifa. Setiap file di dalam folder berisi daftar wilayah turunan dari ID pada nama file.

### `regencies/{provinceId}.json`

Berisi seluruh kabupaten/kota di dalam provinsi:

```json
[
  {
    "id": "3301",
    "province_id": "33",
    "name": "Kabupaten Cilacap"
  }
]
```

### `districts/{regencyId}.json`

Berisi seluruh kecamatan di dalam kabupaten/kota:

```json
[
  {
    "id": "330101",
    "regency_id": "3301",
    "name": "Dayeuhluhur"
  }
]
```

### `villages/{districtId}.json`

Berisi seluruh desa/kelurahan di dalam kecamatan:

```json
[
  {
    "id": "3301012001",
    "district_id": "330101",
    "name": "Danasri"
  }
]
```

## Validasi dan Test

Menjalankan pemeriksaan TypeScript:

```bash
pnpm typecheck
```

Menjalankan test parser dan struktur output:

```bash
pnpm test
```

Menjalankan seluruh pemeriksaan:

```bash
pnpm check
```

Menjalankan pemeriksaan lalu generate:

```bash
pnpm generate:check
```

## GitHub Actions

Workflow [`.github/workflows/generate-and-sync-r2.yml`](.github/workflows/generate-and-sync-r2.yml) berjalan ketika:

- Ada push ke branch `main`.
- Workflow dijalankan secara manual melalui menu **Actions** di GitHub.

Workflow tersebut akan:

1. Checkout repository.
2. Menginstall dependency.
3. Menjalankan `pnpm generate`.
4. Mengunggah hasil `dist/` sebagai artifact sementara.
5. Menyalin isi `dist/` ke prefix `wilayah/` di Cloudflare R2 menggunakan `rclone`.
6. Menghapus object di prefix tersebut yang sudah tidak ada di `dist/` menggunakan `rclone sync`.

### GitHub Secrets

Tambahkan secrets berikut pada repository GitHub melalui **Settings → Secrets and variables → Actions**:

| Secret | Keterangan |
| --- | --- |
| `R2_ACCOUNT_ID` | Account ID Cloudflare |
| `R2_BUCKET_NAME` | Nama bucket R2 tujuan |
| `R2_ACCESS_KEY_ID` | Access Key ID R2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key R2 |

Buat API token R2 dengan izin yang cukup untuk membaca dan menulis object pada bucket tujuan. Jangan menyimpan credential R2 di repository atau file `.env` yang di-commit.

## Menjalankan Workflow Manual

1. Buka tab **Actions** pada repository GitHub.
2. Pilih workflow **Generate and Sync JSON to R2**.
3. Klik **Run workflow**.
4. Pilih branch `main`.
5. Klik **Run workflow**.

## Sumber Data

Data utama berasal dari file `db/wilayah.sql`, yaitu dump data kode wilayah berdasarkan Kepmendagri yang tercantum pada file sumber tersebut. Periksa dan sesuaikan atribusi atau pembaruan data sesuai distribusi sumber aslinya.

## Lisensi

Kode project ini menggunakan [MIT License](LICENSE).

Lisensi dan ketentuan distribusi data sumber mengikuti ketentuan yang tercantum pada sumber data masing-masing.
