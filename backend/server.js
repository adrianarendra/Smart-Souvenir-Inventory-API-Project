'use strict';

// ============================================================
// Smart Souvenir REST API - Backend Service
// Express.js + PostgreSQL
// ============================================================

const express  = require('express');
const { Pool } = require('pg');
const cors     = require('cors');
const morgan   = require('morgan');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middleware Configuration
// ============================================================
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('[:date[iso]] :method :url :status :response-time ms'));

// ============================================================
// PostgreSQL Connection Pool
// ============================================================
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'smart_souvenir',
  user:     process.env.DB_USER     || 'admin',
  password: process.env.DB_PASSWORD || 'admin123',
  max:      20,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// ============================================================
// Utility: DB query wrapper with error context
// ============================================================
async function dbQuery(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB] ${duration}ms | ${text.substring(0, 80)}`);
    }
    return result;
  } catch (err) {
    console.error(`[DB ERROR] Query failed: ${err.message}`);
    throw err;
  }
}

// ============================================================
// ROUTE: Health Check
// ============================================================
app.get('/health', async (req, res) => {
  try {
    const result = await dbQuery('SELECT NOW() as server_time, version() as pg_version');
    res.json({
      status:      'ok',
      service:     'Smart Souvenir API',
      database:    'connected',
      server_time: result.rows[0].server_time,
      pg_version:  result.rows[0].pg_version.split(' ').slice(0, 2).join(' '),
      uptime_sec:  Math.floor(process.uptime()),
      timestamp:   new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status:    'error',
      service:   'Smart Souvenir API',
      database:  'disconnected',
      error:     err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================
// ROUTE: GET /products
// Mengambil semua produk yang terdaftar
// ============================================================
app.get('/products', async (req, res) => {
  try {
    const { category, search } = req.query;

    let query  = 'SELECT * FROM products';
    const params = [];
    const conditions = [];

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR uid ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY created_at DESC';

    const result = await dbQuery(query, params);

    res.json({
      success: true,
      count:   result.rows.length,
      data:    result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /products
// Mendaftarkan produk baru dan memetakannya ke UID RFID
// Body: { uid, name, stock, price, category, description }
// ============================================================
app.post('/products', async (req, res) => {
  const { uid, name, stock, price, category, description } = req.body;

  // Validasi input wajib
  if (!uid || !name) {
    return res.status(400).json({
      success: false,
      error:   'UID RFID dan Nama Produk wajib diisi'
    });
  }

  // Validasi format UID (alphanumeric, 4-20 karakter)
  if (!/^[A-Za-z0-9]{4,20}$/.test(uid)) {
    return res.status(400).json({
      success: false,
      error:   'Format UID tidak valid. Gunakan 4-20 karakter alfanumerik'
    });
  }

  if (stock !== undefined && (isNaN(stock) || Number(stock) < 0)) {
    return res.status(400).json({ success: false, error: 'Stok harus berupa angka positif' });
  }

  if (price !== undefined && (isNaN(price) || Number(price) < 0)) {
    return res.status(400).json({ success: false, error: 'Harga harus berupa angka positif' });
  }

  try {
    // Cek apakah UID sudah terdaftar (1 UID = 1 Produk, permanent)
    const existing = await dbQuery('SELECT id, name FROM products WHERE uid = $1', [uid.toUpperCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error:   `UID "${uid.toUpperCase()}" sudah terdaftar untuk produk "${existing.rows[0].name}". Setiap UID hanya boleh dipetakan ke 1 produk.`
      });
    }

    const result = await dbQuery(
      `INSERT INTO products (uid, name, stock, price, category, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        uid.toUpperCase(),
        name.trim(),
        parseInt(stock) || 0,
        parseFloat(price) || 0,
        (category || 'Umum').trim(),
        (description || '').trim()
      ]
    );

    console.log(`[PRODUCTS] Produk baru terdaftar: ${name} (UID: ${uid.toUpperCase()})`);

    res.status(201).json({
      success: true,
      message: `Produk "${name}" berhasil didaftarkan dengan UID ${uid.toUpperCase()}`,
      data:    result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: PUT /products/:id
// Memperbarui detail produk (nama, harga, kategori, deskripsi)
// ============================================================
app.put('/products/:id', async (req, res) => {
  const { id }                              = req.params;
  const { name, price, category, description } = req.body;

  if (!name && price === undefined && !category && !description) {
    return res.status(400).json({ success: false, error: 'Tidak ada data yang diperbarui' });
  }

  try {
    const result = await dbQuery(
      `UPDATE products
       SET name        = COALESCE($1, name),
           price       = COALESCE($2, price),
           category    = COALESCE($3, category),
           description = COALESCE($4, description)
       WHERE id = $5
       RETURNING *`,
      [
        name   ? name.trim()          : null,
        price  !== undefined ? parseFloat(price) : null,
        category ? category.trim()    : null,
        description !== undefined ? description.trim() : null,
        parseInt(id)
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Produk tidak ditemukan' });
    }

    res.json({
      success: true,
      message: 'Data produk berhasil diperbarui',
      data:    result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: DELETE /products/:id
// Menghapus produk dari sistem
// ============================================================
app.delete('/products/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await dbQuery(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [parseInt(id)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Produk tidak ditemukan' });
    }

    console.log(`[PRODUCTS] Produk dihapus: ID=${id}, Nama=${result.rows[0].name}`);

    res.json({
      success: true,
      message: `Produk "${result.rows[0].name}" berhasil dihapus`,
      data:    result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: PUT /stock
// Memperbarui atau mengurangi stok inventaris
// Body: { uid, quantity, operation: 'add' | 'subtract' | 'set' }
// ============================================================
app.put('/stock', async (req, res) => {
  const { uid, quantity, operation } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: 'UID wajib diisi' });
  }
  if (quantity === undefined || quantity === null || isNaN(quantity)) {
    return res.status(400).json({ success: false, error: 'Kuantitas wajib diisi dan berupa angka' });
  }
  if (Number(quantity) < 0) {
    return res.status(400).json({ success: false, error: 'Kuantitas tidak boleh negatif' });
  }

  const op  = (operation || 'set').toLowerCase();
  const qty = parseInt(quantity);

  if (!['add', 'subtract', 'set'].includes(op)) {
    return res.status(400).json({
      success: false,
      error:   'Operasi tidak valid. Gunakan: add, subtract, atau set'
    });
  }

  try {
    // Ambil data produk saat ini
    const current = await dbQuery('SELECT * FROM products WHERE uid = $1', [uid.toUpperCase()]);
    if (current.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error:   `Produk dengan UID "${uid.toUpperCase()}" tidak ditemukan`
      });
    }

    const product       = current.rows[0];
    const currentStock  = product.stock;

    // Validasi stok untuk operasi subtract
    if (op === 'subtract' && currentStock < qty) {
      return res.status(400).json({
        success: false,
        error:   `Stok tidak mencukupi. Stok tersedia: ${currentStock}, diminta: ${qty}`
      });
    }

    let queryStr;
    if (op === 'add')      queryStr = 'UPDATE products SET stock = stock + $1 WHERE uid = $2 RETURNING *';
    else if (op === 'subtract') queryStr = 'UPDATE products SET stock = stock - $1 WHERE uid = $2 RETURNING *';
    else                   queryStr = 'UPDATE products SET stock = $1 WHERE uid = $2 RETURNING *';

    const result = await dbQuery(queryStr, [qty, uid.toUpperCase()]);

    const opLabel = op === 'add' ? 'ditambah' : op === 'subtract' ? 'dikurangi' : 'diatur ke';
    console.log(`[STOCK] Stok ${product.name} ${opLabel} ${qty}. Sebelum: ${currentStock}, Sesudah: ${result.rows[0].stock}`);

    res.json({
      success:       true,
      message:       `Stok "${product.name}" berhasil ${opLabel} ${qty}`,
      previous_stock: currentStock,
      data:          result.rows[0]
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: GET /inventory
// Melihat status stok dan ketersediaan lengkap
// ============================================================
app.get('/inventory', async (req, res) => {
  try {
    // Detail per produk dengan status ketersediaan
    const detail = await dbQuery(`
      SELECT
        p.id,
        p.uid,
        p.name,
        p.stock,
        p.price,
        p.category,
        p.description,
        p.created_at,
        p.updated_at,
        CASE
          WHEN p.stock = 0    THEN 'Habis'
          WHEN p.stock <= 10  THEN 'Stok Menipis'
          ELSE                     'Tersedia'
        END                        AS status,
        (p.stock * p.price)        AS total_value,
        CASE
          WHEN p.stock = 0    THEN 0
          WHEN p.stock <= 10  THEN 1
          ELSE                     2
        END                        AS status_priority
      FROM products p
      ORDER BY status_priority ASC, p.name ASC
    `);

    // Ringkasan inventaris
    const summary = await dbQuery(`
      SELECT
        COUNT(*)                                             AS total_produk,
        COALESCE(SUM(stock), 0)                            AS total_stok,
        COALESCE(SUM(stock * price), 0)                    AS nilai_inventaris,
        COUNT(CASE WHEN stock = 0   THEN 1 END)            AS produk_habis,
        COUNT(CASE WHEN stock > 0 AND stock <= 10 THEN 1 END) AS stok_menipis,
        COUNT(CASE WHEN stock > 10  THEN 1 END)            AS stok_aman,
        COUNT(DISTINCT category)                           AS total_kategori
      FROM products
    `);

    // Jumlah transaksi hari ini
    const todayTx = await dbQuery(`
      SELECT COUNT(*) AS transaksi_hari_ini,
             COALESCE(SUM(total_amount), 0) AS omset_hari_ini
      FROM transactions
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    res.json({
      success:  true,
      summary: {
        ...summary.rows[0],
        ...todayTx.rows[0]
      },
      data:     detail.rows,
      generated_at: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /rfid/tap
// Menerima data ketukan kartu RFID dari ESP32 emulator
// Body: { uid, timestamp, device }
// ============================================================
app.post('/rfid/tap', async (req, res) => {
  const { uid, timestamp, device } = req.body;

  if (!uid) {
    return res.status(400).json({ success: false, error: 'UID wajib diisi' });
  }

  const tapTime  = timestamp ? new Date(timestamp) : new Date();
  const deviceId = device || 'ESP32-EMULATOR';

  try {
    // Cari produk berdasarkan UID
    const result = await dbQuery(
      'SELECT * FROM products WHERE uid = $1',
      [uid.toUpperCase()]
    );

    const productName = result.rows.length > 0 ? result.rows[0].name : null;

    // Simpan log RFID
    await dbQuery(
      `INSERT INTO rfid_logs (uid, timestamp, action, device, product_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [uid.toUpperCase(), tapTime, 'tap', deviceId, productName]
    );

    console.log(`[RFID TAP] UID=${uid.toUpperCase()} | Device=${deviceId} | Produk=${productName || 'Tidak terdaftar'}`);

    if (result.rows.length === 0) {
      return res.json({
        success:  true,
        found:    false,
        message:  `UID "${uid.toUpperCase()}" belum terdaftar di sistem. Silakan daftarkan terlebih dahulu melalui menu Inventori.`,
        uid:      uid.toUpperCase(),
        timestamp: tapTime.toISOString(),
        device:   deviceId
      });
    }

    const product = result.rows[0];
    res.json({
      success:   true,
      found:     true,
      message:   `Produk ditemukan: ${product.name}`,
      uid:       uid.toUpperCase(),
      timestamp: tapTime.toISOString(),
      device:    deviceId,
      product:   {
        id:          product.id,
        uid:         product.uid,
        name:        product.name,
        stock:       product.stock,
        price:       product.price,
        category:    product.category,
        description: product.description,
        status:      product.stock === 0 ? 'Habis' : product.stock <= 10 ? 'Stok Menipis' : 'Tersedia'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: GET /rfid/logs
// Riwayat ketukan kartu RFID (50 data terbaru)
// ============================================================
app.get('/rfid/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const result = await dbQuery(
      `SELECT l.*, p.stock as current_stock
       FROM rfid_logs l
       LEFT JOIN products p ON l.uid = p.uid
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      success: true,
      count:   result.rows.length,
      data:    result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: POST /checkout
// Memproses transaksi kasir dan mengurangi stok
// Body: { items: [{ uid, name, quantity, price }] }
// ============================================================
app.post('/checkout', async (req, res) => {
  const { items, cashier } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Keranjang belanja kosong' });
  }

  // Validasi setiap item
  for (const item of items) {
    if (!item.uid || !item.quantity || item.quantity <= 0) {
      return res.status(400).json({
        success: false,
        error:   `Data item tidak lengkap: UID="${item.uid}", Qty=${item.quantity}`
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      // Lock baris untuk menghindari race condition
      const stockCheck = await client.query(
        'SELECT id, name, stock, price FROM products WHERE uid = $1 FOR UPDATE',
        [item.uid.toUpperCase()]
      );

      if (stockCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          error:   `Produk dengan UID "${item.uid}" tidak ditemukan`
        });
      }

      const product = stockCheck.rows[0];

      if (product.stock < item.quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error:   `Stok "${product.name}" tidak mencukupi. Tersedia: ${product.stock}, diminta: ${item.quantity}`
        });
      }

      // Kurangi stok
      await client.query(
        'UPDATE products SET stock = stock - $1 WHERE uid = $2',
        [item.quantity, item.uid.toUpperCase()]
      );

      const itemTotal = parseFloat(product.price) * item.quantity;
      totalAmount += itemTotal;

      processedItems.push({
        uid:        item.uid.toUpperCase(),
        name:       product.name,
        quantity:   item.quantity,
        unit_price: parseFloat(product.price),
        subtotal:   itemTotal
      });
    }

    // Generate kode transaksi unik
    const transactionCode = `TRX-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const txResult = await client.query(
      `INSERT INTO transactions (transaction_code, total_amount, items, cashier)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [transactionCode, totalAmount, JSON.stringify(processedItems), cashier || 'Admin']
    );

    await client.query('COMMIT');

    console.log(`[CHECKOUT] Transaksi ${transactionCode} berhasil. Total: Rp${totalAmount.toLocaleString('id-ID')}, ${processedItems.length} item`);

    res.status(201).json({
      success:          true,
      message:          'Transaksi berhasil diproses!',
      transaction_code: transactionCode,
      total_amount:     totalAmount,
      items_count:      processedItems.length,
      items:            processedItems,
      created_at:       txResult.rows[0].created_at
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[CHECKOUT ERROR]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// ROUTE: GET /transactions
// Riwayat transaksi (20 terbaru)
// ============================================================
app.get('/transactions', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await dbQuery(
      'SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1',
      [limit]
    );

    const totalResult = await dbQuery(
      'SELECT COUNT(*) AS total, COALESCE(SUM(total_amount), 0) AS grand_total FROM transactions'
    );

    res.json({
      success:     true,
      count:       result.rows.length,
      total_all:   totalResult.rows[0].total,
      grand_total: totalResult.rows[0].grand_total,
      data:        result.rows
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROUTE: GET /stats
// Statistik dashboard
// ============================================================
app.get('/stats', async (req, res) => {
  try {
    const stats = await dbQuery(`
      SELECT
        (SELECT COUNT(*) FROM products)                                AS total_produk,
        (SELECT COALESCE(SUM(stock), 0) FROM products)                AS total_stok,
        (SELECT COUNT(*) FROM products WHERE stock = 0)               AS produk_habis,
        (SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= 10) AS stok_menipis,
        (SELECT COUNT(*) FROM transactions WHERE DATE(created_at) = CURRENT_DATE) AS transaksi_hari_ini,
        (SELECT COALESCE(SUM(total_amount), 0) FROM transactions WHERE DATE(created_at) = CURRENT_DATE) AS omset_hari_ini,
        (SELECT COUNT(*) FROM rfid_logs WHERE DATE(created_at) = CURRENT_DATE) AS tap_hari_ini
    `);

    res.json({ success: true, data: stats.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// Error handling middleware
// ============================================================
app.use((err, req, res, next) => {
  console.error('[UNHANDLED ERROR]', err.stack);
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error:   `Endpoint "${req.method} ${req.url}" tidak ditemukan`
  });
});

// ============================================================
// Start Server
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     Smart Souvenir API - Backend Service     ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  Berjalan di port : ${PORT}                        ║`);
  console.log(`║  Database host    : ${process.env.DB_HOST || 'localhost'}               ║`);
  console.log(`║  Environment      : ${process.env.NODE_ENV || 'development'}            ║`);
  console.log('╚══════════════════════════════════════════════╝');
});

module.exports = app;
