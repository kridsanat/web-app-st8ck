// web/src/OnlineShop.jsx
import React, { useEffect, useMemo, useState } from "react";

const toMoney = (n) =>
  Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const isValidPhoneTH = (s) => /^0\d{8,9}$/.test(String(s).replace(/\D/g, ""));
const API = (typeof import.meta !== "undefined" &&
  import.meta.env &&
  import.meta.env.VITE_URL_API) || "";

const normalizeImage = (u) => {
  if (!u) return null;
  if (/^https?:\/\//.test(u)) return u;
  if (u.startsWith("/")) return `${API}${u}`;
  return `${API}/uploads/${u}`;
};

const toNum = (v) => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const genDoc = (prefix = "WEB") => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const seq = String(Math.floor(Math.random() * 900000)).padStart(6, "0");
  return `${prefix}-${y}${m}${day}-${seq}`;
};

function useCart() {
  const safeReadCart = () => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return [];
      const raw = window.localStorage.getItem("shop_cart_v1");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  };

  const safeWriteCart = (items) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      window.localStorage.setItem("shop_cart_v1", JSON.stringify(items));
    } catch (e) {}
  };

  const [items, setItems] = useState(() => safeReadCart());

  useEffect(() => {
    safeWriteCart(items);
  }, [items]);

  // ระบบใหม่: แอดเข้าตะกร้าด้วย ID สินค้าย่อยตรงๆ ได้เลย เพราะ DB แยกกันแล้ว
  const add = (p, qty = 1) =>
    setItems((prev) => {
      const f = prev.find((x) => x.id === p.id);
      if (f)
        return prev.map((x) =>
          x.id === p.id
            ? { ...x, qty: clamp(x.qty + qty, 1, typeof p.stock_qty === "number" ? p.stock_qty : 999) }
            : x
        );
      return [
        ...prev,
        { ...p, qty: clamp(qty, 1, typeof p.stock_qty === "number" ? p.stock_qty : 999) },
      ];
    });

  const setQty = (id, qty) =>
    setItems((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, qty: clamp(qty, 1, typeof x.stock_qty === "number" ? x.stock_qty : 999) }
          : x
      )
    );

  const remove = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
  const clear = () => setItems([]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((s, x) => s + Number(x.price) * Number(x.qty), 0);
    return { subtotal, shipping: 0, grand: subtotal };
  }, [items]);

  return { items, add, setQty, remove, clear, totals };
}

const FallbackIcon = () => (
  <div className="h-full w-full grid place-items-center text-3xl">📦</div>
);

