CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =======================
-- products
-- =======================
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  code          TEXT NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  unit          TEXT NOT NULL DEFAULT 'ชิ้น',
  sell_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  buy_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_qty_alert INTEGER NOT NULL DEFAULT 0,
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ถ้า DB เก่าเคยมี UNIQUE เดิม ให้ถอดก่อน
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_code_key;

-- ห้าม code ซ้ำเฉพาะสินค้าที่ใช้งานอยู่
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code_active_unique
  ON products (lower(code))
  WHERE is_active IS TRUE;

-- ถ้าเคยใช้ deleted_at แทน archive ให้ sync สถานะ
UPDATE products SET is_active = FALSE WHERE deleted_at IS NOT NULL;

-- =======================
-- sales / sale_items
-- =======================
CREATE TABLE IF NOT EXISTS sales (
  id         SERIAL PRIMARY KEY,
  doc_no     TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sale_items (
  id         SERIAL PRIMARY KEY,
  sale_id    INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty        NUMERIC(12,2) NOT NULL CHECK (qty > 0),
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0)
);

-- =======================
-- purchases / purchase_items
-- =======================
CREATE TABLE IF NOT EXISTS purchases (
  id         SERIAL PRIMARY KEY,
  doc_no     TEXT NOT NULL UNIQUE,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id           SERIAL PRIMARY KEY,
  purchase_id  INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty          NUMERIC(12,2) NOT NULL CHECK (qty > 0),
  price        NUMERIC(12,2) NOT NULL CHECK (price >= 0)
);

-- =======================
-- shipping_methods (ต้องมาก่อน bills เพราะมี FK)
-- =======================
CREATE TABLE IF NOT EXISTS shipping_methods (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL,
  price_bkk        NUMERIC(12,2) NOT NULL DEFAULT 0,
  price_upcountry  NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_methods_active_sort
  ON shipping_methods(is_active, sort_order, id);

-- seed ขนส่ง (ครั้งแรกเท่านั้น)
INSERT INTO shipping_methods (name, price_bkk, price_upcountry, sort_order)
SELECT * FROM (VALUES
  ('รับเองที่ร้าน', 0, 0, 1),
  ('J&T',          30, 50, 2),
  ('EMS',          40, 60, 3)
) v(name, price_bkk, price_upcountry, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM shipping_methods);

-- =======================
-- bills / bill_items
-- =======================
CREATE TABLE IF NOT EXISTS bills (
  id                 SERIAL PRIMARY KEY,
  doc_no             TEXT NOT NULL UNIQUE,
  kind               TEXT NOT NULL CHECK (kind IN ('sale','purchase')),
  status             TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','cancelled')),
  total              NUMERIC(12,2) NOT NULL DEFAULT 0,
  customer_name      TEXT,
  customer_address   TEXT,
  customer_phone     TEXT,
  customer_note      TEXT,
  stock_moved        BOOLEAN NOT NULL DEFAULT FALSE,
  shipping_method_id INTEGER REFERENCES shipping_methods(id),
  shipping_region    TEXT CHECK (shipping_region IN ('bkk','upcountry')),
  shipping_fee       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_items (
  id         SERIAL PRIMARY KEY,
  bill_id    INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty        NUMERIC(12,2) NOT NULL CHECK (qty > 0),
  price      NUMERIC(12,2) NOT NULL CHECK (price >= 0)
);

-- =======================
-- product_images
-- =======================
CREATE TABLE IF NOT EXISTS product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
  ON product_images(product_id, sort_order, id);

-- =======================
-- shop
-- =======================
CREATE TABLE IF NOT EXISTS shop(
  id             INTEGER PRIMARY KEY DEFAULT 1,
  name           TEXT,
  tagline        TEXT,
  phone          TEXT,
  line_id        TEXT,
  facebook       TEXT,
  open_hours     TEXT,
  address        TEXT,
  shipping_note  TEXT,
  logo_url       TEXT,
  banner_url     TEXT,
  payment_qr_url TEXT,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO shop(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =======================
-- สต็อก (เฉพาะสินค้าที่ใช้งานอยู่)
-- =======================
CREATE OR REPLACE VIEW v_stock AS
SELECT
  p.id AS product_id,
  COALESCE(b.qty,0) - COALESCE(s.qty,0) AS qty
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(qty) AS qty
  FROM purchase_items
  GROUP BY product_id
) b ON b.product_id = p.id
LEFT JOIN (
  SELECT product_id, SUM(qty) AS qty
  FROM sale_items
  GROUP BY product_id
) s ON s.product_id = p.id
WHERE p.is_active IS TRUE
  AND p.deleted_at IS NULL;

-- =======================
-- seed products (ใช้ partial unique index แล้ว ทำ DO NOTHING ได้)
-- =======================
INSERT INTO products (code, name, unit, sell_price, buy_price, min_qty_alert, image_url)
VALUES
  ('SKU-1001','กาแฟคั่วบด','ถุง',120,80,5,NULL),
  ('SKU-1002','แก้วเยติ 20oz','ใบ',250,180,10,NULL),
  ('SKU-1003','เสื้อยืด St8ck','ตัว',199,120,8,NULL)
ON CONFLICT DO NOTHING;
