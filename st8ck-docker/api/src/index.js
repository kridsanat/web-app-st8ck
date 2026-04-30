import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { query, withTransaction } from './db.js';
import fs from 'fs';
import multer from 'multer';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(morgan('tiny'));

app.put('/bills/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  await db.query('UPDATE bills SET status = $1 WHERE id = $2', [status, id]);

  if (status === 'cancelled') {
    await db.query('DELETE FROM sales_report WHERE bill_id = $1', [id]);
  }

  res.json({ message: 'Bill updated' });
});


// === Shipping Methods ===

// สร้างตาราง (ครั้งเดียว)
await query(`
  CREATE TABLE IF NOT EXISTS shipping_methods (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price_bkk NUMERIC(12,2) NOT NULL DEFAULT 0,
    price_upcountry NUMERIC(12,2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);

// GET ทั้งหมด (หลังบ้านใส่ ?all=1), หน้าบ้านเรียกไม่ใส่ -> ได้เฉพาะที่เปิดใช้
app.get('/api/shipping_methods', async (req, res) => {
  try {
    const showAll = String(req.query.all || '') === '1';
    const r = await query(
      `SELECT id, name, price_bkk, price_upcountry, is_active, sort_order
         FROM shipping_methods
        ${showAll ? '' : 'WHERE is_active IS TRUE'}
        ORDER BY sort_order, id`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// สร้างวิธีขนส่ง
app.post('/api/shipping_methods', async (req, res) => {
  const { name, price_bkk=0, price_upcountry=0, sort_order=0, is_active=true } = req.body || {};
  try {
    const r = await query(
      `INSERT INTO shipping_methods(name, price_bkk, price_upcountry, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, price_bkk, price_upcountry, sort_order, is_active]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// แก้ไข
app.put('/api/shipping_methods/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { name, price_bkk=0, price_upcountry=0, sort_order=0, is_active=true } = req.body || {};
  try {
    const r = await query(
      `UPDATE shipping_methods
         SET name=$1, price_bkk=$2, price_upcountry=$3, sort_order=$4, is_active=$5
       WHERE id=$6 RETURNING *`,
      [name, price_bkk, price_upcountry, sort_order, is_active, id]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Toggle เร็ว ๆ (รองรับโค้ดหลังบ้านที่เรียก /:id/toggle)
app.patch('/api/shipping_methods/:id/toggle', async (req, res) => {
  const id = Number(req.params.id);
  try {
    const cur = (await query(`SELECT is_active FROM shipping_methods WHERE id=$1`, [id])).rows[0];
    if (!cur) return res.status(404).json({ error: 'not found' });
    const r = await query(`UPDATE shipping_methods SET is_active = NOT is_active WHERE id=$1 RETURNING *`, [id]);
    res.json(r.rows[0]);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ลบ (จะลบจริง หรือถือว่า “ปิดใช้งาน” ก็ได้)
app.delete('/api/shipping_methods/:id', async (req, res) => {
  const id = Number(req.params.id);
  // ถ้าอยาก “ปิดการใช้งาน” แทนการลบจริง ให้ใช้ UPDATE is_active=false ก็ได้
  await query(`DELETE FROM shipping_methods WHERE id=$1`, [id]);
  res.json({ ok: true });
});



app.get('/api/health', async (req,res)=>{
  const r = await query('SELECT 1 as ok');
  res.json({ ok: true, db: r.rows[0].ok === 1 });
});

// GET /api/shop
app.get('/api/shop', async (req, res) => {
  try {
    const r = await query('SELECT * FROM shop WHERE id=1');       // < เปลี่ยน pool -> query
    if (r.rows.length === 0) {
      const c = await query('INSERT INTO shop(id) VALUES (1) RETURNING *'); // < pool -> query
      return res.json(c.rows[0]);
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// PUT /api/shop
app.put('/api/shop', async (req, res) => {
  try {
    const body = req.body || {};
    const fields = [
      'name','tagline','phone','line_id','facebook',
      'open_hours','address','shipping_note',
      'logo_url','banner_url','payment_qr_url',
      'banner_link' // ✅
    ];
    const toNull = v => (v === '' ? null : v);

    const setParts = [];
    const values = [];
    for (const k of fields) {
      if (Object.prototype.hasOwnProperty.call(body, k)) {
        values.push(toNull(body[k]));
        setParts.push(`${k}=$${values.length}`);
      }
    }

    const sql = setParts.length
      ? `UPDATE shop SET ${setParts.join(', ')}, updated_at=now() WHERE id=1 RETURNING *`
      : `UPDATE shop SET updated_at=now() WHERE id=1 RETURNING *`;

    const r = await query(sql, values);
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ===== Paths / static =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// (ถ้ามี public อยู่)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// โฟลเดอร์อัปโหลด และ static เสิร์ฟไฟล์อัปโหลด
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// ===== Multer (ต้องมาก่อน routes ที่ใช้ upload) =====
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = String(file.originalname || 'file')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9._-]/g, '');
    cb(null, `${ts}_${Math.round(Math.random()*1e9)}_${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 12 } // 10MB/ไฟล์ สูงสุด 12 ไฟล์
});



// ===== Helper =====
async function getProductWithImages(id) {
  const p = await query('SELECT * FROM products WHERE id=$1', [id]);
  if (!p.rowCount) return null;
  const imgs = await query(
    `SELECT id, image_url, sort_order
     FROM product_images
     WHERE product_id=$1
     ORDER BY sort_order ASC, id ASC`,
    [id]
  );
  return { ...p.rows[0], images: imgs.rows };
}


// ===== Routes ที่เหลือค่อยตามมา (ตอนนี้ upload พร้อมใช้แล้ว) =====
// CREATE product
app.post('/api/products', async (req, res) => {
  const { code, name, unit, sell_price, buy_price, min_qty_alert, image_url, description } = req.body || {};
  try {
    const r = await query(
      `INSERT INTO products(code, name, unit, sell_price, buy_price, min_qty_alert, image_url, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        String(code||'').trim(),
        String(name||'').trim(),
        String(unit||'ชิ้น').trim(),
        Number(sell_price)||0,
        Number(buy_price)||0,
        Number(min_qty_alert)||0,
        image_url || null,
        description || null
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});







// ตัวอย่าง: list + cover_image
app.get('/api/products', async (req,res)=>{
  const r = await query(`
    SELECT p.*,
      (SELECT image_url FROM product_images
       WHERE product_id=p.id ORDER BY sort_order,id LIMIT 1) AS cover_image
FROM products p
WHERE p.is_active IS TRUE
  AND p.deleted_at IS NULL
ORDER BY p.id ASC

  `);
  res.json(r.rows);
});


// ตัวอย่าง: detail (มี images)
app.get('/api/products/:id', async (req, res) => {
  const data = await getProductWithImages(req.params.id);
  if (!data) return res.status(404).json({ error: 'Not found' });
  res.json(data);
});

// อัปโหลดหลายไฟล์ต่อ 1 สินค้า (ใช้ upload ได้แล้วเพราะประกาศไว้ก่อน)
app.post('/api/products/:id/images', upload.array('files', 12), async (req, res) => {
  const id = Number(req.params.id || 0);
  const start = Number(req.body?.sort_base ?? 0);
  if (!id) return res.status(400).json({ error: 'invalid product id' });
  if (!req.files?.length) return res.status(400).json({ error: 'no files' });

  const toPublicURL = (saved) => `/uploads/${saved}`;
  const inserted = [];
  try {
    await withTransaction(async (tx) => {
      let order = start;
      for (const f of req.files) {
        const publicURL = toPublicURL(f.filename);
        const r = await tx.query(
          `INSERT INTO product_images(product_id, image_url, sort_order)
           VALUES ($1, $2, $3)
           RETURNING id, image_url, sort_order`,
          [id, publicURL, order++]
        );
        inserted.push(r.rows[0]);
      }
    });
    res.status(201).json({ ok: true, images: inserted });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'upload failed' });
  }
});


// ลบรูป
app.delete('/api/products/:id/images/:imageId', async (req, res) => {
  const { id, imageId } = req.params;
  const img = await query(
    'SELECT image_url FROM product_images WHERE id=$1 AND product_id=$2',
    [imageId, id]
  );
  if (!img.rowCount) return res.json({ ok: true });

  const rel = img.rows[0].image_url.replace(/^\/uploads\//, '');
  const abs = path.join(uploadDir, rel);
  try { if (fs.existsSync(abs)) fs.unlinkSync(abs); } catch {}
  await query('DELETE FROM product_images WHERE id=$1 AND product_id=$2', [imageId, id]);
  res.json({ ok: true });
});

// เรียงลำดับรูป
app.put('/api/products/:id/images/order', async (req, res) => {
  const { id } = req.params;
  const items = Array.isArray(req.body) ? req.body : [];
  try {
    await withTransaction(async (tx) => {
      for (const it of items) {
        await tx.query(
          'UPDATE product_images SET sort_order=$1 WHERE id=$2 AND product_id=$3',
          [Number(it.sort_order || 0), Number(it.id), Number(id)]
        );
      }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'reorder failed' });
  }
});

app.patch('/api/products/:id/image', async (req, res) => {
  const id = req.params.id;
  const { image_url } = req.body || {};
  try {
    const r = await query('UPDATE products SET image_url=$1 WHERE id=$2 RETURNING *', [image_url, id]);
    res.json(r.rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});



app.put('/api/products/:id', async (req,res)=>{
  const id = req.params.id;
  const { code, name, unit, sell_price, buy_price, min_qty_alert, image_url, description } = req.body || {};
  try{
    const r = await query(
      `UPDATE products
         SET code=$1, name=$2, unit=$3, sell_price=$4, buy_price=$5,
             min_qty_alert=$6, image_url=$7, description=$8
       WHERE id=$9
       RETURNING *`,
      [code, name, unit, sell_price, buy_price, min_qty_alert, image_url, description, id]
    );
    res.json(r.rows[0]);
  }catch(e){ res.status(400).json({ error: e.message }); }
});


app.delete('/api/products/:id', async (req,res)=>{
  const id = Number(req.params.id||0);
  if(!id) return res.status(400).json({error:'invalid id'});

  try {
    await withTransaction(async tx=>{
      const used = (await tx.query(`
        SELECT
          EXISTS(SELECT 1 FROM bill_items     WHERE product_id=$1) OR
          EXISTS(SELECT 1 FROM sale_items     WHERE product_id=$1) OR
          EXISTS(SELECT 1 FROM purchase_items WHERE product_id=$1) AS used
      `,[id])).rows[0].used;

      if (used) {
        await tx.query(
          `UPDATE products SET is_active=false, deleted_at=now()
           WHERE id=$1 AND is_active=true`, [id]
        );
        return; // archived
      }

      // ไม่ถูกใช้งาน → ลบรูป แล้วลบสินค้า
      await tx.query('DELETE FROM product_images WHERE product_id=$1',[id]);
      await tx.query('DELETE FROM products WHERE id=$1',[id]);
    });
    res.json({ ok:true });
  } catch(e){
    res.status(400).json({ error:e.message || 'delete failed' });
  }
});



function pad4(n){ return String(n).padStart(4,'0'); }
function genDoc(prefix){ const d=new Date(); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); const seq=Math.floor(Math.random()*9000)+100; return `${prefix}-${y}${m}${day}-${pad4(seq)}`; }

app.post('/api/sales', async (req,res)=>{
  const { items=[], note='' } = req.body || {};
  if(!items.length) return res.status(400).json({ error: 'items required' });
  const docNo = genDoc('S');
  try{
    const result = await withTransaction(async (client)=>{
      const sale = await client.query('INSERT INTO sales (doc_no,note) VALUES ($1,$2) RETURNING *', [docNo, note]);
      for(const it of items){
        await client.query('INSERT INTO sale_items (sale_id,product_id,qty,price) VALUES ($1,$2,$3,$4)', [sale.rows[0].id, it.product_id, it.qty, it.price]);
      }
      return sale.rows[0];
    });
    res.status(201).json({ ok:true, doc_no: result.doc_no });
  }catch(e){ res.status(400).json({ error: e.message }); }
});

// === Bills API ===
// ให้แน่ใจว่ามีคอลัมน์สำหรับสถานะ + ข้อมูลลูกค้า
await query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','cancelled'))`);
await query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_name TEXT`);
await query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_address TEXT`);
await query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_phone TEXT`);
await query(`ALTER TABLE bills ADD COLUMN IF NOT EXISTS customer_note TEXT`);

// สร้างบิล + รายการ
// ควรเหลืออันนี้อันเดียวพอ
app.post('/api/bills', async (req, res) => {
  const {
    kind, doc_no, items = [], status = 'success',
    customer = {}, shipping = {}, payment = {}
  } = req.body || {};

  if (!['sale','purchase'].includes(kind)) return res.status(400).json({ error: 'bad kind' });
  if (!doc_no || !items.length)       return res.status(400).json({ error: 'missing doc_no/items' });

  try {
    await query('BEGIN');

    // 1) คำนวณค่าขนส่ง (เท่าเดิม)
    let shippingMethodId = null, shippingName = null, shippingRegion = null, shippingFee = 0;
    if (shipping?.method_id && (shipping?.region === 'bkk' || shipping?.region === 'upcountry')) {
      const m = (await query(
        `SELECT id, name, price_bkk, price_upcountry
           FROM shipping_methods
          WHERE id=$1 AND is_active IS TRUE`,
        [shipping.method_id]
      )).rows[0];
      if (m) {
        shippingMethodId = m.id;
        shippingName     = m.name;
        shippingRegion   = shipping.region;
        shippingFee      = shipping.region === 'bkk' ? Number(m.price_bkk) : Number(m.price_upcountry);
      }
    }

    const itemsTotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
    const total = itemsTotal + shippingFee;

    // 2) วิธีชำระเงิน (ไม่มีสลิป = COD)
    const payMethod = payment?.method === 'transfer' && payment?.slip_url ? 'transfer' : 'cod';
    const paySlip   = payMethod === 'transfer' ? (payment?.slip_url || null) : null;

    // 3) สร้างบิล
    const ins = await query(
      `INSERT INTO bills(
         doc_no, kind, status, total,
         customer_name, customer_address, customer_phone, customer_note,
         shipping_method_id, shipping_name, shipping_region, shipping_fee,
         payment_method, payment_slip_url
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [ doc_no, kind, status, total,
        customer.name||null, customer.address||null, customer.phone||null, customer.note||null,
        shippingMethodId, shippingName, shippingRegion, shippingFee,
        payMethod, paySlip
      ]
    );
    const bill = ins.rows[0];

    for (const it of items) {
      await query(
        `INSERT INTO bill_items(bill_id, product_id, qty, price) VALUES ($1,$2,$3,$4)`,
        [bill.id, it.product_id, it.qty, it.price]
      );
    }
    // 4) ถ้าเป็นบิลขายและสถานะ success → ตัดสต๊อกทันที
    if (kind === 'sale' && status === 'success') {
      // โหลด stock ปัจจุบัน
      const ids = items.map(i => i.product_id);
      const stocks = (await query(
        `SELECT p.id, COALESCE(v.qty,0) AS stock
           FROM products p LEFT JOIN v_stock v ON v.product_id=p.id
          WHERE p.id = ANY($1::int[])`,
        [ids]
      )).rows.reduce((m, r) => (m[r.id] = Number(r.stock||0), m), {});

      // ตรวจสอบสต๊อกพอก่อน
      for (const it of items) {
        if (Number(it.qty) > Number(stocks[it.product_id] ?? 0)) {
          throw Object.assign(new Error('insufficient stock'), { status: 409 });
        }
      }

      // สร้าง sale + sale_items
      const sale = (await query(
        'INSERT INTO sales (doc_no, note) VALUES ($1,$2) RETURNING id',
        [doc_no, `auto from bill #${bill.id}`]
      )).rows[0];

      for (const it of items) {
        await query(
          'INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES ($1,$2,$3,$4)',
          [sale.id, it.product_id, it.qty, it.price]
        );
      }

      // อัปเดตบิลว่าได้ตัดสต๊อกแล้ว
      await query('UPDATE bills SET stock_moved=true, sale_id=$1 WHERE id=$2', [sale.id, bill.id]);
    }


    await query('COMMIT');
    res.json(bill);
  } catch (e) {
    await query('ROLLBACK');
    res.status(500).json({ error: e.message });
  }
});





// เปลี่ยนสถานะบิล
app.patch('/api/bills/:id/status', async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!['pending','success','cancelled'].includes(status)) {
    return res.status(400).json({ error: 'bad status' });
  }

  try {
    await withTransaction(async (tx) => {
      // โหลดบิล + ล็อคแถว
      const bill = (await tx.query('SELECT * FROM bills WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!bill) throw Object.assign(new Error('not found'), { status: 404 });

      // --- กรณีเป็นบิลขาย ---
      if (bill.kind === 'sale') {
        // (เดิมอยู่แล้ว) กรณีเปลี่ยนเป็น success → ตัดสต๊อกและสร้าง sales
        if (status === 'success' && !bill.stock_moved) {
          // ... โค้ดเดิมของคุณ ...
        }
        // >>> วางบล็อกนี้ถัดลงมาตรงนี้ <<<
else if (status === 'cancelled' && bill.stock_moved) {
  // 1) เคลียร์ลิงก์ก่อน ป้องกัน FK
  if (bill.sale_id) {
    await tx.query('UPDATE bills SET sale_id=NULL WHERE id=$1', [id]);
    await tx.query('DELETE FROM sales WHERE id=$1', [bill.sale_id]); // sale_items ถูกลบตาม
  }

  // ❌ ลบ “ขั้นตอนคืนสต็อกด้วย purchases/purchase_items” ออกทั้งหมด
  // (เพราะการลบ sales ก็ทำให้สต็อกกลับมาแล้ว)

  // 2) mark ว่าไม่ตัดสต็อกแล้ว
  await tx.query('UPDATE bills SET stock_moved=false WHERE id=$1', [id]);
}


      }

      // อัปเดตสถานะบิล (คงบรรทัดเดิมไว้)
      await tx.query('UPDATE bills SET status=$1 WHERE id=$2', [status, id]);
    });

    // ตอบกลับสถานะล่าสุด (คงโค้ดเดิม)
    const row = (await query('SELECT * FROM bills WHERE id=$1', [id])).rows[0];
    res.json(row);
  } catch (e) {
    res.status(e.status || 400).json({ error: e.message || 'update failed' });
  }
});








app.post('/api/purchases', async (req,res)=>{
  const { items=[], note='' } = req.body || {};
  if(!items.length) return res.status(400).json({ error: 'items required' });
  const docNo = genDoc('P');
  try{
    const result = await withTransaction(async (client)=>{
      const po = await client.query('INSERT INTO purchases (doc_no,note) VALUES ($1,$2) RETURNING *', [docNo, note]);
      for(const it of items){
        await client.query('INSERT INTO purchase_items (purchase_id,product_id,qty,price) VALUES ($1,$2,$3,$4)', [po.rows[0].id, it.product_id, it.qty, it.price]);
      }
      return po.rows[0];
    });
    res.status(201).json({ ok:true, doc_no: result.doc_no });
  }catch(e){ res.status(400).json({ error: e.message }); }
});

// server.js (หรือไฟล์ backend ที่มี /api/stock)
app.get('/api/stock', async (req, res) => {
  const r = await query(`
    SELECT
      p.id,
      p.code,
      p.name,
      p.unit,
      p.min_qty_alert,
      COALESCE(
        (SELECT image_url
         FROM product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1),
        p.image_url
      ) AS image_url,
      COALESCE(v.qty, 0) AS stock
FROM products p
LEFT JOIN v_stock v ON v.product_id = p.id
WHERE p.is_active IS TRUE
  AND p.deleted_at IS NULL
ORDER BY p.id ASC
  `);
  res.json(r.rows);
});


app.get('/api/reports/sales', async (req,res)=>{
  const month = req.query.month || new Date().toISOString().slice(0,7);
  const r = await query(`SELECT to_char(s.created_at::date,'YYYY-MM-DD') AS day, SUM(si.qty) AS qty, SUM(si.qty*si.price) AS revenue
                         FROM sales s JOIN sale_items si ON si.sale_id=s.id
                         WHERE to_char(s.created_at,'YYYY-MM')=$1
                         GROUP BY 1 ORDER BY 1 ASC`, [month]);
  res.json(r.rows);
});

app.get('/api/reports/purchases', async (req,res)=>{
  const month = req.query.month || new Date().toISOString().slice(0,7);
  const r = await query(`SELECT to_char(p.created_at::date,'YYYY-MM-DD') AS day, SUM(pi.qty) AS qty, SUM(pi.qty*pi.price) AS spend
                         FROM purchases p JOIN purchase_items pi ON pi.purchase_id=p.id
                         WHERE to_char(p.created_at,'YYYY-MM')=$1
                         GROUP BY 1 ORDER BY 1 ASC`, [month]);
  res.json(r.rows);
});





// ให้เข้าถึงไฟล์ใน /uploads ผ่านเว็บ
app.use('/uploads', express.static(uploadDir));

// อัปโหลดไฟล์ -> คืน URL สำหรับเก็บลง products.image_url
app.post('/api/files', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const url = `/uploads/${req.file.filename}`;
  res.status(201).json({ url, filename: req.file.filename });
});

// ลบไฟล์ (ถ้าต้องการลบจริงจากดิสก์)
app.delete('/api/files/:filename', (req, res) => {
  const fp = path.join(uploadDir, req.params.filename);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  res.json({ ok: true });
});



// รายการบิล (รองรับ ?month=YYYY-MM) + นับจำนวนรายการ
app.get('/api/bills', async (req, res) => {
  const m = req.query.month;
  const sql = m
    ? `SELECT b.*, (SELECT COUNT(*) FROM bill_items bi WHERE bi.bill_id=b.id) AS item_count
       FROM bills b WHERE to_char(b.created_at,'YYYY-MM')=$1 ORDER BY id DESC`
    : `SELECT b.*, (SELECT COUNT(*) FROM bill_items bi WHERE bi.bill_id=b.id) AS item_count
       FROM bills b ORDER BY id DESC LIMIT 200`;
  const args = m ? [m] : [];
  res.json((await query(sql, args)).rows);
});

// ดูบิลพร้อมรายการ
app.get('/api/bills/:id', async (req, res) => {
  const bill = (await query(`SELECT * FROM bills WHERE id=$1`, [req.params.id])).rows[0];
  if (!bill) return res.status(404).json({ error:'not found' });
  const items = (await query(
    `SELECT bi.*, p.name, p.code, p.unit
     FROM bill_items bi LEFT JOIN products p ON p.id=bi.product_id
     WHERE bill_id=$1 ORDER BY bi.id`, [req.params.id]
  )).rows;
  res.json({ bill, items });
});



// ตัวอย่าง: ดึงรีวิวทั้งหมด (รองรับ ?type=... และ ?active=1)

// สร้างรีวิว / วิดีโอรีวิว
// ===== Reviews API =====

// อ่านรีวิว
app.get('/api/reviews', async (req, res) => {
  try {
    const { type, active = '1' } = req.query;

    const where = [];
    const params = [];

    if (type) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }

    if (active === '1') {
      where.push(`is_active IS TRUE`);
    }

    const sql = `
      SELECT
        id,
        type,
        title,
        customer_name,
        customer_name_mask,
        rating,
        order_text,
        comment,
        image_url,
        video_url,
        thumbnail_url,
        product_id,
        platform,
        is_active,
        sort_order,
        created_at,
        updated_at
      FROM shop_reviews
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sort_order ASC, id DESC
    `;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/reviews failed:', err);
    res.status(500).json({ error: 'failed to load reviews' });
  }
});

// สร้างรีวิว
app.post('/api/reviews', async (req, res) => {
  try {
    const {
      type,
      title = null,
      customer_name = null,
      customer_name_mask = null,
      rating = null,
      order_text = null,
      comment = null,
      image_url = null,
      video_url = null,
      thumbnail_url = null,
      product_id = null,
      platform = null,
      is_active = true,
      sort_order = 0,
    } = req.body || {};

    if (!['video', 'review'].includes(String(type || ''))) {
      return res.status(400).json({ error: 'invalid type' });
    }

    const sql = `
      INSERT INTO shop_reviews (
        type, title, customer_name, customer_name_mask, rating, order_text, comment,
        image_url, video_url, thumbnail_url, product_id, platform, is_active, sort_order
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `;

    const params = [
      type,
      title,
      customer_name,
      customer_name_mask,
      rating === null || rating === '' ? null : Number(rating),
      order_text,
      comment,
      image_url,
      video_url,
      thumbnail_url,
      product_id ? Number(product_id) : null,
      platform,
      Boolean(is_active),
      Number(sort_order || 0),
    ];

    const { rows } = await query(sql, params);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/reviews failed:', err);
    res.status(500).json({ error: 'failed to create review' });
  }
});

// แก้ไขรีวิว
app.put('/api/reviews/:id', async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const {
      type,
      title = null,
      customer_name = null,
      customer_name_mask = null,
      rating = null,
      order_text = null,
      comment = null,
      image_url = null,
      video_url = null,
      thumbnail_url = null,
      product_id = null,
      platform = null,
      is_active = true,
      sort_order = 0,
    } = req.body || {};

    if (!['video', 'review'].includes(String(type || ''))) {
      return res.status(400).json({ error: 'invalid type' });
    }

    const sql = `
      UPDATE shop_reviews
      SET
        type=$1,
        title=$2,
        customer_name=$3,
        customer_name_mask=$4,
        rating=$5,
        order_text=$6,
        comment=$7,
        image_url=$8,
        video_url=$9,
        thumbnail_url=$10,
        product_id=$11,
        platform=$12,
        is_active=$13,
        sort_order=$14,
        updated_at=now()
      WHERE id=$15
      RETURNING *
    `;

    const params = [
      type,
      title,
      customer_name,
      customer_name_mask,
      rating === null || rating === '' ? null : Number(rating),
      order_text,
      comment,
      image_url,
      video_url,
      thumbnail_url,
      product_id ? Number(product_id) : null,
      platform,
      Boolean(is_active),
      Number(sort_order || 0),
      id,
    ];

    const { rows } = await query(sql, params);
    if (!rows.length) return res.status(404).json({ error: 'not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /api/reviews/:id failed:', err);
    res.status(500).json({ error: 'failed to update review' });
  }
});

// ลบรีวิว
app.delete('/api/reviews/:id', async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    await query(`DELETE FROM shop_reviews WHERE id=$1`, [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/reviews/:id failed:', err);
    res.status(500).json({ error: 'failed to delete review' });
  }
});

// toggle เปิด/ปิด
app.patch('/api/reviews/:id/toggle', async (req, res) => {
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: 'invalid id' });

    const { rows } = await query(
      `UPDATE shop_reviews
       SET is_active = NOT is_active, updated_at = now()
       WHERE id=$1
       RETURNING *`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /api/reviews/:id/toggle failed:', err);
    res.status(500).json({ error: 'failed to toggle review' });
  }
});




app.use(express.static(publicDir));
app.get('*', (req,res)=> res.sendFile(path.join(publicDir, 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log('St8ck listening on', port));

// === Bills tables ===
await query(`
  CREATE TABLE IF NOT EXISTS bills(
    id SERIAL PRIMARY KEY,
    doc_no TEXT UNIQUE NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('sale','purchase')),
    total NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
await query(`
  CREATE TABLE IF NOT EXISTS bill_items(
    id SERIAL PRIMARY KEY,
    bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty NUMERIC NOT NULL,
    price NUMERIC NOT NULL
  );
`);

// ===== Shop schema bootstrap (index.js) =====
await query(`
  CREATE TABLE IF NOT EXISTS shop(
    id INTEGER PRIMARY KEY DEFAULT 1,
    name TEXT,
    tagline TEXT,
    phone TEXT,
    line_id TEXT,
    facebook TEXT,
    open_hours TEXT,
    address TEXT,
    shipping_note TEXT,
    logo_url TEXT,
    banner_url TEXT,
    payment_qr_url TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`);
await query(`INSERT INTO shop(id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
await query(`ALTER TABLE shop ADD COLUMN IF NOT EXISTS banner_link TEXT;`); // ✅ สำคัญ

await query(`INSERT INTO shop(id) VALUES (1) ON CONFLICT (id) DO NOTHING;`);
// === Bills columns (ensure exist) ===
await query(`
  ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS stock_moved BOOLEAN NOT NULL DEFAULT false
`);
await query(`
  ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS sale_id INTEGER REFERENCES sales(id)
`);
// === Bills API (ต่อจากของเดิม) ===
await query(`
  ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cod'
    CHECK (payment_method IN ('cod','transfer')),
  ADD COLUMN IF NOT EXISTS payment_slip_url TEXT
`);

