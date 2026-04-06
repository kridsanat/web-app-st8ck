import React, { useEffect, useState, useRef } from 'react';

// --- Configuration & Constants ---
// By setting API to an empty string, the browser will automatically use
// the current domain and port for API requests. This is the correct
// setup when the frontend and backend are served from the same origin.
const API = ''; 

const normalizeImage = (u) => {
  if (!u) return null;
  if (/^https?:\/\//.test(u)) return u;   // เป็น URL เต็มแล้ว
  if (u.startsWith('/')) return `${API}${u}`;
  return `${API}/uploads/${u}`;           // กรณีส่งมาเป็นชื่อไฟล์เฉยๆ
};
// ========== Uploader หลายไฟล์ ==========
function MultiImageUploader({ productId, onUploaded, inline = false }) {
  const [files, setFiles] = React.useState([]);

  const submit = async () => {
    if (!files.length) return;
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    const res = await fetch(`/api/products/${productId}/images`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data?.ok) {
      onUploaded?.(data.images);
      setFiles([]);
    } else {
      alert(data?.error || 'upload failed');
    }
  };

  return (
    <div className="flex-1 min-w-0 overflow-hidden">
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={(e)=>setFiles(Array.from(e.target.files||[]))}
      />
      <button
        onClick={submit}
        disabled={!files.length}
        className="px-3 py-1.5 rounded-lg border bg-gray-50 hover:bg-gray-100 disabled:opacity-50"
      >
        อัปโหลดรูป
      </button>
    </div>
  );
}


// --- Image Helpers ---
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/api/files`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error('upload failed');
  return await res.json(); // { url, filename }
}

async function patchProductImage(productId, imageUrl) {
  const res = await fetch(`${API}/api/products/${productId}/image`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl }),
  });
  if (!res.ok) throw new Error('update failed');
  return await res.json();
}

// --- Utility Functions ---

/**
 * Pads a number with leading zeros to ensure it has 4 digits.
 * @param {number} n - The number to pad.
 * @returns {string} The padded string.
 */
function pad4(n) {
  return String(n).padStart(4, '0');
}

/**
 * Generates a document number with a prefix, current date, and a random sequence.
 * @param {string} prefix - The prefix for the document number.
 * @returns {string} The generated document number (e.g., "PREFIX-YYYYMMDD-NNNN").
 */
function genDoc(prefix) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const seq = Math.floor(Math.random() * 9000) + 100;
  return `${prefix}-${y}${m}${day}-${pad4(seq)}`;
}

// --- Beep helper (เสียงสั้น ๆ ตอนสแกนติด) ---
let _beepCtx;
async function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    _beepCtx = _beepCtx || new Ctx();
    if (_beepCtx.state === 'suspended') await _beepCtx.resume();

    const osc = _beepCtx.createOscillator();
    const gain = _beepCtx.createGain();
    osc.type = 'square';          // โทนชัด ๆ
    osc.frequency.value = 1000;   // 1 kHz
    osc.connect(gain);
    gain.connect(_beepCtx.destination);

    gain.gain.value = 0.0001;
    const t = _beepCtx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.15);

    // สั่นนิด ๆ บนมือถือ (ถ้ารองรับ)
    if (navigator.vibrate) navigator.vibrate(40);
  } catch (_) {}
}

function QRScanner({ open, onClose, onDetected }) {
  const id = "qr-reader";
  React.useEffect(() => {
    let scanner;
    if (!open) return;
    (async () => {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      scanner = new Html5QrcodeScanner(id, { fps: 10, qrbox: 240 }, /*verbose*/ false);
scanner.render(
  (text) => {
    playBeep();                       // << ใส่ตรงนี้
    onDetected(String(text || "").trim());
    onClose();
    scanner.clear();
  },
  () => {}
);
    })();
    return () => { scanner?.clear().catch(()=>{}); };
  }, [open, onClose, onDetected]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border w-[28rem] max-w-[calc(100%-2rem)] p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">สแกน QR Code</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">×</button>
        </div>
        <div id={id} className="mt-3 w-full aspect-square" />
        <div className="mt-2 text-xs text-gray-500">นำ QR เข้ากรอบ กล้องจะอ่านอัตโนมัติ</div>
      </div>
    </div>
  );
}

// --- Custom Hooks ---

/**
 * A custom hook for fetching data from an API.
 * @param {string} url - The API endpoint to fetch from.
 * @param {object} opts - Optional fetch options.
 * @returns {{data: any, loading: boolean, error: Error|null, setData: Function}} The state of the fetch operation.
 */
function useFetch(url, opts) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(API + url, opts);
        if (!res.ok) throw new Error(await res.text());
        const j = await res.json();
        if (alive) setData(j);
      } catch (e) {
        if (alive) setError(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [url]);

  return { data, loading, error, setData };
}

// --- UI Components ---

function Labeled({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-blue-700">{label}</span>
      {children}
    </label>
  );
}

function Tabs({ tab, setTab, labels }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-green-50 border-t border-green-200">
      <div className="max-w-4xl mx-auto grid grid-cols-4 text-sm">
        {labels.map((l, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={"py-3 " + (tab === i ? "font-semibold text-green-800 border-t-2 border-green-500" : "text-slate-500 hover:text-green-700")}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function ConfirmationModal({ show, onConfirm, onCancel, title, children }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex justify-center items-center p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm">
        <h3 className="text-lg font-bold text-center mb-4">{title}</h3>
        <div className="text-center text-gray-600 mb-6">{children}</div>
        <div className="flex justify-center gap-4">
          <button onClick={onCancel} className="px-6 py-2 rounded-lg border bg-gray-100 hover:bg-gray-200 w-full">
            ยกเลิก
          </button>
          <button onClick={onConfirm} className="px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 w-full">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tab for creating, viewing, updating, and deleting products.
 */
function ProductTab() {
  const { data: products, loading, error, setData: setProducts } = useFetch('/api/products');
  const { data: stockRows, setData: setStockRows } = useFetch('/api/stock'); // << เพิ่มบรรทัดนี้
  const initialFormState = { code: '', name: '', description: '', unit: 'ชิ้น', sell_price: '', buy_price: '', min_qty_alert: '', image_url: '' };
  const [form, setForm] = useState(initialFormState);
  const [busy, setBusy] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productToDelete, setProductToDelete] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [pQuery, setPQuery] = useState('');
  const [reloading, setReloading] = useState(false);
  const [imageMgrId, setImageMgrId] = useState(null); // productId ที่กำลังจัดการรูป

async function refreshProducts() {
  try {
    setReloading(true);
    const [pr, sr] = await Promise.all([
      fetch(`${API}/api/products`),
      fetch(`${API}/api/stock`)
    ]);
    if (!pr.ok) throw new Error(await pr.text());
    const list = await pr.json();
    setProducts(list);
    if (sr.ok) setStockRows(await sr.json());
  } catch (e) {
    console.error(e);
    alert('รีเฟรชรายการไม่สำเร็จ');
  } finally {
    setReloading(false);
  }
}
  const handleEdit = (product) => {
    setEditingProduct(product);
    setForm(product);
  };
  const handleCancelEdit = () => {
    setEditingProduct(null);
    setForm(initialFormState);
  };
  const handleDelete = (product) => setProductToDelete(product);

  // เรียงตาม "รหัสสินค้า"
  const byCode = (a, b) =>
    String(a.code ?? '').localeCompare(String(b.code ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  
function ManageImagesModal({ productId, open, onClose }) {
  const [loading, setLoading] = React.useState(false);
  const [images, setImages] = React.useState([]);

  React.useEffect(() => {
    if (!open || !productId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/products/${productId}`);
        const j = await res.json();
        setImages(Array.isArray(j.images) ? j.images : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, productId]);

  const onUploaded = (added) => {
    setImages(prev => [...prev, ...added]);
  };

  const remove = async (imgId) => {
    if (!confirm('ลบรูปนี้?')) return;
    await fetch(`/api/products/${productId}/images/${imgId}`, { method: 'DELETE' });
    setImages(prev => prev.filter(x => x.id !== imgId));
  };

  // ตัวอย่างส่งเรียงลำดับกลับ (หากคุณทำ drag&drop ค่อยส่งโครงนี้)
  const saveOrder = async () => {
    const payload = images.map((it, i) => ({ id: it.id, sort_order: i }));
    await fetch(`/api/products/${productId}/images/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    alert('บันทึกลำดับแล้ว');
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border w-[680px] max-w-[calc(100%-2rem)] p-4 shadow-xl">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold">จัดการรูปสินค้า</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">×</button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500">กำลังโหลด...</div>
        ) : (
          <>
            {/* แกลเลอรี */}
            <div className="flex flex-wrap gap-3 mb-3 max-h-56 overflow-auto">
              {images.length === 0 ? (
                <div className="text-sm text-gray-500">ยังไม่มีรูป</div>
              ) : images.map((img) => (
                <div key={img.id} className="relative">
                  <img src={img.image_url} className="w-24 h-24 object-cover rounded-lg border" />
                  <button
                    onClick={() => remove(img.id)}
                    className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-red-600 text-white text-sm"
                    title="ลบรูป"
                  >×</button>
                </div>
              ))}
            </div>



<div className="mt-3 border-t pt-3 flex flex-wrap items-center gap-3">
  {/* ซ้าย: uploader กินพื้นที่ที่เหลือ */}
  <div className="flex-1 min-w-[12rem]">
    <MultiImageUploader productId={productId} onUploaded={onUploaded} inline />
  </div>

  {/* ขวา: ปุ่มคำสั่ง */}
  <div className="ml-auto flex items-center gap-2">
    <button
      onClick={saveOrder}
      className="px-3 py-1.5 rounded-lg border bg-gray-50 hover:bg-gray-100"
    >
      บันทึกลำดับ
    </button>
    <button onClick={onClose} className="px-3 py-1.5 rounded-lg border">ปิด</button>
  </div>
</div>



          </>
        )}
      </div>
    </div>
  );
}

  // แสดงรูปในลิสต์ + คลิกเพื่อเปลี่ยนรูป
function ImagePicker({ p }) {
  const camRef = useRef(null);
  const fileRef = useRef(null);
    
    const pickFile = (e) => { e.stopPropagation(); fileRef.current?.click(); };
    const onFile = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try {
        const up = await uploadImage(f);                      // 1) อัปโหลดไฟล์
        const updated = await patchProductImage(p.id, up.url);// 2) อัปเดต image_url
        setProducts((prev) => prev.map(x =>                  // 3) อัปเดต state
          x.id === p.id ? { ...x, image_url: updated.image_url } : x
        ));
      } catch (err) {
        console.error(err);
        alert('เปลี่ยนรูปไม่สำเร็จ');
      } finally {
        e.target.value = '';
      }
    };
  return (
    <>
      {/* คลิกรูป = เปิดกล้อง */}
      <button type="button" onClick={() => camRef.current?.click()} className="shrink-0">
        {p.image_url ? <img src={p.image_url} className="w-12 h-12 rounded-lg object-cover border" />
                     : <div className="w-12 h-12 rounded-lg bg-gray-100 border flex items-center justify-center">📦</div>}
      </button>

      {/* กล้อง */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      {/* เลือกรูปจากคลัง (ถ้าจะมีปุ่มแยก) */}
      {/* <button onClick={() => fileRef.current?.click()} className="text-xs underline">เลือกรูปจากคลัง</button> */}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </>
  );
}

  // หลังค้นหา
  // รวมสต๊อกจาก /api/stock เข้ากับสินค้า
  const baseList = React.useMemo(() => {
    const list = Array.isArray(products) ? products : [];
    const map = new Map(
      (Array.isArray(stockRows) ? stockRows : []).map(s => {
        const id = s.product_id ?? s.id ?? s.productId;
        const qty = Number(s.stock ?? s.remaining ?? s.qty ?? s.quantity);
        return [id, Number.isFinite(qty) ? qty : 0];
      })
    );
    return list.map(p => {
      const fromProduct = Number(p.stock ?? p.stock_qty);
      const stock = Number.isFinite(fromProduct) ? fromProduct : (map.get(p.id) ?? 0);
      return { ...p, stock };
    });
  }, [products, stockRows]);
  const pQ = pQuery.trim().toLowerCase();
  const productsFiltered = pQ
    ? baseList.filter(p => (`${p.code ?? ''} ${p.name ?? ''} ${p.barcode ?? ''}`).toLowerCase().includes(pQ))
    : baseList;
  const productsView = productsFiltered.slice().sort(byCode);

  // แทนที่ฟังก์ชัน submit เดิมใน ProductTab
const submit = async (e) => {
  e.preventDefault();
  if (!form.code || !form.name) {
    alert('กรอก รหัสสินค้า + ชื่อสินค้า ให้ครบก่อน');
    return;
  }

  setBusy(true);
  const url = editingProduct ? `${API}/api/products/${editingProduct.id}` : `${API}/api/products`;
  const method = editingProduct ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: String(form.code || '').trim(),
        name: String(form.name || '').trim(),
        unit: String(form.unit || 'ชิ้น'),
        sell_price: Number(form.sell_price) || 0,
        buy_price: Number(form.buy_price) || 0,
        min_qty_alert: Number(form.min_qty_alert) || 0,
        image_url: form.image_url || null,
        description: form.description || null,
      }),
    });

    // อ่านข้อความ error จาก backend ให้ได้ก่อน
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.error) {
      const msg = payload?.error || payload?.message || `HTTP ${res.status}`;
      alert(`บันทึกไม่สำเร็จ: ${msg}`);
      return;
    }

    // รองรับทั้ง {product: {...}} และ {...} ตรง ๆ
    const resultProduct = payload?.product ?? payload;

    if (!resultProduct?.id) {
      // กันกรณี backend รีเทิร์น {ok:true} เฉย ๆ
      alert('บันทึกสำเร็จ แต่ไม่ได้ส่งข้อมูลสินค้า กลับมาจากเซิร์ฟเวอร์');
      await refreshProducts();
      handleCancelEdit();
      return;
    }

    setProducts((prev = []) =>
      editingProduct
        ? prev.map(p => (p.id === resultProduct.id ? resultProduct : p))
        : [...prev, resultProduct]
    );

    handleCancelEdit();
  } catch (err) {
    console.error(err);
    alert(`บันทึกล้มเหลว: ${String(err?.message || err)}`);
  } finally {
    setBusy(false);
  }
};


  return (
    <>
      <ConfirmationModal
        show={!!productToDelete}
        onConfirm={async () => {
          if (!productToDelete) return;
          try {
            const response = await fetch(`${API}/api/products/${productToDelete.id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete product');
            setProducts((products || []).filter(p => p.id !== productToDelete.id));
          } catch (err) {
            console.error("Deletion failed:", err);
          } finally {
            setProductToDelete(null);
          }
        }}
        onCancel={() => setProductToDelete(null)}
        title="ยืนยันการลบสินค้า"
      >
        คุณแน่ใจหรือไม่ว่าต้องการลบสินค้า <span className="font-bold">"{productToDelete?.name}"</span>? การกระทำนี้ไม่สามารถย้อนกลับได้
      </ConfirmationModal>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        <div className="md:col-span-5">
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
            <div className="font-semibold text-blue-700 mb-3">{editingProduct ? 'แก้ไขสินค้า' : 'สร้างสินค้า'}</div>
            <form onSubmit={submit} className="space-y-3">
              <Labeled label="รหัสสินค้า">
                <div className="flex gap-2">
                  <input
                    className="input w-full text-base"
                    value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value })}
                    placeholder="SKU0001"
                  />
                  <button type="button" onClick={() => setScanOpen(true)} className="px-3 py-2 rounded-lg border bg-gray-50 hover:bg-gray-100 text-3xl">⛶</button>
                </div>
              </Labeled>
              <Labeled label="ชื่อสินค้า">
                <input className="input w-full text-base" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="เช่น น้ำดื่ม 500ml" />
              </Labeled>


