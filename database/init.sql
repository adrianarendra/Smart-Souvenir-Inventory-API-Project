-- ============================================================
-- Smart Souvenir Database Initialization Script
-- PostgreSQL 15
-- ============================================================

-- ============================================================
-- TABLE: products
-- Menyimpan produk souvenir yang dipetakan ke UID RFID
-- 1 UID = 1 Produk (bukan per-item)
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    uid         VARCHAR(50)     UNIQUE NOT NULL,
    name        VARCHAR(255)    NOT NULL,
    stock       INTEGER         NOT NULL DEFAULT 0 CHECK (stock >= 0),
    price       DECIMAL(12, 2)  NOT NULL DEFAULT 0 CHECK (price >= 0),
    category    VARCHAR(100)    NOT NULL DEFAULT 'Umum',
    description TEXT,
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: rfid_logs
-- Menyimpan semua log ketukan kartu RFID dari ESP32 emulator
-- ============================================================
CREATE TABLE IF NOT EXISTS rfid_logs (
    id          SERIAL PRIMARY KEY,
    uid         VARCHAR(50)     NOT NULL,
    timestamp   TIMESTAMP       NOT NULL,
    action      VARCHAR(50)     NOT NULL DEFAULT 'tap',
    device      VARCHAR(100)    DEFAULT 'ESP32-EMULATOR',
    product_name VARCHAR(255),
    created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- TABLE: transactions
-- Menyimpan riwayat transaksi kasir
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id               SERIAL PRIMARY KEY,
    transaction_code VARCHAR(50)     UNIQUE NOT NULL,
    total_amount     DECIMAL(12, 2)  NOT NULL DEFAULT 0,
    items            JSONB           NOT NULL,
    cashier          VARCHAR(100)    DEFAULT 'Admin',
    created_at       TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- FUNCTION & TRIGGER: auto-update updated_at on products
-- ============================================================
CREATE OR REPLACE FUNCTION fn_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION fn_update_timestamp();

-- ============================================================
-- INDEXES: untuk performa query
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_uid      ON products(uid);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_rfid_logs_uid     ON rfid_logs(uid);
CREATE INDEX IF NOT EXISTS idx_rfid_logs_ts      ON rfid_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_code ON transactions(transaction_code);
CREATE INDEX IF NOT EXISTS idx_transactions_ts   ON transactions(created_at DESC);

-- ============================================================
-- SEED DATA: Produk souvenir contoh
-- ============================================================
INSERT INTO products (uid, name, stock, price, category, description) VALUES
    ('A1B2C3D4', 'Gantungan Kunci Batik',    150, 15000.00,  'Aksesori',   'Gantungan kunci motif batik Jawa premium'),
    ('E5F6G7H8', 'Kaos Wisata Bali',          60, 85000.00,  'Pakaian',    'Kaos katun 30s sablon khas Bali'),
    ('I9J0K1L2', 'Miniatur Candi Borobudur',  35, 150000.00, 'Patung',     'Miniatur resin detail tinggi 15cm'),
    ('M3N4O5P6', 'Kipas Bambu Ukir',          90, 35000.00,  'Aksesori',   'Kipas bambu dengan ukiran tradisional'),
    ('Q7R8S9T0', 'Tas Rajut Tradisional',     25, 120000.00, 'Tas',        'Tas rajut motif nusantara handmade'),
    ('U1V2W3X4', 'Batik Tulis Pekalongan',    20, 350000.00, 'Pakaian',    'Kain batik tulis asli Pekalongan 2m'),
    ('Y5Z6A7B8', 'Keramik Gerabah Yogya',     45, 75000.00,  'Dekorasi',   'Gerabah tradisional buatan tangan'),
    ('C9D0E1F2', 'Gelang Perak Bali',         80, 95000.00,  'Aksesori',   'Gelang perak Sterling 925 khas Bali'),
    ('G3H4I5J6', 'Wayang Kulit Mini',         15, 200000.00, 'Kesenian',   'Wayang kulit mini kulit sapi asli'),
    ('K7L8M9N0', 'Topi Anyaman Lombok',       55, 55000.00,  'Pakaian',    'Topi anyaman pandan dari Lombok')
ON CONFLICT (uid) DO NOTHING;

-- ============================================================
-- SEED DATA: Contoh log RFID (opsional)
-- ============================================================
INSERT INTO rfid_logs (uid, timestamp, action, device, product_name) VALUES
    ('A1B2C3D4', CURRENT_TIMESTAMP - INTERVAL '2 hours', 'tap', 'ESP32-EMULATOR', 'Gantungan Kunci Batik'),
    ('E5F6G7H8', CURRENT_TIMESTAMP - INTERVAL '1 hour',  'tap', 'ESP32-EMULATOR', 'Kaos Wisata Bali'),
    ('I9J0K1L2', CURRENT_TIMESTAMP - INTERVAL '30 minutes', 'tap', 'ESP32-EMULATOR', 'Miniatur Candi Borobudur')
ON CONFLICT DO NOTHING;