function ShopHero() {
  const [shop, setShop] = React.useState(null);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/shop`);
        if (!r.ok) throw new Error(await r.text());
        const j = await r.json();
        setShop(j || {});
      } catch (e) {
        setErr(e);
      }
    })();
  }, []);

  if (err || !shop) return null;

  const banner = normalizeImage(shop.banner_url);
  const raw = (shop.banner_link || '').trim();
  const href = raw ? (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) : null;
  
  return (
    <section className="mx-auto max-w-6xl mb-4">
      {banner && (
        <div className="w-full mb-3 overflow-hidden rounded-2xl border bg-gray-50">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              <img src={banner} alt="" className="w-full object-cover" onError={(e)=>{ e.currentTarget.remove(); }} />
            </a>
          ) : (
            <img src={banner} alt="" className="w-full object-cover" onError={(e)=>{ e.currentTarget.remove(); }} />
          )}
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className="min-w-0">
          <div className="text-lg font-semibold truncate">{shop?.name || ''}</div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            {shop.open_hours && <span>เวลาเปิด: {shop.open_hours}</span>}
          </div>
          {shop.tagline && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">{shop.tagline}</div>}
        </div>
      </div>
      {shop.line_id && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-words">LINE: {shop.line_id}</div>}
      {shop.facebook && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-words">FB: {shop.facebook}</div>}
      {shop.phone && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-words">TEL: {shop.phone}</div>}
      {shop.address && <div className="mt-1 text-xs text-gray-600 whitespace-pre-wrap break-words">{shop.address}</div>}
      {shop.shipping_note && <div className="mt-4 text-sm text-gray-600 whitespace-pre-wrap break-words">เงื่อนไข: {shop.shipping_note}</div>}
    </section>
  );
}

function ProductImageCarousel({ images = [], onOpen }) {
  const list = images.length ? images : [];
  if (!list.length) {
    return <div className="aspect-[2/3] sm:aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-50"><FallbackIcon /></div>;
  }
  return (
    <div className="relative">
      <div className="flex overflow-x-auto snap-x snap-mandatory rounded-xl no-scrollbar" style={{ scrollBehavior: 'smooth' }}>
        {list.map((src, i) => (
          <div key={i} className="shrink-0 w-full snap-center">
            <div className="aspect-[2/3] sm:aspect-[3/4] w-full overflow-hidden rounded-xl bg-gray-50">
              <img src={normalizeImage(src)} alt="" className="h-full w-full object-cover" onClick={() => onOpen?.(i)} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function extractImages(obj) {
  if (!obj) return [];
  if (Array.isArray(obj.images)) return obj.images.map(im => (typeof im === "string" ? im : im?.image_url)).filter(Boolean);
  const cover = obj.cover_image || obj.image_url;
  return cover ? [cover] : [];
}

function ImageLightbox({ images = [], index = 0, onClose }) {
  const [i, setI] = React.useState(index);
  React.useEffect(() => setI(index), [index]);
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowRight') setI((v) => (v + 1) % images.length);
      if (e.key === 'ArrowLeft') setI((v) => (v - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  if (!images.length) return null;
  const next = () => setI((v) => (v + 1) % images.length);
  const prev = () => setI((v) => (v - 1 + images.length) % images.length);

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center">
      <button className="absolute top-3 right-3 text-white text-3xl leading-none" onClick={onClose}>×</button>
      <button className="absolute left-2 md:left-6 text-white text-2xl px-3 py-2" onClick={prev}>‹</button>
      <img src={normalizeImage(images[i])} alt="" className="max-h-[90vh] max-w-[95vw] object-contain rounded-lg shadow" />
      <button className="absolute right-2 md:right-6 text-white text-2xl px-3 py-2" onClick={next}>›</button>
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
        {images.map((_, idx) => (
          <span key={idx} onClick={() => setI(idx)} className={'h-1.5 w-6 rounded-full cursor-pointer ' + (idx === i ? 'bg-white' : 'bg-white/40')} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ p, onAdd }) {
  const [imgs, setImgs] = React.useState(() => p.images || []);
  const [lbOpen, setLbOpen]   = React.useState(false);
  const [lbIndex, setLbIndex] = React.useState(0);
  
  // จัดการ state ของ Dropdown
  const [selectedVid, setSelectedVid] = React.useState("");

  // ค้นหาสินค้าย่อยที่ถูกเลือกจาก Dropdown
  const selectedV = p.isGroup ? p.variants.find(x => String(x.id) === String(selectedVid)) : p;

  const currentQty = selectedV ? toNum(selectedV.stock_qty) : p.totalStock;
  const displayPriceText = selectedV ? toMoney(selectedV.price) : p.displayPrice;

  // --- 🌟 ส่วนคำนวณส่วนลด ---
  const currentPriceNum = selectedV ? toNum(selectedV.price) : toNum(p.price);
  const originalPrice = selectedV ? toNum(selectedV.original_price) : toNum(p.original_price);
  
  const hasDiscount = originalPrice && originalPrice > currentPriceNum;
  const discountPercent = hasDiscount 
    ? Math.round(((originalPrice - currentPriceNum) / originalPrice) * 100) 
    : 0;
  // -------------------------

  const handleAdd = () => {
    if (p.isGroup && !selectedV) {
      alert("กรุณาเลือกตัวเลือกสินค้าก่อนหยิบลงตะกร้า");
      return;
    }
    onAdd(selectedV || p);
  };

  return (
    <div className="group rounded-2xl border p-3 hover:shadow-sm transition bg-white flex flex-col relative">
      <div className="relative shrink-0">
        <ProductImageCarousel images={imgs} onOpen={(i) => { setLbIndex(i); setLbOpen(true); }} />
        {lbOpen && <ImageLightbox images={imgs} index={lbIndex} onClose={() => setLbOpen(false)} />}
        
        {/* ป้ายสต๊อกคงเหลือ (ซ้ายบน) */}
        {currentQty !== undefined && (
          <div className={"absolute left-2 top-2 z-10 rounded-full px-2 py-0.5 text-xs font-medium shadow " + (currentQty <= 0 ? "bg-red-600 text-white" : "bg-white/90 text-gray-900")}>
            {currentQty <= 0 ? "หมดสต๊อก" : `คงเหลือ ${currentQty}`}
          </div>
        )}

        {/* 🌟 ป้าย % ส่วนลด (ขวาบน) */}
        {hasDiscount && (
          <div className="absolute right-2 top-2 z-10 rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600 shadow-sm border border-red-200">
            ลด {discountPercent}%
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col flex-1">
        <div className="text-xs text-gray-500">{p.sku}</div>
        <div className="mt-2 text-sm font-semibold leading-snug">{p.name}</div>
        
        {/* 🌟 ส่วนแสดงราคา: ปรับให้แสดงราคาลดตัวแดง และราคาเต็มขีดฆ่า */}
        <div className="mt-1 flex items-baseline gap-2 flex-wrap">
          <span className={`text-lg font-bold ${hasDiscount ? 'text-red-600' : ''}`}>
            ฿{displayPriceText}
          </span>
          {hasDiscount && (
            <span className="text-xs text-gray-400 line-through">
              ฿{toMoney(originalPrice)}
            </span>
          )}
        </div>

        {/* ถ้ามีหลายตัวเลือก (Grouped) ให้แสดง Dropdown */}
        {p.isGroup && (
          <div className="mt-3 space-y-2">
            <select
              className="w-full border rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-gray-300 bg-gray-50"
              value={selectedVid}
              onChange={(e) => setSelectedVid(e.target.value)}
            >
              <option value="">-- เลือกรูปแบบ --</option>
              {p.variants.map((v) => {
                let label = "";
                const attrs = Array.isArray(v.attributes) ? v.attributes : [];
                if (attrs.length > 0) {
                  label = attrs.map(a => a.value || a.val || a.option || a.options?.[0] || '').filter(Boolean).join(', ');
                }
                if (!label && v.sku) label = `รหัส: ${v.sku}`;
                if (!label) label = v.name;

                const st = toNum(v.stock_qty);
                if (st !== undefined) label += ` (เหลือ ${st})`;

                return <option key={v.id} value={v.id} disabled={st !== undefined && st <= 0}>{label}</option>
              })}
            </select>
          </div>
        )}

        {/* แสดงรายละเอียดย่อย (Attributes) กรณีที่มีแค่ตัวเลือกเดียว */}
        {!p.isGroup && Array.isArray(p.attributes) && p.attributes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {p.attributes.map((attr, idx) => {
              const val = attr.value || attr.val || attr.option || attr.options?.[0] || '';
              if (!val) return null;
              return (
                <span key={idx} className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 border border-blue-100">
                  {attr.name ? `${attr.name}: ` : ''}{val}
                </span>
              );
            })}
          </div>
        )}

        {/* Description แสดงเต็มบรรทัด */}
        {p.description && (
          <div className="mt-3 text-xs text-gray-500 leading-relaxed whitespace-pre-wrap break-words">
            {p.description}
          </div>
        )}

        <div className="mt-auto pt-3">
          <button
            className="w-full rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
            disabled={currentQty !== undefined && currentQty <= 0}
            onClick={handleAdd}
          >
            {currentQty !== undefined && currentQty <= 0 ? 'หมดสต๊อก' : '+ เพิ่มลงตะกร้า'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({ open, onClose, cart, onCheckout, shipMethods, shipping, setShipping, computeShipFee }) {
  const { items, setQty, remove, totals } = cart;
  const grand = totals.subtotal + Number(shipping?.fee || 0);

  return (
    <div>
      <div className={`fixed inset-0 z-40 bg-black/30 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`} onClick={onClose} />
      <div className={`fixed right-0 top-0 z-50 h-full w-full max-w-md transform border-l bg-white shadow-xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between border-b p-4">
          <div className="text-lg font-semibold">ตะกร้าสินค้า</div>
          <button className="rounded-lg border px-2 py-1 text-sm hover:bg-gray-50" onClick={onClose}>เลือกสินค้าเพิ่ม</button>
        </div>
        <div className="flex h-[calc(100%-60px)] flex-col">
          <div className="flex-1 overflow-auto p-3 space-y-3">
            {items.length === 0 && <div className="py-10 text-center text-gray-500">ยังไม่มีสินค้าในตะกร้า</div>}
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 rounded-xl border p-2">
                <div className="h-14 w-14 rounded-lg bg-gray-50 overflow-hidden relative">
                  <div className="absolute inset-0 flex items-center justify-center"><FallbackIcon /></div>
                  {normalizeImage(it.image_url) && (
                    <img src={normalizeImage(it.image_url)} alt={it.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover object-center" onError={(e) => { e.currentTarget.remove(); }} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-gray-500">{it.sku}</div>
                  <div className="truncate font-medium">{it.name}</div>
                  {/* แสดง Attributes ใต้ชื่อสินค้าในตะกร้า */}
                  {Array.isArray(it.attributes) && it.attributes.length > 0 && (
                    <div className="text-xs text-blue-600 mb-1">
                      {it.attributes.map(a => `${a.name || ''}: ${a.value || a.val || a.options?.[0] || ''}`).join(' | ')}
                    </div>
                  )}
                  <div className="text-sm">฿{toMoney(it.price)} × {it.qty} = <b>฿{toMoney(it.price * it.qty)}</b></div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => setQty(it.id, clamp(it.qty - 1, 1, typeof it.stock_qty === "number" ? it.stock_qty : 999))}>−</button>
                  <input type="number" min={1} max={typeof it.stock_qty === "number" ? it.stock_qty : 999} value={it.qty} onChange={(e) => setQty(it.id, clamp(parseInt(e.target.value || "1", 10), 1, typeof it.stock_qty === "number" ? it.stock_qty : 999))} className="w-14 rounded-lg border px-2 py-1 text-center text-sm" />
                  <button className="rounded-lg border px-2 py-1 text-sm" onClick={() => setQty(it.id, clamp(it.qty + 1, 1, typeof it.stock_qty === "number" ? it.stock_qty : 999))}>+</button>
                </div>
                <button className="rounded-lg border px-2 py-1 text-sm text-red-600" onClick={() => remove(it.id)}>ลบ</button>
              </div>
            ))}
          </div>

          <div className="border-t p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs">
                วิธีจัดส่ง
                <select value={shipping?.method_id || ''} onChange={(e) => {
                  const id = Number(e.target.value) || null;
                  const fee = computeShipFee(id, shipping?.region || 'bkk');
                  setShipping({ method_id: id, region: shipping?.region || 'bkk', fee });
                }} className="w-full border rounded-xl p-2 mt-1">
                  <option value="">— เลือกวิธีจัดส่ง —</option>
                  {shipMethods.map(m => (
                    <option key={m.id} value={m.id}>{m.name} - กทม. ฿{toMoney(m.price_bkk)} / ตจว. ฿{toMoney(m.price_upcountry)}</option>
                  ))}
                </select>
              </label>

              <label className="text-xs">
                พื้นที่จัดส่ง
                <select value={shipping?.region || 'bkk'} onChange={(e) => {
                  const region = e.target.value;
                  const fee = computeShipFee(shipping?.method_id, region);
                  setShipping({ method_id: shipping?.method_id || null, region, fee });
                }} className="w-full border rounded-xl p-2 mt-1">
                  <option value="bkk">กรุงเทพฯ</option>
                  <option value="upcountry">ต่างจังหวัด</option>
                </select>
              </label>
            </div>
          </div>

          <div className="border-t p-4 space-y-3">
            <div className="flex justify-between text-sm"><span>ยอดรวม</span><b>฿{toMoney(totals.subtotal)}</b></div>
            <div className="flex justify-between text-sm"><span>ค่าจัดส่ง</span><b>฿{toMoney(shipping?.fee || 0)}</b></div>
            <div className="flex justify-between text-base"><span>สุทธิ</span><b>฿{toMoney(grand)}</b></div>
            <button disabled={items.length === 0} onClick={onCheckout} className="w-full rounded-xl bg-black px-3 py-2 text-white disabled:opacity-50">ส่งออเดอร์</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutModal({ open, onClose, cart, onSubmitted, shipping, shop }) {
  const { items, totals, clear } = cart;
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!open) {
      setOk(false); setError(null); setLoading(false);
      setName(""); setAddress(""); setPhone(""); setNote("");
      setSlipFile(null); setSlipPreview(null);
    }
  }, [open]);

  const canSubmit = name.trim() && address.trim() && isValidPhoneTH(phone) && items.length > 0 && !loading;

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      let slipUrl = null;
      if (slipFile) {
        const fd = new FormData();
        fd.append('file', slipFile);
        const r = await fetch(`${API}/api/files`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error('อัปโหลดสลิปไม่สำเร็จ');
        const j = await r.json();
        slipUrl = j.url;
      }
      await onSubmitted?.({
        name, address, phone, note,
        payment: { method: slipUrl ? 'transfer' : 'cod', slip_url: slipUrl }
      });
      setOk(true);
      clear();
    } catch (e) {
      setError(e?.message || "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  const qr = normalizeImage(shop?.payment_qr_url);
  const [showSummary, setShowSummary] = useState(false);
  
  return (
    <div>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition ${open ? "" : "pointer-events-none opacity-0"}`}>
        <div className="w-full max-w-xl rounded-2xl border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b p-4">
            <div className="text-lg font-semibold">ข้อมูลสำหรับจัดส่ง</div>
            <button className="rounded-lg border px-2 py-1 text-sm hover:bg-gray-50" onClick={onClose}>ปิด</button>
          </div>
          <div className="p-4 space-y-3">
            {ok ? (
              <div className="rounded-xl bg-green-50 p-3 text-green-800">สำเร็จ! ทีมงานจะติดต่อกลับไปในไม่ช้า</div>
            ) : (
              <>
                <input className="w-full border rounded-xl p-2" placeholder="ชื่อ-นามสกุล" value={name} onChange={(e)=>setName(e.target.value)} />
                <textarea className="w-full border rounded-xl p-2" rows={3} placeholder="ที่อยู่จัดส่ง" value={address} onChange={(e)=>setAddress(e.target.value)} />
                <input className={`w-full border rounded-xl p-2 ${isValidPhoneTH(phone) ? "" : "ring-1 ring-red-500"}`} placeholder="0XXXXXXXXX" value={phone} onChange={(e)=>setPhone(e.target.value.replace(/\D/g,''))} />
                <input className="w-full border rounded-xl p-2" placeholder="หมายเหตุ (ถ้ามี)" value={note} onChange={(e)=>setNote(e.target.value)} />

                <div className="rounded-xl bg-gray-50 p-3">
                  <div className="mb-2 font-medium">ชำระเงิน</div>
                  {qr && (
                    <div className="mb-2 flex items-center gap-3">
                      <img src={qr} alt="QR ชำระเงิน" className="h-28 w-28 rounded-lg border object-contain bg-white" />
                      <div className="text-xs text-gray-600">สแกน QR เพื่อชำระ แล้วอัปโหลดสลิปด้านล่าง<br/>ถ้าไม่อัปโหลด ระบบจะบันทึกเป็น “เก็บเงินปลายทาง”</div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <label className="text-sm">
                      อัปโหลดสลิป
                      <input type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        setSlipFile(f);
                        setSlipPreview(f ? URL.createObjectURL(f) : null);
                      }} />
                    </label>
                    {slipPreview && <img src={slipPreview} alt="preview" className="h-24 rounded-lg border object-contain bg-white" />}
                  </div>
                </div>

                <button type="button" onClick={() => setShowSummary(!showSummary)} className="w-full rounded-lg border px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 mt-2">
                  {showSummary ? "ซ่อนสรุปรายการ" : "ดูสรุปรายการ"}
                </button>

                {showSummary && (
                  <div className="rounded-xl bg-gray-50 p-3 text-xs mt-2">
                    <div className="mb-2 text-xs">สรุปรายการ ({items.length} รายการ)</div>
                    <div className="space-y-1 max-h-32 overflow-auto pr-1 text-xs">
                      {items.map(x => (
                        <div key={x.id} className="flex justify-between gap-2 text-xs">
                          <div className="truncate text-xs">{x.name} × {x.qty}</div>
                          <div>฿{toMoney(x.price * x.qty)}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex justify-between text-xs"><span>ยอดรวมสินค้า</span><b>฿{toMoney(totals.subtotal)}</b></div>
                    <div className="flex justify-between text-xs"><span>ค่าจัดส่ง</span><b>฿{toMoney(shipping?.fee || 0)}</b></div>
                    <div className="mt-1 flex justify-between text-xs"><span>สุทธิ</span><b>฿{toMoney(totals.subtotal + Number(shipping?.fee || 0))}</b></div>
                  </div>
                )}

                {error && <div className="rounded-xl bg-red-50 p-2 text-red-700">{error}</div>}
                <button disabled={!canSubmit} onClick={submit} className="w-full rounded-xl bg-black px-3 py-2 text-white disabled:opacity-50">
                  {loading ? "กำลังส่งออเดอร์..." : "ยืนยันส่งออเดอร์"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==== Reviews Sections ====
function getYoutubeId(url = "") {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/", "");
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2];
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2];
    }
  } catch (_) {}
  return null;
}
function isDirectVideoUrl(url = "") { return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url); }

function VideoReviewModal({ item, onClose }) {
  if (!item) return null;
  const videoUrl = item.video_url || "";
  const youtubeId = getYoutubeId(videoUrl);
  const directVideo = isDirectVideoUrl(videoUrl);
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 text-3xl text-white">×</button>
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-black shadow-xl">
        {youtubeId ? (
          <iframe className="aspect-video w-full" src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`} title={item.title || "video review"} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        ) : directVideo ? (
          <video src={normalizeImage(videoUrl)} className="max-h-[85vh] w-full bg-black" controls autoPlay playsInline />
        ) : (
          <div className="bg-white p-6 text-center">
            <div className="mb-3 font-semibold">ไม่สามารถเล่นวิดีโอในหน้านี้ได้</div>
            <a href={videoUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">เปิดวิดีโอ</a>
          </div>
        )}
      </div>
    </div>
  );
}

