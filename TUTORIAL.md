# Tutorial Lengkap: Smart Souvenir – Sistem Inventori RFID
## Panduan dari Nol ke Produksi (Kali Linux + Docker)

---

## Daftar Isi

1. [Gambaran Arsitektur Sistem](#1-gambaran-arsitektur-sistem)
2. [Instalasi Docker di Kali Linux](#2-instalasi-docker-di-kali-linux)
3. [Struktur Direktori Proyek](#3-struktur-direktori-proyek)
4. [Setup Direktori dan File](#4-setup-direktori-dan-file)
5. [Manajemen Siklus Docker](#5-manajemen-siklus-docker)
6. [Pengujian A: Integration Test (API ↔ DB)](#6-pengujian-a-integration-test-api--db)
7. [Pengujian B: Stress Test 1000 Request](#7-pengujian-b-stress-test-1000-request)
8. [Pengujian C: Panduan Hoppscotch](#8-pengujian-c-panduan-hoppscotch)
9. [Troubleshooting Umum](#9-troubleshooting-umum)

---

## 1. Gambaran Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network: souvenir_net             │
│                                                             │
│  ┌─────────────┐    HTTP     ┌─────────────────────────┐   │
│  │  Frontend   │ ──────────▶ │   Backend API           │   │
│  │  (Nginx)    │   :3000     │   (Express.js Node.js)  │   │
│  │  Port:8080  │             │   Port:3000             │   │
│  └─────────────┘             └──────────┬──────────────┘   │
│                                         │ SQL               │
│  ┌─────────────┐    HTTP                ▼                   │
│  │ESP32        │ ──────────▶ ┌─────────────────────────┐   │
│  │Emulator     │  /rfid/tap  │   PostgreSQL DB          │   │
│  │(Node.js)    │             │   Port:5432              │   │
│  │Port:4000    │             │   smart_souvenir         │   │
│  └─────────────┘             └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Alur Data RFID (Sepenuhnya Software):

```
[Tombol di Browser]
       │
       ▼
[Frontend (Port 8080)]
       │  HTTP POST /simulate
       ▼
[ESP32 Emulator (Port 4000)]
       │  Generate UID acak (misal: A1B2C3D4)
       │  HTTP POST /rfid/tap { uid, timestamp }
       ▼
[Backend API (Port 3000)]
       │  Query: SELECT * FROM products WHERE uid = 'A1B2C3D4'
       ▼
[PostgreSQL (Port 5432)]
       │  Hasil: Nama produk, stok, harga
       ▼
[Respons JSON kembali ke Frontend]
```

---

## 2. Instalasi Docker di Kali Linux

### Langkah 2.1 – Perbarui repository sistem

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

### Langkah 2.2 – Install Docker Engine dan Docker Compose

```bash
sudo apt-get install -y docker.io docker-compose
```

### Langkah 2.3 – Aktifkan dan jalankan service Docker

```bash
# Aktifkan Docker agar berjalan otomatis saat boot
sudo systemctl enable docker

# Jalankan Docker sekarang
sudo systemctl start docker

# Verifikasi Docker berjalan
sudo systemctl status docker
```

Output yang diharapkan:
```
● docker.service - Docker Application Container Engine
     Loaded: loaded (/lib/systemd/system/docker.service; enabled)
     Active: active (running) since ...
```

### Langkah 2.4 – Tambahkan user ke grup docker (opsional, agar tidak perlu sudo)

```bash
# Tambahkan user Anda ke grup docker
sudo usermod -aG docker $USER

# WAJIB: Logout dan login kembali agar perubahan berlaku
# Atau gunakan perintah ini untuk session sekarang:
newgrp docker
```

### Langkah 2.5 – Verifikasi instalasi

```bash
# Cek versi Docker
docker --version
# Contoh output: Docker version 24.0.5, build 24.0.5-0kali1

# Cek versi Docker Compose
docker-compose --version
# Contoh output: docker-compose version 1.29.2

# Test dengan container hello-world
docker run hello-world
```

---

## 3. Struktur Direktori Proyek

```
~/smart-souvenir-software/
├── docker-compose.yml          # Orkestrator semua service
│
├── backend/                    # Express.js REST API
│   ├── Dockerfile
│   ├── package.json
│   └── server.js               # Server utama (semua endpoint)
│
├── database/
│   └── init.sql                # Schema PostgreSQL + seed data
│
├── esp32-emulator/             # Simulasi hardware ESP32
│   ├── Dockerfile
│   ├── package.json
│   └── emulator.js             # Server emulator RFID
│
├── frontend/
│   └── index.html              # SPA (Single Page Application)
│
└── nginx/
    └── nginx.conf              # Konfigurasi Nginx
```

---

## 4. Setup Direktori dan File

### Langkah 4.1 – Buat direktori utama proyek

```bash
# Buat semua direktori sekaligus
mkdir -p ~/smart-souvenir-software/{backend,database,esp32-emulator,frontend,nginx}

# Masuk ke direktori proyek
cd ~/smart-souvenir-software

# Verifikasi struktur direktori
ls -la
```

### Langkah 4.2 – Buat file docker-compose.yml

```bash
cd ~/smart-souvenir-software
nano docker-compose.yml
```

> Salin isi file `docker-compose.yml` dari proyek ke sini.
> Simpan: `Ctrl+O`, tekan `Enter`, lalu keluar: `Ctrl+X`

### Langkah 4.3 – Buat konfigurasi Nginx

```bash
nano ~/smart-souvenir-software/nginx/nginx.conf
```

> Salin isi file `nginx/nginx.conf` dari proyek.

### Langkah 4.4 – Buat file database

```bash
nano ~/smart-souvenir-software/database/init.sql
```

> Salin isi file `database/init.sql` dari proyek.

### Langkah 4.5 – Buat backend API

```bash
# Buat Dockerfile backend
nano ~/smart-souvenir-software/backend/Dockerfile

# Buat package.json backend
nano ~/smart-souvenir-software/backend/package.json

# Buat server utama (file terpanjang)
nano ~/smart-souvenir-software/backend/server.js
```

> Salin masing-masing konten file dari proyek.

### Langkah 4.6 – Buat ESP32 emulator

```bash
# Buat Dockerfile emulator
nano ~/smart-souvenir-software/esp32-emulator/Dockerfile

# Buat package.json emulator
nano ~/smart-souvenir-software/esp32-emulator/package.json

# Buat script emulator
nano ~/smart-souvenir-software/esp32-emulator/emulator.js
```

### Langkah 4.7 – Buat frontend

```bash
nano ~/smart-souvenir-software/frontend/index.html
```

> Salin isi file `frontend/index.html` (file HTML lengkap dengan Tailwind CSS).

### Langkah 4.8 – Verifikasi semua file sudah ada

```bash
cd ~/smart-souvenir-software

# Tampilkan seluruh struktur file
find . -type f | sort
```

Output yang diharapkan:
```
./backend/Dockerfile
./backend/package.json
./backend/server.js
./database/init.sql
./docker-compose.yml
./esp32-emulator/Dockerfile
./esp32-emulator/emulator.js
./esp32-emulator/package.json
./frontend/index.html
./nginx/nginx.conf
```

---

## 5. Manajemen Siklus Docker

### Langkah 5.1 – Build dan jalankan semua container

```bash
cd ~/smart-souvenir-software

# Build semua image dan jalankan di foreground (melihat log langsung)
docker-compose up --build

# ATAU: Jalankan di background (mode daemon / detached)
docker-compose up --build -d
```

Saat pertama kali, Docker akan:
1. Pull image `postgres:15-alpine` dan `nginx:1.25-alpine`
2. Build image `backend` dan `esp32-emulator` dari Dockerfile
3. Membuat network `smart_souvenir_network`
4. Membuat volume `smart_souvenir_pgdata`
5. Menjalankan semua 4 container

Output sukses (mode foreground):
```
smart_souvenir_db      | PostgreSQL init process complete; ready for start up.
smart_souvenir_api     | ╔══════════════════════════════════════════════╗
smart_souvenir_api     | ║     Smart Souvenir API - Backend Service     ║
smart_souvenir_api     | ╚══════════════════════════════════════════════╝
smart_souvenir_esp32   | ╔══════════════════════════════════════════════╗
smart_souvenir_esp32   | ║   Smart Souvenir - ESP32 RFID Emulator       ║
smart_souvenir_esp32   | ╚══════════════════════════════════════════════╝
```

### Langkah 5.2 – Cek status container

```bash
# Tampilkan status semua container dalam proyek
docker-compose ps
```

Output yang diharapkan:
```
          Name                        Command               State           Ports
------------------------------------------------------------------------------------------
smart_souvenir_api      dumb-init -- node server.js        Up      0.0.0.0:3000->3000/tcp
smart_souvenir_db       docker-entrypoint.sh postgres      Up      0.0.0.0:5432->5432/tcp
smart_souvenir_esp32    dumb-init -- node emulator.js      Up      0.0.0.0:4000->4000/tcp
smart_souvenir_frontend /docker-entrypoint.sh nginx ...   Up      0.0.0.0:8080->80/tcp
```

Semua container harus berstatus **Up**.

### Langkah 5.3 – Melihat log container untuk debugging

```bash
# Log semua container sekaligus
docker-compose logs

# Log container tertentu saja
docker-compose logs backend
docker-compose logs db
docker-compose logs esp32-emulator
docker-compose logs frontend

# Log real-time (follow/stream)
docker-compose logs -f backend

# Log 100 baris terakhir saja
docker-compose logs --tail=100 backend

# Log dengan timestamp
docker-compose logs -t backend
```

### Langkah 5.4 – Akses aplikasi di browser

Setelah semua container berjalan, buka browser dan akses:

| Service          | URL                          | Keterangan                    |
|------------------|------------------------------|-------------------------------|
| Frontend (UI)    | http://localhost:8080        | Dashboard utama               |
| Backend API      | http://localhost:3000/health | Health check API              |
| ESP32 Emulator   | http://localhost:4000/status | Status emulator               |
| API Docs         | http://localhost:3000/products | Daftar produk (JSON)        |

### Langkah 5.5 – Restart container tertentu

```bash
# Restart hanya backend (misal setelah update kode)
docker-compose restart backend

# Restart semua container
docker-compose restart
```

### Langkah 5.6 – Stop container (tanpa menghapus data)

```bash
# Hentikan semua container (data volume tetap aman)
docker-compose stop

# Jalankan kembali
docker-compose start
```

### Langkah 5.7 – Stop dan hapus container + network (data aman)

```bash
# Hapus container dan network, tapi VOLUME DATA TETAP ADA
docker-compose down
```

### Langkah 5.8 – Hapus semua termasuk data (reset total)

```bash
# PERHATIAN: Perintah ini menghapus SEMUA data database!
docker-compose down -v

# Untuk rebuild dari nol setelah perubahan kode besar
docker-compose down -v && docker-compose up --build -d
```

### Langkah 5.9 – Masuk ke shell container (untuk debugging lanjut)

```bash
# Masuk ke shell container backend
docker-compose exec backend sh

# Masuk ke shell PostgreSQL
docker-compose exec db psql -U admin -d smart_souvenir

# Jalankan query SQL langsung
docker-compose exec db psql -U admin -d smart_souvenir -c "SELECT * FROM products;"
```

---

## 6. Pengujian A: Integration Test (API ↔ DB)

### Tujuan
Memverifikasi bahwa container Backend dapat berkomunikasi dengan container PostgreSQL dan menjalankan query dengan benar.

### Langkah 6.1 – Test via Health Check Endpoint

```bash
# Cek health API (termasuk koneksi database)
curl -s http://localhost:3000/health | python3 -m json.tool
```

Output sukses:
```json
{
  "status": "ok",
  "service": "Smart Souvenir API",
  "database": "connected",
  "server_time": "2025-01-15T10:30:00.000Z",
  "pg_version": "PostgreSQL 15"
}
```

Jika `database: "disconnected"`, lanjut ke langkah berikut.

### Langkah 6.2 – Test koneksi dari dalam container backend

```bash
# Masuk ke shell container backend
docker-compose exec backend sh

# Di dalam container, test koneksi ke database
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  host: 'db', port: 5432,
  database: 'smart_souvenir',
  user: 'admin', password: 'admin123'
});
pool.query('SELECT COUNT(*) as jumlah FROM products')
  .then(r => { console.log('✓ Database terhubung! Jumlah produk:', r.rows[0].jumlah); process.exit(0); })
  .catch(e => { console.error('✗ Gagal:', e.message); process.exit(1); });
"

# Keluar dari container
exit
```

### Langkah 6.3 – Test query database langsung

```bash
# Masuk ke PostgreSQL
docker-compose exec db psql -U admin -d smart_souvenir

# Di dalam psql, jalankan query berikut:
\dt                          -- Tampilkan semua tabel
SELECT COUNT(*) FROM products;   -- Hitung produk
SELECT uid, name, stock FROM products LIMIT 5;  -- Lihat data
SELECT * FROM rfid_logs LIMIT 3; -- Lihat log RFID
\q                           -- Keluar dari psql
```

### Langkah 6.4 – Test endpoint API dengan curl

```bash
# Test GET /products
curl -s http://localhost:3000/products | python3 -m json.tool

# Test GET /inventory
curl -s http://localhost:3000/inventory | python3 -m json.tool

# Test POST /products (buat produk baru)
curl -s -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"uid":"TEST1234","name":"Produk Test","stock":50,"price":25000,"category":"Test"}' \
  | python3 -m json.tool

# Test PUT /stock (update stok)
curl -s -X PUT http://localhost:3000/stock \
  -H "Content-Type: application/json" \
  -d '{"uid":"TEST1234","quantity":10,"operation":"add"}' \
  | python3 -m json.tool

# Test POST /rfid/tap (simulasi ketukan RFID)
curl -s -X POST http://localhost:3000/rfid/tap \
  -H "Content-Type: application/json" \
  -d '{"uid":"A1B2C3D4","timestamp":"2025-01-15T10:30:00.000Z"}' \
  | python3 -m json.tool
```

### Langkah 6.5 – Test ESP32 Emulator

```bash
# Cek status emulator
curl -s http://localhost:4000/status | python3 -m json.tool

# Simulasikan ketukan kartu acak
curl -s -X POST http://localhost:4000/simulate \
  -H "Content-Type: application/json" \
  -d '{}' \
  | python3 -m json.tool

# Simulasikan ketukan dengan UID tertentu
curl -s -X POST http://localhost:4000/simulate \
  -H "Content-Type: application/json" \
  -d '{"uid":"A1B2C3D4"}' \
  | python3 -m json.tool
```

### Langkah 6.6 – Gunakan Integration Test di UI

Buka browser → `http://localhost:8080` → Tab **Pengujian** → Klik **Jalankan Integration Test**

Sistem akan otomatis menguji semua endpoint dan menampilkan status setiap pengujian secara visual.

---

## 7. Pengujian B: Stress Test 1000 Request

### Via UI (Cara Termudah)

1. Buka browser → `http://localhost:8080`
2. Klik tab **Pengujian**
3. Atur konfigurasi:
   - **Jumlah Request**: 1000
   - **Konkurensi**: 50 (50 request bersamaan)
4. Klik tombol **Mulai Stress Test**
5. Amati progress bar dan metrik real-time:
   - **Total Waktu**: Waktu total eksekusi
   - **Success Rate**: Persentase request berhasil
   - **Avg Response**: Rata-rata waktu respons per request
   - **Req/Detik**: Throughput server

### Via Terminal (Menggunakan Apache Benchmark)

```bash
# Install apache2-utils (berisi perintah ab)
sudo apt-get install -y apache2-utils

# Stress test 1000 request, 50 konkurensi
ab -n 1000 -c 50 http://localhost:3000/inventory

# Stress test 1000 request, 100 konkurensi (lebih intens)
ab -n 1000 -c 100 http://localhost:3000/inventory
```

Output `ab` yang diharapkan:
```
Requests per second:    450.23 [#/sec] (mean)
Time per request:       111.054 [ms] (mean)
Transfer rate:          215.45 [Kbytes/sec] received

Percentage of the requests served within a certain time (ms)
  50%     89
  75%    105
  90%    145
  95%    172
  99%    210
 100%    350 (longest request)
```

### Via Terminal (Menggunakan curl loop)

```bash
# Test 100 request berurutan dan ukur waktu
time for i in $(seq 1 100); do
  curl -s http://localhost:3000/inventory > /dev/null
done
```

### Interpretasi Hasil

| Metrik              | Baik        | Cukup        | Perlu Optimasi |
|---------------------|-------------|--------------|----------------|
| Success Rate        | 100%        | ≥ 99%        | < 99%          |
| Avg Response Time   | < 100ms     | < 300ms      | > 500ms        |
| Requests/Detik      | > 500       | > 100        | < 50           |

---

## 8. Pengujian C: Panduan Hoppscotch

### Persiapan

1. Buka browser, kunjungi https://hoppscotch.io
2. Tidak perlu instalasi – langsung berbasis web
3. Pastikan server berjalan: `docker-compose ps`

---

### Test 1: GET /products – Mengambil semua produk

```
Method : GET
URL    : http://localhost:3000/products
Headers: Content-Type: application/json
Body   : (kosong)
```

**Cara di Hoppscotch:**
1. Pilih method **GET**
2. Masukkan URL: `http://localhost:3000/products`
3. Klik **Send**

**Respons yang diharapkan (200 OK):**
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": 1,
      "uid": "A1B2C3D4",
      "name": "Gantungan Kunci Batik",
      "stock": 150,
      "price": "15000.00",
      "category": "Aksesori",
      "created_at": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

---

### Test 2: POST /products – Mendaftarkan produk baru

```
Method : POST
URL    : http://localhost:3000/products
Headers: Content-Type: application/json
```

**Request Body:**
```json
{
  "uid": "HOPPTEST1",
  "name": "Kain Tenun NTT",
  "stock": 20,
  "price": 450000,
  "category": "Pakaian",
  "description": "Kain tenun tradisional NTT motif asli"
}
```

**Cara di Hoppscotch:**
1. Pilih method **POST**
2. Masukkan URL: `http://localhost:3000/products`
3. Tab **Body** → pilih **JSON**
4. Paste JSON di atas
5. Klik **Send**

**Respons yang diharapkan (201 Created):**
```json
{
  "success": true,
  "message": "Produk \"Kain Tenun NTT\" berhasil didaftarkan dengan UID HOPPTEST1",
  "data": {
    "id": 11,
    "uid": "HOPPTEST1",
    "name": "Kain Tenun NTT",
    "stock": 20,
    "price": "450000.00",
    "category": "Pakaian"
  }
}
```

**Test kasus error (UID duplikat):**
```json
{
  "uid": "HOPPTEST1",
  "name": "Produk Lain"
}
```
Harus mengembalikan **409 Conflict**.

---

### Test 3: PUT /stock – Memperbarui stok

```
Method : PUT
URL    : http://localhost:3000/stock
Headers: Content-Type: application/json
```

**Request Body – Tambah stok:**
```json
{
  "uid": "HOPPTEST1",
  "quantity": 30,
  "operation": "add"
}
```

**Request Body – Kurangi stok:**
```json
{
  "uid": "HOPPTEST1",
  "quantity": 5,
  "operation": "subtract"
}
```

**Request Body – Set stok langsung:**
```json
{
  "uid": "HOPPTEST1",
  "quantity": 100,
  "operation": "set"
}
```

**Respons yang diharapkan (200 OK):**
```json
{
  "success": true,
  "message": "Stok \"Kain Tenun NTT\" berhasil ditambah 30",
  "previous_stock": 20,
  "data": {
    "uid": "HOPPTEST1",
    "name": "Kain Tenun NTT",
    "stock": 50
  }
}
```

---

### Test 4: GET /inventory – Status inventaris lengkap

```
Method : GET
URL    : http://localhost:3000/inventory
Headers: Content-Type: application/json
Body   : (kosong)
```

**Respons yang diharapkan (200 OK):**
```json
{
  "success": true,
  "summary": {
    "total_produk": "11",
    "total_stok": "605",
    "nilai_inventaris": "17850000.00",
    "produk_habis": "0",
    "stok_menipis": "2",
    "stok_aman": "9",
    "total_kategori": "6",
    "transaksi_hari_ini": "0",
    "omset_hari_ini": "0.00"
  },
  "data": [
    {
      "id": 1,
      "uid": "A1B2C3D4",
      "name": "Gantungan Kunci Batik",
      "stock": 150,
      "status": "Tersedia",
      "total_value": "2250000.00"
    }
  ]
}
```

---

### Test 5: POST /rfid/tap – Simulasi ketukan RFID

```
Method : POST
URL    : http://localhost:3000/rfid/tap
Headers: Content-Type: application/json
```

**Request Body (UID terdaftar):**
```json
{
  "uid": "A1B2C3D4",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "device": "ESP32-HOPPSCOTCH-TEST"
}
```

**Respons yang diharapkan – Produk ditemukan:**
```json
{
  "success": true,
  "found": true,
  "message": "Produk ditemukan: Gantungan Kunci Batik",
  "uid": "A1B2C3D4",
  "product": {
    "name": "Gantungan Kunci Batik",
    "stock": 150,
    "price": "15000.00",
    "status": "Tersedia"
  }
}
```

**Request Body (UID tidak terdaftar):**
```json
{
  "uid": "XXXXXXXX",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Respons yang diharapkan – Produk tidak ditemukan:**
```json
{
  "success": true,
  "found": false,
  "message": "UID \"XXXXXXXX\" belum terdaftar di sistem..."
}
```

---

### Test 6: POST /checkout – Proses transaksi kasir

```
Method : POST
URL    : http://localhost:3000/checkout
Headers: Content-Type: application/json
```

**Request Body:**
```json
{
  "items": [
    {
      "uid": "A1B2C3D4",
      "name": "Gantungan Kunci Batik",
      "quantity": 3,
      "price": 15000
    },
    {
      "uid": "E5F6G7H8",
      "name": "Kaos Wisata Bali",
      "quantity": 2,
      "price": 85000
    }
  ],
  "cashier": "Admin Hoppscotch"
}
```

**Respons yang diharapkan (201 Created):**
```json
{
  "success": true,
  "message": "Transaksi berhasil diproses!",
  "transaction_code": "TRX-1736934600000-AB12",
  "total_amount": 215000,
  "items_count": 2
}
```

---

## 9. Troubleshooting Umum

### Problem: Container tidak mau start

```bash
# Lihat log error detail
docker-compose logs --tail=50

# Rebuild dari awal
docker-compose down -v
docker-compose up --build -d
```

### Problem: "port is already allocated"

```bash
# Cek port yang digunakan
sudo netstat -tlnp | grep -E '3000|5432|4000|8080'

# Kill proses yang menggunakan port tersebut
sudo kill -9 $(sudo lsof -t -i:3000)
```

### Problem: Database tidak terinisialisasi

```bash
# Hapus volume dan recreate
docker-compose down -v
docker volume rm smart_souvenir_pgdata
docker-compose up --build -d

# Cek log PostgreSQL
docker-compose logs db
```

### Problem: Frontend tidak bisa akses API (CORS error)

```bash
# Pastikan backend berjalan
curl http://localhost:3000/health

# Cek CORS header
curl -I -X OPTIONS http://localhost:3000/products \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: GET"
```

### Problem: ESP32 emulator tidak bisa hubungi backend

```bash
# Test dari dalam container emulator
docker-compose exec esp32-emulator wget -qO- http://backend:3000/health

# Pastikan keduanya di network yang sama
docker network inspect smart_souvenir_network
```

### Perintah Berguna Lainnya

```bash
# Lihat semua image Docker
docker images

# Lihat semua container (termasuk yang mati)
docker ps -a

# Hapus image yang tidak terpakai
docker image prune -f

# Memonitor penggunaan resource container secara real-time
docker stats

# Export database sebagai backup
docker-compose exec db pg_dump -U admin smart_souvenir > backup.sql

# Restore database dari backup
cat backup.sql | docker-compose exec -T db psql -U admin -d smart_souvenir
```

---

## Ringkasan URL Akses Aplikasi

| Service           | URL                              | Keterangan              |
|-------------------|----------------------------------|-------------------------|
| Frontend UI       | http://localhost:8080            | Dashboard utama         |
| API Health        | http://localhost:3000/health     | Status API & DB         |
| Get Products      | http://localhost:3000/products   | Daftar produk (JSON)    |
| Inventory         | http://localhost:3000/inventory  | Status inventaris       |
| RFID Logs         | http://localhost:3000/rfid/logs  | Log ketukan RFID        |
| Transactions      | http://localhost:3000/transactions | Riwayat transaksi     |
| ESP32 Status      | http://localhost:4000/status     | Status emulator         |
| Database          | localhost:5432                   | PostgreSQL (psql/DBeaver)|

---

*Tutorial ini dibuat untuk proyek Smart Souvenir Inventory Service + RFID Tagging.*
*Semua komponen berjalan 100% secara software di dalam Docker – tanpa hardware fisik.*