<Labeled label="รายละเอียดสินค้า">
  <textarea
    className="input w-full text-base"
    rows={3}
    placeholder="วัสดุ/สี/ขนาด/สเปก หรือรายละเอียดอื่น ๆ"
    value={form.description}
    onChange={e => setForm({ ...form, description: e.target.value })}
  />
</Labeled>

              <div className="grid grid-cols-2 gap-3">
                <Labeled label="หน่วยนับ">
                  <input className="input w-full text-base" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="เช่น ชิ้น" />
                </Labeled>
                <Labeled label="ขั้นต่ำเตือน">
                  <input type="number" className="input w-full text-base" value={form.min_qty_alert} onChange={e => setForm({ ...form, min_qty_alert: e.target.value })} placeholder="5" />
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="ราคาซื้อ">
                  <input type="number" className="input w-full text-base" value={form.buy_price} onChange={e => setForm({ ...form, buy_price: e.target.value })} placeholder="80" />
                </Labeled>
                <Labeled label="ราคาขาย">
                  <input type="number" className="input w-full text-base" value={form.sell_price} onChange={e => setForm({ ...form, sell_price: e.target.value })} placeholder="120" />
                </Labeled>
              </div>
              <div className="flex flex-col space-y-2 pt-2">
                <button disabled={busy} className="w-full h-11 btn-primary">
                  {busy ? 'กำลังบันทึก...' : (editingProduct ? 'อัปเดตข้อมูล' : 'บันทึก')}
                </button>
                {editingProduct && (
                  <button type="button" onClick={handleCancelEdit} className="w-full text-center text-sm text-gray-600 hover:underline">
                    ยกเลิกการแก้ไข
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* Modal สแกน: เมื่ออ่านได้ จะค้นหาใน products แล้วโหลดขึ้นฟอร์มแก้ไข */}
        <QRScanner
          open={scanOpen}
          onClose={() => setScanOpen(false)}
          onDetected={(val) => {
            const list = Array.isArray(products) ? products : [];
            const found = list.find(p => p.code === val || p.barcode === val);
            if (found) {
              setEditingProduct(found);
              setForm(found);
            } else {
              setForm(f => ({ ...f, code: val }));
              alert(`ไม่พบสินค้าในระบบสำหรับรหัส: ${val}`);
            }
          }}
        />

  <div className="md:col-span-7">
          <div className="bg-white border rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-3">
          <div className="font-semibold text-blue-700">
            รายการสินค้า&nbsp;&nbsp;
                <span className="text-xs text-gray-500">
            แสดง {productsFiltered.length}{pQ ? ` จาก ${baseList.length}` : ''} รายการ
               </span>
  </div>
{/* ✅ เรียกโมดอลที่นี่ (นอกตัวมันเอง) */}
<ManageImagesModal
  productId={imageMgrId}
  open={!!imageMgrId}
  onClose={() => {
    setImageMgrId(null);
    refreshProducts(); // โหลด cover_image ให้ใหม่
  }}
/>


</div>


            <div className="relative ml-auto mb-4">   {/* เพิ่ม mb-4 */}

              <input
                value={pQuery}
                onChange={(e)=>setPQuery(e.target.value)}
                placeholder="ค้นหา SKU / ชื่อ"
                className="text-base w-60 md:w-80 rounded-xl border pl-10 pr-10 py-2 outline-none focus:ring-2 focus:ring-blue-600"
              />
              {pQuery && (
                <button
                  onClick={()=>setPQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900"
                  aria-label="clear"
                >×</button>
              )}



&nbsp;&nbsp;
  <button
    onClick={refreshProducts}
    disabled={reloading}
    className="text-xs px-3 py-1.5 rounded-xl border bg-gray-50 hover:bg-gray-100 disabled:opacity-60"
    title="โหลดรายการใหม่"
  >
    โหลดใหม่ {reloading ? 'กำลังโหลด...' : ''}
  </button>
            </div>

            {loading && <div>กำลังโหลด...</div>}
            {error && <div className="text-red-600">โหลดข้อมูลไม่สำเร็จ</div>}

            <div className="space-y-3 max-h-[540px] overflow-auto pb-4">

              {productsView.map(p => (
                <div key={p.id} className="flex items-start justify-between px-4 py-4 border rounded-xl bg-white">

 <div className="flex items-center gap-3">
  {/* เดิมเป็น <ImagePicker p={p} /> */}
  { (p.cover_image || p.image_url)
      ? <img src={p.cover_image || p.image_url} className="w-12 h-12 rounded-lg object-cover border" />
      : <div className="w-12 h-12 rounded-lg bg-gray-100 border flex items-center justify-center">📦</div>
  }
  <div>
    <div className="font-semibold text-xs">{p.name}</div>
    <div className="text-xs text-gray-500">{p.code} • หน่วย {p.unit}</div>
    {p.description && (
  <div className="text-[11px] text-gray-500 max-w-xs truncate">{p.description}</div>
)}

  </div>
</div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-xs">ซื้อ {p.buy_price}</div>
                    <div className="text-xs">ขาย {p.sell_price}</div>
                    <div className={"text-xs " + (p.stock <= p.min_qty_alert ? 'text-red-600' : 'text-gray-400')}>
                    คงเหลือ {Number(p.stock ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>

<div className="mt-2 flex justify-end gap-4">
<button onClick={() => setImageMgrId(p.id)} className="text-xs font-medium text-indigo-600 hover:underline">
  รูปภาพ
</button>

  <button onClick={() => handleEdit(p)} className="text-xs font-medium text-blue-600 hover:underline">แก้ไข</button>
  <button onClick={() => handleDelete(p)} className="text-xs font-medium text-red-600 hover:underline">ลบ</button>
</div>

                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}


/**
 * Page for creating a bill (either a sale or a purchase).
 */
function BillPage({ kind }) {
  const { data: products } = useFetch('/api/products');
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const list = Array.isArray(products) ? products : [];
  const [scanOpen, setScanOpen] = useState(false);

  const filteredProducts = q
    ? list.filter(p => (`${p.code} ${p.name} ${p.barcode ?? ''}`).toLowerCase().includes(q))
    : list;

   const add = (p) => {
   // เอารูปจาก cover_image ก่อน ถ้าไม่มีค่อย fallback ไป image_url
   const rawImg = p.cover_image || p.image_url || null;
   const imgUrl = normalizeImage(rawImg);
    const i = items.findIndex(x => x.product_id === p.id);
    if (i > -1) {
      const copy = [...items];
      copy[i].qty += 1;
      setItems(copy);
    } else {
       setItems([...items, {
       product_id: p.id,
       price: kind === 'sale' ? Number(p.sell_price) : Number(p.buy_price),
       qty: 1,
       name: p.name,
       code: p.code,
       image_url: imgUrl,
     }]);
    }
  };

  const total = items.reduce((s, i) => s + i.qty * i.price, 0);

  useEffect(() => {
    if (!query) return;
    const exact = list.filter(p => (p.barcode && p.barcode === query) || p.code === query);
    if (exact.length === 1) {
      add(exact[0]);
      setQuery('');
    }
  }, [query, list]);

  const submit = async () => {
  if (!items.length) return;

  const docNo = genDoc(kind === 'sale' ? 'SL' : 'PO');  // เลขบิล

  // 1) ทำธุรกรรมเดิม (ปรับสต๊อก)
  await fetch(`${API}/${kind === 'sale' ? 'api/sales' : 'api/purchases'}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items })
  });

  // 2) บันทึกเอกสารบิล
  await fetch(`${API}/api/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, doc_no: docNo, items, status: 'success' })
  });

  alert(`บันทึกเรียบร้อย\nเลขที่เอกสาร: ${docNo}`);
  location.reload();
};


  return (
    <div className="bg-white border rounded-2xl px-4 pt-4 pb-8 shadow-sm">

      <div className="font-semibold text-blue-700 mb-3">{kind === 'sale' ? 'หน้าขาย' : 'หน้าซื้อ'}</div>

      <div className="flex flex-wrap items-center gap-2 pb-2 mb-3">
        <div className="relative w-full md:max-w-md">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา"
            className="text-base w-48 md:w-80 rounded-xl border pl-10 pr-10 py-2 outline-none focus:ring-2 focus:ring-blue-600"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-900"
              aria-label="clear"
            >×</button>
          )}
          
&nbsp;&nbsp;
<span className="text-xs text-gray-500">
  แสดง {filteredProducts.length}{q ? ` จาก ${list.length}` : ''} รายการ
</span>

        </div>



      </div>

      <div className="flex flex-wrap gap-2 pb-2 mb-3">


        {filteredProducts.map(p => (
          <button key={p.id} onClick={() => add(p)} className="text-xs px-3 py-2 border rounded-xl bg-gray-50 hover:bg-gray-100 whitespace-nowrap">
            + {p.name}
          </button>
        ))}
      </div>




      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-3 border rounded-XL p-2">
            +       {normalizeImage(it.image_url)
         ? <img src={normalizeImage(it.image_url)} className="w-8 h-8 rounded-lg object-cover border" />
         : <div className="w-8 h-8 rounded-lg bg-gray-100 border flex items-center justify-center">📦</div>}
        
            <div className="flex-1">
              <div className="text-xs">{it.name}</div>
              <div className="text-xs text-gray-500">{it.code}</div>
            </div>
            <input type="number" className="input w-16 text-xs p-1" value={it.price} onChange={e => setItems(items.map((x, i) => (i === idx ? { ...x, price: +e.target.value } : x)))} />
            <input type="number" className="input w-16 text-xs p-1" value={it.qty} onChange={e => setItems(items.map((x, i) => (i === idx ? { ...x, qty: +e.target.value } : x)))} />
            <button className="btn w-12 text-xs p-1" onClick={() => setItems(items.filter((_, i) => i !== idx))}>ลบ</button>
          </div>
        ))}
      </div>