// 1. เพิ่ม Component ใหม่นี้เข้าไปด้านบนๆ ของไฟล์ (หรือก่อน VideoReviewSection)
function InlineVideoCard({ item }) {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const videoUrl = item.video_url || "";
  const youtubeId = getYoutubeId(videoUrl);
  const directVideo = isDirectVideoUrl(videoUrl);

  return (
    <div className="group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:shadow-md flex flex-col">
      {isPlaying ? (
        // ส่วนนี้คือตอนที่กด Play แล้ว จะแสดงตัวเล่นวิดีโอ
        <div className="aspect-video w-full bg-black relative">
          {youtubeId ? (
            <iframe 
              className="absolute inset-0 h-full w-full" 
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0`} 
              title={item.title || "video review"} 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowFullScreen 
            />
          ) : directVideo ? (
            <video 
              src={normalizeImage(videoUrl)} 
              className="absolute inset-0 h-full w-full bg-black object-contain" 
              controls autoPlay playsInline 
            />
          ) : (
            <div className="grid h-full place-items-center bg-white p-4 text-center">
              <a href={videoUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm">
                เปิดวิดีโอ (ลิงก์ภายนอก)
              </a>
            </div>
          )}
        </div>
      ) : (
        // ส่วนนี้คือรูปปกก่อนกด Play
        <div className="relative cursor-pointer" onClick={() => setIsPlaying(true)}>
          {item.thumbnail_url ? (
            <img src={normalizeImage(item.thumbnail_url)} alt={item.title || "video"} className="aspect-video w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : (
            <div className="grid aspect-video w-full place-items-center bg-gray-100 text-gray-400">ไม่มีภาพปก</div>
          )}
          <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-90 transition group-hover:bg-black/30">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-xl shadow pl-1">▶</div>
          </div>
        </div>
      )}
      
      <div className="p-3">
        <div className="line-clamp-2 text-sm font-semibold text-gray-800">{item.title || "วิดีโอรีวิว"}</div>
        <div className="mt-1 text-xs text-gray-500">{item.platform || "video"}</div>
      </div>
    </div>
  );
}

// 2. แทนที่ VideoReviewSection เดิมด้วยอันนี้
function VideoReviewSection({ items = [] }) {
  const [page, setPage] = React.useState(1);
  const itemsPerPage = 3; 
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const currentItems = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  React.useEffect(() => { setPage(1); }, [items]);
  if (!items.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">วิดีโอ</h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {currentItems.map((item) => (
          // เรียกใช้ InlineVideoCard แทนปุ่มแบบเดิม
          <InlineVideoCard key={item.id} item={item} />
        ))}
      </div>
      
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-start gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-xl border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">‹ ก่อนหน้า</button>
          <span className="text-sm font-medium text-gray-600">หน้า {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-xl border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">ถัดไป ›</button>
        </div>
      )}
    </section>
  );
}

function CustomerReviewSection({ items = [] }) {
  const [lbOpen, setLbOpen] = React.useState(false);
  const [lbImages, setLbImages] = React.useState([]);
  const [lbIndex, setLbIndex] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const itemsPerPage = 4;
  const totalPages = Math.ceil(items.length / itemsPerPage);
  const currentItems = items.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const openLightbox = (imageUrl) => {
    if (!imageUrl) return;
    setLbImages([imageUrl]);
    setLbIndex(0);
    setLbOpen(true);
  };

  React.useEffect(() => { setPage(1); }, [items]);
  if (!items.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold text-gray-900">รีวิว</h2></div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4">
        {currentItems.map((item) => (
          <div key={item.id} className="w-full overflow-hidden rounded-2xl border bg-white shadow-sm">
            {item.image_url ? (
              <img src={normalizeImage(item.image_url)} alt={item.customer_name_mask || "review"} className="aspect-square w-full cursor-zoom-in object-cover" onClick={() => openLightbox(item.image_url)} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            ) : (
              <div className="grid aspect-[3/4] w-full place-items-center bg-gray-100 text-gray-400">ไม่มีรูปรีวิว</div>
            )}
            <div className="p-3">
              <div className="text-sm font-medium text-gray-900 line-clamp-1">{item.customer_name_mask || item.customer_name || "ลูกค้า"}</div>
              <div className="mt-1 text-xs text-amber-500">{"★".repeat(Number(item.rating || 0))}</div>
              {item.order_text && <div className="mt-1 text-xs text-gray-500 line-clamp-1">{item.order_text}</div>}
              {item.comment && <div className="mt-1 text-xs text-gray-700 line-clamp-2">{item.comment}</div>}
            </div>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-start gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-xl border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">‹ ก่อนหน้า</button>
          <span className="text-sm font-medium text-gray-600">หน้า {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="rounded-xl border bg-white px-4 py-2 text-sm text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white">ถัดไป ›</button>
        </div>
      )}
      {lbOpen && <ImageLightbox images={lbImages} index={lbIndex} onClose={() => setLbOpen(false)} />}
    </section>
  );
}

// ==== Main App ====
export default function OnlineShop() {
  const cart = useCart();
  const [openCart, setOpenCart] = useState(false);
  const [openCheckout, setOpenCheckout] = useState(false);
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shop, setShop] = useState(null);
  const shopLogo = normalizeImage(shop?.logo_url);
  
  const [shipMethods, setShipMethods] = useState([]);
  const [shipping, setShipping] = useState({ method_id: null, region: 'bkk', fee: 0 });
  const [videoReviews, setVideoReviews] = useState([]);
  const [customerReviews, setCustomerReviews] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/shipping_methods`);
        if (!r.ok) throw new Error(`shipping_methods ${r.status}`);
        const rows = await r.json();
        setShipMethods(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setError(`โหลดวิธีขนส่งไม่สำเร็จ: ${String(e?.message || e)}`);
      }
    })();
  }, []);

  const computeShipFee = (methodId, region) => {
    const m = shipMethods.find(x => x.id === Number(methodId));
    if (!m) return 0;
    return Number(region === 'bkk' ? m.price_bkk : m.price_upcountry) || 0;
  };

  useEffect(() => {
    if (shipMethods.length && !shipping.method_id) {
      const id = shipMethods[0].id;
      setShipping({ method_id: id, region: 'bkk', fee: computeShipFee(id, 'bkk') });
    }
  }, [shipMethods]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/api/shop`);
        if (!r.ok) throw new Error(`shop ${r.status}`);
        setShop(await r.json());
      } catch (e) {
        setError(`โหลดข้อมูลร้านไม่สำเร็จ: ${String(e?.message || e)}`);
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const [pr, sr] = await Promise.all([
          fetch(`${API}/api/products`),
          fetch(`${API}/api/stock`),
        ]);
        if (!pr.ok) throw new Error("โหลดสินค้าไม่สำเร็จ");

        const productsJSON = await pr.json();
        const stockJSON = sr.ok ? await sr.json() : [];
        const stockMap = {};
        
        for (const s of (Array.isArray(stockJSON) ? stockJSON : [])) {
          const pid = s.product_id ?? s.id ?? s.productId;
          const n = toNum(s.stock ?? s.stock_qty ?? s.qty ?? s.quantity ?? s.remaining);
          if (pid != null && n !== undefined) stockMap[pid] = n;
        }

        const normalized = (Array.isArray(productsJSON) ? productsJSON : []).map((p) => {
          const imgs = Array.isArray(p.images)
            ? p.images.map(im => (typeof im === "string" ? im : im?.image_url)).filter(Boolean)
            : [p.cover_image || p.image_url].filter(Boolean);

          const inProduct = toNum(p.stock ?? p.stock_qty);
          const stock_qty = (inProduct !== undefined) ? inProduct : (stockMap[p.id] !== undefined ? stockMap[p.id] : undefined);

          return {
            id: p.id,
            sku: p.code ?? p.sku ?? "",
            name: p.name ?? "",
            price: Number(p.sell_price ?? p.price ?? 0),
            original_price: Number(p.original_price ?? 0) || null,
            image_url: imgs[0] || "",
            images: imgs,
            stock_qty,
            description: p.description || "",
            attributes: Array.isArray(p.attributes) ? p.attributes : (typeof p.attributes === 'string' ? JSON.parse(p.attributes || '[]') : []),
          };
        });

        if (alive) {
          setProducts(normalized);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e?.message || "เกิดข้อผิดพลาด");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [videoRes, reviewRes] = await Promise.all([
          fetch(`${API}/api/reviews?type=video`),
          fetch(`${API}/api/reviews?type=review`)
        ]);

        const videoJSON = videoRes.ok ? await videoRes.json() : [];
        const reviewJSON = reviewRes.ok ? await reviewRes.json() : [];

        if (!alive) return;
        setVideoReviews(Array.isArray(videoJSON) ? videoJSON : []);
        setCustomerReviews(Array.isArray(reviewJSON) ? reviewJSON : []);
      } catch (e) {
        if (!alive) return;
        setVideoReviews([]);
        setCustomerReviews([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const stockRank = (qty) => {
    if (qty === undefined) return 1;
    return qty > 0 ? 0 : 2;
  };

  // 🌟 หัวใจสำคัญของระบบ Grouping (มัดรวมสินค้าชื่อเดียวกันให้แสดงการ์ดเดียว)
  const groupedProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q ? products : products.filter(p => [p.name, p.sku].some(s => String(s ?? '').toLowerCase().includes(q)));
    
    const groups = {};
    list.forEach(p => {
      const key = (p.name || '').trim(); // จับกลุ่มด้วยชื่อเป๊ะๆ
      if (!groups[key]) groups[key] = { variants: [] };
      groups[key].variants.push(p);
    });
    
    return Object.values(groups).map(group => {
      const base = group.variants[0];
      const isGroup = group.variants.length > 1;
      const allImgs = new Set();
      let totalStock = 0;
      let minP = Infinity, maxP = -Infinity;
      let hasStockData = false;

      group.variants.forEach(v => {
        (v.images || []).forEach(img => allImgs.add(img));
        const sq = toNum(v.stock_qty);
        if (sq !== undefined) {
          totalStock += sq;
          hasStockData = true;
        }
        if (v.price < minP) minP = v.price;
        if (v.price > maxP) maxP = v.price;
      });

      return {
        ...base,
        isGroup,
        variants: group.variants,
        images: Array.from(allImgs).length > 0 ? Array.from(allImgs) : base.images,
        totalStock: hasStockData ? totalStock : undefined,
        minPrice: minP,
        maxPrice: maxP,
        displayPrice: minP === maxP ? toMoney(minP) : `${toMoney(minP)} - ${toMoney(maxP)}`
      };
    }).sort((a, b) => {
      const r = stockRank(a.totalStock) - stockRank(b.totalStock);
      if (r !== 0) return r;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
    });
  }, [products, query]);

  const add = (p) => {
    cart.add(p, 1);
    setOpenCart(true);
  };

  async function reloadProducts() {
    try {
      const [pr, sr] = await Promise.all([ fetch(`${API}/api/products`), fetch(`${API}/api/stock`) ]);
      if (!pr.ok) return;
      const productsJSON = await pr.json();
      const stockJSON = sr.ok ? await sr.json() : [];
      const stockMap = {};
      for (const s of (Array.isArray(stockJSON) ? stockJSON : [])) {
        const pid = s.product_id ?? s.id ?? s.productId;
        const n = toNum(s.stock ?? s.stock_qty ?? s.qty ?? s.quantity ?? s.remaining);
        if (pid != null && n !== undefined) stockMap[pid] = n;
      }
      const normalized = (Array.isArray(productsJSON) ? productsJSON : []).map((p) => {
        const imgs = Array.isArray(p.images) ? p.images.map(im => (typeof im === "string" ? im : im?.image_url)).filter(Boolean) : [p.cover_image || p.image_url].filter(Boolean);
        const inProduct = toNum(p.stock ?? p.stock_qty);
        return {
          id: p.id,
          sku: p.code ?? p.sku ?? "",
          name: p.name ?? "",
          price: Number(p.sell_price ?? p.price ?? 0),
          original_price: Number(p.original_price ?? 0) || null,
          image_url: imgs[0] || "",
          images: imgs,
          stock_qty: (inProduct !== undefined) ? inProduct : stockMap[p.id],
          description: p.description || "",
          attributes: Array.isArray(p.attributes) ? p.attributes : (typeof p.attributes === 'string' ? JSON.parse(p.attributes || '[]') : []),
        };
      });
      setProducts(normalized);
    } catch {}
  }

  const submitOrder = async ({ name, address, phone, note, payment }) => {
    const items = cart.items.map(x => ({
      product_id: x.id, // ใช้ ID ตรงๆ เพื่อให้ตัดสต๊อกแม่นยำ
      qty: Number(x.qty || 1),
      price: Number(x.price),
    }));

    // แปะข้อมูลตัวเลือกเพื่อให้อ่านง่ายๆ ในหลังบ้าน
    const optionsNote = cart.items.map(x => {
       const attrs = Array.isArray(x.attributes) ? x.attributes : [];
       if (attrs.length === 0) return null;
       const attrStr = attrs.map(a => `${a.name || ''}=${a.value || a.val || a.options?.[0] || ''}`).join(', ');
       return `- ${x.name} [${x.sku}]: ${attrStr}`;
    }).filter(Boolean).join('\n');
    
    const finalNote = [note, optionsNote].filter(Boolean).join('\n\n--- ข้อมูลย่อยสินค้าที่เลือก ---\n');

    const payload = {
      kind: "sale",
      doc_no: genDoc("WEB"),
      status: "success",
      customer: { name, address, phone, note: finalNote },
      shipping: {
        method_id: shipping.method_id,
        region: shipping.region,
        fee: Number(shipping.fee || 0),
      },
      payment,
      items,
    };

    const resp = await fetch(`${API}/api/bills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await resp.text();
    let data = {};
    try { data = JSON.parse(raw); } catch {}
    if (!resp.ok) throw new Error(data?.error || raw || "ส่งออเดอร์ไม่สำเร็จ");

    try { await reloadProducts(); } catch {}
    return data;
  };

  return (
    <div className="bg-gradient-to-b from-white to-gray-50">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Prompt:wght@300;400;500;600;700&display=swap');
        body { font-family: 'Prompt', sans-serif; }
      `}</style>
      <header className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-6xl p-4 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-16 w-16 rounded-xl overflow-hidden border grid place-items-center">
              {shopLogo ? (
                <img src={shopLogo} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.remove(); }} />
              ) : (
                <div className="grid h-full w-full place-items-center bg-white text-white font-bold">🏪</div>
              )}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="relative w-56 sm:w-72 md:w-80">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">🔎</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ค้นหาสินค้า / SKU" className="w-full rounded-xl border py-2 pl-9 pr-10 outline-none focus:ring-2 focus:ring-blue-600" />
              {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1 text-gray-500 hover:text-gray-900">×</button>}
            </div>
            <button onClick={() => setOpenCart(true)} className="relative rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
              ตะกร้า 🛒
              {cart.items.length > 0 && <span className="absolute -right-2 -top-2 rounded-full bg-black px-2 py-0.5 text-xs text-white">{cart.items.length}</span>}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <ShopHero />
        <VideoReviewSection items={videoReviews} />
        <CustomerReviewSection items={customerReviews} />

        {!loading && !error && (
          <>
            <div className="mt-12 mb-4">
              <h2 className="text-xl font-semibold text-gray-900">รายการสินค้า</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {groupedProducts.map((p) => (
                <ProductCard key={p.id} p={p} onAdd={add} />
              ))}
            </div>
          </>
        )}
      </main>

      <CartDrawer
        open={openCart}
        onClose={() => setOpenCart(false)}
        cart={cart}
        onCheckout={() => { setOpenCart(false); setOpenCheckout(true); }}
        shipMethods={shipMethods}
        shipping={shipping}
        setShipping={setShipping}
        computeShipFee={computeShipFee}
      />

      <CheckoutModal
        open={openCheckout}
        onClose={() => setOpenCheckout(false)}
        cart={cart}
        onSubmitted={submitOrder}
        shipping={shipping}
        shop={shop}
      />

      <footer className="bg-gray-50 border-t text-sm text-gray-600">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2">
            <span>© 2025 MyShop. All Rights Reserved</span>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
              <span className="font-medium">Country & Region:</span>
              <a href="#" className="hover:underline">ไทย</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}