<div className="mt-2 flex items-center gap-2">  {/* กว้างขึ้น/ยืดได้บนจอเล็ก */}
  <button
    type="button"
    onClick={() => setScanOpen(true)}
    className="w-24 h-24 rounded-xl border bg-gray-50 hover:bg-gray-100
               text-sm font-medium flex items-center justify-center gap-2"
  >
    <span className="text-3xl">𝄃𝄂𝄂𝄀𝄁𝄃𝄂</span>
 
  </button>


</div>


      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
        
        <div className="text-lg font-bold">รวม: {total.toLocaleString()} บาท</div>
        
        <button className="w-full h-12 btn-primary" onClick={submit} disabled={!items.length}>บันทึก</button>
      </div>

      <QRScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(val) => {
          const list = Array.isArray(products) ? products : [];
          const key = String(val).trim().toLowerCase();
          const found = list.find(p =>
            String(p.code||"").toLowerCase() === key ||
            String(p.barcode||"").toLowerCase() === key
          );
          if (found) add(found);
          else alert(`ไม่พบสินค้าในระบบสำหรับรหัส: ${val}`);
        }}
      />
    </div>
  );
}

/**
 * Page displaying the current stock levels.
 */
function StockPage() {
  const { data: rows } = useFetch('/api/stock');

  const fmtQty = (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return v ?? "";
    return Number.isInteger(n)
      ? n.toLocaleString()
      : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const byCode = (a, b) =>
    String(a.code ?? '').localeCompare(String(b.code ?? ''), undefined, { numeric: true, sensitivity: 'base' });
  const listSorted = Array.isArray(rows) ? [...rows].sort(byCode) : [];

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="font-semibold text-blue-700 mb-3">รายงานสินค้าคงเหลือ</div>
      <div className="space-y-2">
        {listSorted.map(r => (
          <div key={r.id} className={"flex items-center justify-between border rounded-xl p-3 " + (r.stock <= r.min_qty_alert ? 'bg-red-50' : '')}>
            <div className="flex items-center gap-3">
              {r.image_url
                ? <img src={r.image_url} className="w-10 h-10 rounded-lg object-cover border" />
                : <div className="w-10 h-10 rounded-lg bg-gray-100 border flex items-center justify-center">📦</div>
              }
              <div>
                <div className="font-medium text-xs">{r.name}</div>
                <div className="text-xs text-gray-500">{r.code}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">{fmtQty(r.stock)} {r.unit}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShopTab() {
  const { data: shop, loading, error, setData: setShop } = useFetch('/api/shop');
  const [form, setForm] = React.useState({});

  React.useEffect(() => { if (shop) setForm(shop); }, [shop]);

  const up = async (field) => {
    const f = document.createElement('input');
    f.type = 'file'; f.accept = 'image/*';
    f.onchange = async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch('/api/files', { method:'POST', body: fd });
      const j = await r.json();
      setForm(prev => ({ ...prev, [field]: j.url }));
    };
    f.click();
  };

  const save = async () => {
    const r = await fetch('/api/shop', {
      method: 'PUT',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(form)
    });
    if (!r.ok) { alert('บันทึกไม่สำเร็จ'); return; }
    const j = await r.json();
    setShop(j);
    alert('บันทึกแล้ว');
  };

  if (loading) return <div>กำลังโหลด...</div>;
  if (error)   return <div className="text-red-600">โหลดข้อมูลร้านค้าไม่สำเร็จ: {String(error.message || error)}</div>;

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm space-y-3">
      <div className="font-semibold text-blue-700">ข้อมูลร้านค้า</div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm">ชื่อร้าน
          <input className="input w-full" value={form.name||''}
                 onChange={e=>setForm({...form,name:e.target.value})}/>
        </label>
        <label className="text-sm">คำโปรย (tagline)
          <input className="input w-full" value={form.tagline||''}
                 onChange={e=>setForm({...form,tagline:e.target.value})}/>
        </label>

        <label className="text-sm">เบอร์โทร
          <input className="input w-full" value={form.phone||''}
                 onChange={e=>setForm({...form,phone:e.target.value})}/>
        </label>
        <label className="text-sm">LINE ID
          <input className="input w-full" value={form.line_id||''}
                 onChange={e=>setForm({...form,line_id:e.target.value})}/>
        </label>

        <label className="text-sm">Facebook
          <input className="input w-full" value={form.facebook||''}
                 onChange={e=>setForm({...form,facebook:e.target.value})}/>
        </label>
        <label className="text-sm">เวลาเปิดทำการ
          <input className="input w-full" value={form.open_hours||''}
                 onChange={e=>setForm({...form,open_hours:e.target.value})}/>
        </label>
      </div>

      <label className="text-sm block">ที่อยู่
        <textarea className="input w-full" rows={3} value={form.address||''}
                  onChange={e=>setForm({...form,address:e.target.value})}/>
      </label>

      <label className="text-sm block">เงื่อนไข
        <input className="input w-full" value={form.shipping_note||''}
               onChange={e=>setForm({...form,shipping_note:e.target.value})}/>
      </label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-sm mb-1">โลโก้</div>
          {form.logo_url
            ? <img src={form.logo_url} className="h-16 object-contain border rounded-lg mb-2"/>
            : <div className="h-16 border rounded-lg grid place-items-center text-gray-400">ไม่มีรูป</div>}
          <button onClick={()=>up('logo_url')} className="px-3 py-1.5 border rounded-lg">เลือกรูป</button>
        </div>

        <div>
          <div className="text-sm mb-1">แบนเนอร์</div>
          {form.banner_url
            ? <img src={form.banner_url} className="h-16 object-cover border rounded-lg mb-2"/>
            : <div className="h-16 border rounded-lg grid place-items-center text-gray-400">ไม่มีรูป</div>}
          <button onClick={()=>up('banner_url')} className="px-3 py-1.5 border rounded-lg">เลือกรูป</button>


<label className="text-sm">ลิงก์แบนเนอร์
  <input
    className="input w-full"
    value={form.banner_link || ''}
    onChange={(e)=> setForm({...form, banner_link: e.target.value})}
    placeholder="https://example.com/landing"
  />
</label>
       
       
       
        </div>

        <div>
          <div className="text-sm mb-1">QR ชำระเงิน</div>
          {form.payment_qr_url
            ? <img src={form.payment_qr_url} className="h-16 object-contain border rounded-lg mb-2"/>
            : <div className="h-16 border rounded-lg grid place-items-center text-gray-400">ไม่มีรูป</div>}
          <button onClick={()=>up('payment_qr_url')} className="px-3 py-1.5 border rounded-lg">เลือกรูป</button>
        </div>
      </div>

      <div className="pt-2">
        <button onClick={save} className="btn-primary w-full md:w-40 h-11">บันทึก</button>
      </div>
    </div>
  );
}


function ShippingTab() {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState({ name:'', price_bkk:'', price_upcountry:'', sort_order:0, is_active:true });
  const [editingId, setEditingId] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // ถ้ามี endpoint แอดมินจะใช้ตัวนี้, ถ้าไม่มีจะ fallback
const r = await fetch(`/api/shipping_methods?all=1`);
      const j = await r.json();
      setRows(Array.isArray(j) ? j : []);
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => { load(); }, [load]);

  const reset = () => { setEditingId(null); setForm({ name:'', price_bkk:'', price_upcountry:'', sort_order:0, is_active:true }); };

  const saveNew = async () => {
    const r = await fetch(`/api/shipping_methods`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name: form.name,
        price_bkk: Number(form.price_bkk||0),
        price_upcountry: Number(form.price_upcountry||0),
        sort_order: Number(form.sort_order||0),
        is_active: !!form.is_active,
      })
    });
    if (!r.ok) return alert(await r.text());
    reset(); load();
  };

  const saveEdit = async () => {
    const r = await fetch(`/api/shipping_methods/${editingId}`, {
      method:'PUT',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name: form.name,
        price_bkk: Number(form.price_bkk||0),
        price_upcountry: Number(form.price_upcountry||0),
        sort_order: Number(form.sort_order||0),
        is_active: !!form.is_active,
      })
    });
    if (!r.ok) return alert(await r.text());
    reset(); load();
  };

  const toggleActive = async (id) => {
    // ถ้ามี endpoint toggle จะใช้ตัวนี้, ถ้าไม่มีจะอัปเดตด้วย PUT
    let r = await fetch(`/api/shipping_methods/${id}/toggle`, { method:'PATCH' });
    if (!r.ok) {
      const m = rows.find(x=>x.id===id);
      await fetch(`/api/shipping_methods/${id}`, {
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ is_active: !m?.is_active })
      });
    }
    load();
  };

  const softDelete = async (id) => {
    if (!confirm('ปิดการใช้งานรายการนี้?')) return;
    await fetch(`/api/shipping_methods/${id}`, { method:'DELETE' });
    load();
  };

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="font-semibold text-blue-700 mb-3">จัดการค่าขนส่ง</div>

      <div className="rounded-xl border p-3 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input className="input" placeholder="ชื่อขนส่ง"
                 value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
          <input className="input" placeholder="ราคา กทม."
                 value={form.price_bkk} onChange={e=>setForm({...form,price_bkk:e.target.value})}/>
          <input className="input" placeholder="ราคา ตจว."
                 value={form.price_upcountry} onChange={e=>setForm({...form,price_upcountry:e.target.value})}/>
          <input className="input" placeholder="ลำดับ"
                 value={form.sort_order} onChange={e=>setForm({...form,sort_order:e.target.value})}/>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={!!form.is_active}
                   onChange={e=>setForm({...form,is_active:e.target.checked})}/>
            ใช้งาน
          </label>

          {editingId ? (
            <>
              <button className="px-1 py-1 rounded-lg bg-black text-white" onClick={saveEdit}>บันทึก</button>
              <button className="px-1 py-1 rounded-lg border" onClick={reset}>ยกเลิก</button>
            </>
          ) : (
            <button className="px-1 py-1 rounded-lg bg-black text-white" onClick={saveNew}>เพิ่ม</button>
          )}
        </div>
      </div>

      {loading ? <div>กำลังโหลด...</div> : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">No.</th>
                <th className="p-2 text-left">ชื่อ</th>
                <th className="p-2 text-right">กทม.</th>
                <th className="p-2 text-right">ตจว.</th>
                <th className="p-2 text-center">สถานะ</th>
                <th className="p-2 text-right">เครื่องมือ</th>
              </tr>
            </thead>
            <tbody>
              {rows.sort((a,b)=>(a.sort_order-b.sort_order)||(a.id-b.id)).map(m=>(
                <tr key={m.id} className="border-t">
                  <td className="p-2">{m.sort_order}</td>
                  <td className="p-2">{m.name}</td>
                  <td className="p-2 text-right">฿{Number(m.price_bkk||0).toLocaleString()}</td>
                  <td className="p-2 text-right">฿{Number(m.price_upcountry||0).toLocaleString()}</td>
                  <td className="p-2 text-center">
                    <span className={"px-2 py-0.5 rounded-full text-xs "+(m.is_active?"bg-green-100 text-green-800":"bg-gray-100 text-gray-600")}>
                      {m.is_active ? "ใช้งาน" : "ปิด"}
                    </span>
                  </td>
                  <td className="p-2 text-right space-x-1">
                    <button className="px-2 py-1 rounded border" onClick={()=>{setEditingId(m.id); setForm({
                      name:m.name, price_bkk:m.price_bkk, price_upcountry:m.price_upcountry,
                      sort_order:m.sort_order, is_active:m.is_active
                    })}}>แก้ไข</button>
                    <button className="px-2 py-1 rounded border" onClick={()=>toggleActive(m.id)}>
                      {m.is_active ? "ปิด" : "เปิด"}
                    </button>
                    <button className="px-2 py-1 rounded border text-red-600" onClick={()=>softDelete(m.id)}>ลบ</button>
                  </td>
                </tr>
              ))}
              {rows.length===0 && <tr><td className="p-4 text-center text-gray-500" colSpan={6}>ยังไม่มีรายการ</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function SalesReport() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const { data: rows, loading, error } = useFetch(`/api/reports/sales?month=${month}`);

  const totalQty = (rows || []).reduce((n, r) => n + Number(r.qty || 0), 0);
  const totalRevenue = (rows || []).reduce((n, r) => n + Number(r.revenue || 0), 0);

  const shiftMonth = (m, delta) => {
    const [y, mm] = m.split('-').map(Number);
    const d = new Date(y, (mm - 1) + delta, 1);
    return d.toISOString().slice(0, 7);
  };

  return (
    <div className="text-xs bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-blue-700">รายงานขาย</div>
        <div className="flex items-center gap-2">

          <input
            type="month"
            value={month}
            onChange={(e)=>setMonth(e.target.value)}
            className="input w-36"
          />

          <button
            onClick={() => setMonth(new Date().toISOString().slice(0, 7))}
            className="px-3 py-1.5 rounded-xl border bg-gray-50 hover:bg-gray-100"
          >เดือนนี้</button>
        </div>
        
      </div>

      {loading && <div>กำลังโหลด...</div>}
      {error && <div className="text-red-600">โหลดข้อมูลไม่สำเร็จ</div>}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2">วันที่</th>
            <th className="py-2">จำนวน</th>
            <th className="py-2">ยอดขาย</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map(r => (
            <tr key={r.day} className="border-t">
              <td className="py-2">{r.day}</td>
              <td className="py-2">{r.qty}</td>
              <td className="py-2">{Number(r.revenue).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 p-3 bg-gray-50 rounded-xl flex items-center justify-between">
        <div>รวม</div>
        <div className="font-bold">{totalQty} ชิ้น • {totalRevenue.toLocaleString()} บาท</div>
      </div>
    </div>
  );
}

function PurchaseReport() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const { data: rows, loading, error } = useFetch(`/api/reports/purchases?month=${month}`);

  const totalQty = (rows || []).reduce((n, r) => n + Number(r.qty || 0), 0);
  const totalSpend = (rows || []).reduce((n, r) => n + Number(r.spend || 0), 0);

  const shiftMonth = (m, delta) => {
    const [y, mm] = m.split('-').map(Number);
    const d = new Date(y, (mm - 1) + delta, 1);
    return d.toISOString().slice(0, 7);
  };

  return (
    <div className="text-xs bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-blue-700">รายงานซื้อ</div>
        <div className="flex items-center gap-2">

          <input
            type="month"
            value={month}
            onChange={(e)=>setMonth(e.target.value)}
            className="input w-36"
          />

          <button
            onClick={() => setMonth(new Date().toISOString().slice(0, 7))}
            className="px-3 py-1.5 rounded-xl border bg-gray-50 hover:bg-gray-100"
          >เดือนนี้</button>
        </div>
      </div>

      {loading && <div>กำลังโหลด...</div>}
      {error && <div className="text-red-600">โหลดข้อมูลไม่สำเร็จ</div>}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2">วันที่</th>
            <th className="py-2">จำนวน</th>
            <th className="py-2">ยอดซื้อ</th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map(r => (
            <tr key={r.day} className="border-t">
              <td className="py-2">{r.day}</td>
              <td className="py-2">{r.qty}</td>
              <td className="py-2">{Number(r.spend).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 p-3 bg-gray-50 rounded-xl flex items-center justify-between">
        <div>รวม</div>
        <div className="font-bold">{totalQty} ชิ้น • {totalSpend.toLocaleString()} บาท</div>
      </div>
    </div>
  );
}


function BillsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const month = selectedDate.slice(0, 7);

  const { data: bills, loading, error } = useFetch(`/api/bills?month=${month}`);

  const [openId, setOpenId] = React.useState(null);
  const [itemsCache, setItemsCache] = React.useState({});
  const fmt = (n) => Number(n).toLocaleString();

  const filteredBills = (bills || []).filter(b => {
    const d = new Date(b.created_at);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}` === selectedDate;
  });

  const [page, setPage] = React.useState(1);
  const limit = 50;
  React.useEffect(() => { setPage(1); }, [selectedDate, bills]);

  const totalPages = Math.max(1, Math.ceil(filteredBills.length / limit));
  const pageRows = filteredBills.slice((page - 1) * limit, page * limit);

  async function toggleOpen(id) {
    setOpenId(prev => (prev === id ? null : id));
    if (!itemsCache[id]) {
      const res = await fetch(`/api/bills/${id}`);
      const j = await res.json();
      setItemsCache(prev => ({ ...prev, [id]: j.items || [] }));
    }
  }

  async function changeStatus(id, status) {
    try {
      const r = await fetch(`/api/bills/${id}/status`, {
        method: 'PATCH',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error(await r.text());
      alert('อัปเดตสถานะเรียบร้อย');
      location.reload();
    } catch (e) {
      alert('เปลี่ยนสถานะไม่สำเร็จ');
      console.error(e);
    }
  }

  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-blue-700">บิลเอกสาร</div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="input w-44"
          />
          <button
            onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
            className="px-3 py-1.5 rounded-xl border bg-gray-50 hover:bg-gray-100"
          >
            วันนี้
          </button>
        </div>
      </div>

      {loading && <div>กำลังโหลด...</div>}
      {error && <div className="text-red-600">โหลดไม่สำเร็จ</div>}

      <div className="space-y-2">
        {pageRows.map(b => {
          const open = openId === b.id;
          const items = itemsCache[b.id] || [];
          const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);

          return (
            <div key={b.id} className="border rounded-xl p-3 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold">{b.doc_no}</div>
                  <div className="text-xs text-gray-500">
                    {b.kind === 'sale' ? 'ขาย' : 'ซื้อ'} • {new Date(b.created_at).toLocaleString()}
                    {typeof b.item_count !== 'undefined' ? ` • ${b.item_count} รายการ` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs font-semibold whitespace-nowrap">{fmt(b.total)} บาท</div>
                  <button
                    onClick={() => toggleOpen(b.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border bg-gray-50 hover:bg-gray-100"
                  >
                    {open ? 'ซ่อนรายการ' : 'ดูรายการ'}
                  </button>

                  <select
                    value={b.status}
                    onChange={(e)=>changeStatus(b.id, e.target.value)}
                    className="text-xs px-2 py-1 rounded-lg border bg-white"
                  >
                    <option value="pending">รอดำเนินการ</option>
                    <option value="success">สำเร็จ</option>
                    <option value="cancelled">ยกเลิก</option>
                  </select>
                </div>
              </div>

{open && (
  <div className="mt-3 rounded-lg bg-gray-50 p-3">
    {items.length === 0 ? (
      <div className="text-xs text-gray-500">ไม่มีรายการ</div>
    ) : (
      <div className="overflow-x-auto">
        {(b.customer_name || b.customer_phone || b.customer_address || b.customer_note) && (
          <div className="mt-2 rounded-lg bg-blue-50 p-3 text-xs">
            {b.customer_name && <div><b>ลูกค้า:</b> {b.customer_name}</div>}
            {b.customer_phone && <div><b>โทร:</b> {b.customer_phone}</div>}
            {b.customer_address && <div><b>ที่อยู่:</b> {b.customer_address}</div>}
            {b.customer_note && <div><b>หมายเหตุ:</b> {b.customer_note}</div>}
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="text-xs py-1">สินค้า</th>
              <th className="text-xs py-1 w-24 text-right">จำนวน</th>
              <th className="text-xs py-1 w-28 text-right">ราคา</th>
              <th className="text-xs py-1 w-28 text-right">เป็นเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="text-xs border-t">
                <td className="text-xs py-1">
                  <div className="font-xs">{it.name}</div>
                  <div className="text-[11px] text-gray-500">{it.code} • {it.unit}</div>
                </td>
                <td className="text-xs py-1 text-right">{fmt(it.qty)}</td>
                <td className="text-xs py-1 text-right">{fmt(it.price)}</td>
                <td className="text-xs py-1 text-right">{fmt(Number(it.qty) * Number(it.price))}</td>
              </tr>
            ))}

            {Number(b.shipping_fee || 0) > 0 && (
              <tr className="text-xs border-t">
                <td className="py-1 text-right" colSpan={3}>
                  ค่าจัดส่ง
                  {b.shipping_name
                    ? ` (${b.shipping_name}${b.shipping_region === 'bkk' ? ' • กทม.' : b.shipping_region === 'upcountry' ? ' • ตจว.' : ''})`
                    : ''}
                </td>
                <td className="py-1 text-right">{fmt(b.shipping_fee)}</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 flex justify-end">
          <div className="text-right space-y-0.5">
            <div className="text-xs text-gray-500">ค่าสินค้า</div>
            <div className="font-medium">{fmt(subtotal)} บาท</div>

            {Number(b.shipping_fee || 0) > 0 && (
              <>
                <div className="text-xs text-gray-500">ค่าจัดส่ง</div>
                <div className="font-medium">+ {fmt(b.shipping_fee)} บาท</div>
              </>
            )}

            <div className="text-xs text-gray-500">รวมทั้งสิ้น</div>
            <div className="text-lg font-bold">{fmt(b.total)} บาท</div>
          </div>
        </div>
      </div>
    )}
  </div>
)}
            </div>
          );
        })}

        {!loading && filteredBills.length === 0 && (
          <div className="text-sm text-gray-500">ยังไม่มีบิลในวันที่เลือก</div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 mt-3">
        <button
          className="px-3 py-1.5 rounded-xl border disabled:opacity-50"
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={page <= 1}
        >
          ก่อนหน้า
        </button>
        <span className="text-sm">หน้า {page} / {totalPages}</span>
        <button
          className="px-3 py-1.5 rounded-xl border disabled:opacity-50"
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}



// --- Main App Component ---
export default function App() {
  const [tab, setTab] = useState(0);
  const mainTabLabels = ['สินค้า', 'ขาย', 'ซื้อ', 'คงเหลือ'];
  const reportTabLabels = ['บิล', 'รายงานขาย', 'รายงานซื้อ'];


  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Prompt', sans-serif; }
      `}</style>
      <div className="min-h-screen pb-16 text-gray-800">

        <header className="sticky top-0 z-40 bg-green-50/95 backdrop-blur border-b border-green-200">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="text-xl font-extrabold">St8ck</div>
            <div className="flex items-center gap-4 text-sm">

<button
  onClick={() => setTab(98)}
  className={tab===98 ? "font-semibold text-green-800" : "text-slate-500 hover:text-green-700"}
>
  ร้านค้า
</button>
 <button
   onClick={() => setTab(99)}
   className={tab===99 ? "font-semibold text-green-800" : "text-slate-500 hover:text-green-700"}
 >
   ค่าขนส่ง
 </button>


              {reportTabLabels.map((label, index) => (
                <button
                  key={index}
                  onClick={() => setTab(mainTabLabels.length + index)}
                  className={tab === mainTabLabels.length + index ? "font-semibold text-green-800" : "text-slate-500 hover:text-green-700"}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto p-4">
          {tab === 0 && <ProductTab />}
          {tab === 1 && <BillPage kind="sale" />}
          {tab === 2 && <BillPage kind="purchase" />}
          {tab === 3 && <StockPage />}
          {tab === 4 && <BillsPage />}         {/* ใหม่: บิล */}
          {tab === 5 && <SalesReport />}
          {tab === 6 && <PurchaseReport />}
          {tab === 98 && <ShopTab />}
          {tab === 99 && <ShippingTab />}

        </main>

        <Tabs tab={tab} setTab={setTab} labels={mainTabLabels} />
      </div>
    </>
  );
}
