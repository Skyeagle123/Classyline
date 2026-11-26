import { collections, inCollection } from "../../shared/categories.js";
import ProductSalesReport from "./ProductSalesReport.jsx";
import MikExpressOrder from "./MikExpressOrder.jsx";
import React, { useEffect, useState } from "react";
import { api, money } from "../api.js";
import { sortInventoryVariants } from "../variants.js";

const endpoint = "/admin/whatsapp-sales";
const blankItem = () => ({
  product_id: "",
  variant_id: "",
  qty: "1",
  price: "",
});
const moneyFields = {
  deliveryCharge: "توصيل على الزبونة بالدولار",
  deliveryCost: "كلفة شركة التوصيل بالدولار",
};
const statusLabel = {
  confirmed: "مؤكّد",
  dispatched: "مع الديليفري",
  delivered: "تسلّم",
  cancelled: "ملغى",
  returned: "مرتجع",
  returned_damaged: "مرتجع تالف",
};
const actions = {
  confirmed: [
    ["dispatched", "طلع مع الديليفري"],
    ["cancelled", "إلغاء وإرجاع للمخزون"],
  ],
  dispatched: [
    ["delivered", "تم التسليم"],
    ["returned", "رجع للمخزون"],
    ["returned_damaged", "رجع تالف"],
  ],
  delivered: [
    ["collected", "قبضت المبلغ"],
    ["returned", "رجع للمخزون"],
    ["returned_damaged", "رجع تالف"],
  ],
};
const dateFormat = new Intl.DateTimeFormat("ar-LB", {
  timeZone: "Asia/Beirut",
  dateStyle: "short",
  timeStyle: "short",
});
function cents(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new Error("أدخل المبلغ بالدولار حتى خانتين عشريتين");
  return Math.round(Number(value) * 100);
}
function Amount({ label, value, onChange }) {
  return (
    <label className="block">
      {label}
      <input
        className="input"
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        max="1000000"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function OrderEditForm({ order, products, busy, onCancel, onSave }) {
  const variants = products.flatMap((product) =>
    product.variants.map((variant) => ({ ...variant, product })),
  );
  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const originalQty = new Map(
    order.items.map((item) => [item.variant_id, item.qty]),
  );
  const [customer, setCustomer] = useState({
    customer_name: order.customer_name,
    phone: order.phone,
    city: order.city ?? "",
    address: order.address,
  });
  const [delivery, setDelivery] = useState({
    deliveryCharge: String(order.delivery_charge_cents / 100),
    deliveryCost: String(order.delivery_cost_cents / 100),
  });
  const [editItems, setEditItems] = useState(() =>
    order.items.map((item) => ({
      product_id: byId.get(item.variant_id)?.product.id ?? "",
      variant_id: item.variant_id,
      qty: String(item.qty),
      price: String(item.unit_cents / 100),
    })),
  );
  const updateItem = (index, patch) =>
    setEditItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const available = (variant) =>
    variant.stock + (originalQty.get(variant.id) ?? 0);

  return (
    <form
      className="rounded-xl border-2 border-stone-300 bg-stone-50 p-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          action: "edit",
          id: order.id,
          ...customer,
          delivery_charge_cents: cents(delivery.deliveryCharge),
          delivery_cost_cents: cents(delivery.deliveryCost),
          items: editItems.map((item) => ({
            variant_id: item.variant_id,
            qty: Number(item.qty),
            unit_cents: cents(item.price),
          })),
        });
      }}
    >
      <h4 className="text-lg font-semibold">تعديل الطلب</h4>
      {Object.entries({
        customer_name: "اسم الزبونة",
        phone: "رقم الواتساب",
        city: "المدينة",
        address: "المنطقة والعنوان",
      }).map(([id, label]) => (
        <label key={id} className="block">
          {label}
          <input
            className="input"
            required={id !== "city"}
            type={id === "phone" ? "tel" : "text"}
            maxLength={
              { customer_name: 100, phone: 30, city: 100, address: 320 }[id]
            }
            value={customer[id]}
            onChange={(event) =>
              setCustomer({ ...customer, [id]: event.target.value })
            }
          />
        </label>
      ))}
      {editItems.map((item, index) => {
        const product = products.find(
          (candidate) => candidate.id === item.product_id,
        );
        const variant = byId.get(item.variant_id);
        const options = (product?.variants ?? []).filter(
          (candidate) => available(candidate) > 0,
        );
        return (
          <fieldset key={index} className="card p-3 space-y-2">
            <legend>قطعة {index + 1}</legend>
            <label className="block">
              المنتج
              <select
                className="input"
                required
                value={item.product_id}
                onChange={(event) => {
                  const next = products.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  updateItem(index, {
                    ...blankItem(),
                    product_id: event.target.value,
                    price: next ? String(next.price_cents / 100) : "",
                  });
                }}
              >
                <option value="">اختار المنتج</option>
                {products
                  .filter(
                    (candidate) =>
                      candidate.id === item.product_id ||
                      candidate.variants.some(
                        (choice) => available(choice) > 0,
                      ),
                  )
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.title}
                    </option>
                  ))}
              </select>
            </label>
            {product && (
              <div className="flex items-center gap-3">
                <img
                  src={product.image}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-contain"
                />
                <span dir="auto">{product.title}</span>
              </div>
            )}
            <label className="block">
              القياس واللون
              <select
                className="input"
                required
                value={item.variant_id}
                onChange={(event) =>
                  updateItem(index, {
                    variant_id: event.target.value,
                    qty: "1",
                  })
                }
              >
                <option value="">اختار القياس واللون</option>
                {options.map((choice) => (
                  <option
                    key={choice.id}
                    value={choice.id}
                    disabled={editItems.some(
                      (other, i) =>
                        i !== index && other.variant_id === choice.id,
                    )}
                  >
                    {choice.color} · {choice.size} ({available(choice)} متاح)
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              الكمية
              <input
                className="input"
                required
                type="number"
                min="1"
                max={Math.min(20, variant ? available(variant) : 20)}
                value={item.qty}
                onChange={(event) =>
                  updateItem(index, { qty: event.target.value })
                }
              />
            </label>
            <Amount
              label="سعر بيع القطعة بالدولار"
              value={item.price}
              onChange={(price) => updateItem(index, { price })}
            />
            {editItems.length > 1 && (
              <button
                type="button"
                className="navchip"
                onClick={() =>
                  setEditItems((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                شيل هالقطعة من الطلب
              </button>
            )}
          </fieldset>
        );
      })}
      <button
        type="button"
        className="navchip"
        disabled={editItems.length >= 20}
        onClick={() => setEditItems([...editItems, blankItem()])}
      >
        أضف قطعة للطلب
      </button>
      <Amount
        label={moneyFields.deliveryCharge}
        value={delivery.deliveryCharge}
        onChange={(value) =>
          setDelivery({ ...delivery, deliveryCharge: value })
        }
      />
      <Amount
        label={moneyFields.deliveryCost}
        value={delivery.deliveryCost}
        onChange={(value) => setDelivery({ ...delivery, deliveryCost: value })}
      />
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy}>
          حفظ التعديلات
        </button>
        <button
          type="button"
          className="navchip"
          disabled={busy}
          onClick={onCancel}
        >
          إلغاء التعديل
        </button>
      </div>
    </form>
  );
}

export default function WhatsAppSales({ catalog, refresh }) {
  const [tab, setTab] = useState("order");
  const [costs, setCosts] = useState({});
  const [costEdits, setCostEdits] = useState({});
  const [stockEdits, setStockEdits] = useState({});
  const [query, setQuery] = useState("");
  const [stockCategory, setStockCategory] = useState("shop-all");
  const [day, setDay] = useState("");
  const [orderPage, setOrderPage] = useState({ orders: [], more: false });
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [customer, setCustomer] = useState({
    customer_name: "",
    phone: "",
    city: "",
    address: "",
  });
  const [delivery, setDelivery] = useState({
    deliveryCharge: "0",
    deliveryCost: "0",
  });
  const [items, setItems] = useState([blankItem()]);
  const [orderId, setOrderId] = useState(() => crypto.randomUUID());
  const products = catalog?.products ?? [];
  const allVariants = products.flatMap((p) =>
    p.variants.map((v) => ({ ...v, product: p })),
  );
  const byId = new Map(allVariants.map((v) => [v.id, v]));
  const stockCategories = collections
    .map((category) => ({
      ...category,
      image: products.find((product) => inCollection(product, category.slug))
        ?.image,
    }))
    .filter(({ image, slug }) =>
      image || slug === stockCategory || slug === "cotton-underwear",
    );
  const visible = products.filter(
    (product) =>
      inCollection(product, stockCategory) &&
      product.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const stockedProducts = products.filter((product) =>
    product.variants.some((variant) => variant.stock > 0),
  );
  const json = (method, data) => ({ method, body: JSON.stringify(data) });

  async function loadCosts() {
    const data = await api("/admin/whatsapp-costs");
    setCosts(
      Object.fromEntries(data.costs.map((c) => [c.product_id, c.cost_cents])),
    );
  }
  async function loadOrders(start = offset, selectedDay = day) {
    const params = new URLSearchParams({ offset: String(start) });
    if (selectedDay) params.set("day", selectedDay);
    setOrderPage(await api(endpoint + "?" + params));
    setOffset(start);
  }
  useEffect(() => {
    loadCosts().catch((e) => setError(e.message));
  }, []);
  async function run(work) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function updateItem(index, patch) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  function saveOrder(e) {
    e.preventDefault();
    return run(async () => {
      await api(
        endpoint,
        json("POST", {
          id: orderId,
          ...customer,
          delivery_charge_cents: cents(delivery.deliveryCharge),
          delivery_cost_cents: cents(delivery.deliveryCost),
          items: items.map((item) => ({
            variant_id: item.variant_id,
            qty: Number(item.qty),
            unit_cents: cents(item.price),
          })),
        }),
      );
      setOrderId(crypto.randomUUID());
      setCustomer({ customer_name: "", phone: "", city: "", address: "" });
      setDelivery({ deliveryCharge: "0", deliveryCost: "0" });
      setItems([blankItem()]);
      setDay("");
      setTab("history");
      await Promise.all([refresh(), loadOrders(0, "")]);
    });
  }

  return (
    <section dir="rtl" className="card p-4 sm:p-6 space-y-4" lang="ar">
      <h2 className="text-2xl">مبيعات ClassyLine</h2>
      <nav className="flex flex-wrap gap-2" aria-label="إدارة المبيعات">
        {[
          ["order", "طلب جديد"],
          ["stock", "المخزون والكلفة"],
          ["history", "الطلبات والتحصيل"],
          ["report", "جدول المبيعات والأرباح"],
        ].map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={tab === id ? "btn" : "navchip"}
            aria-pressed={tab === id}
            disabled={busy}
            onClick={() => {
              setTab(id);
              if (id === "history") run(() => loadOrders(0));
              if (id === "order" || id === "stock") run(refresh);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}

      {tab === "report" && <ProductSalesReport />}

      {tab === "order" && (
        <form onSubmit={saveOrder} className="space-y-4">
          <fieldset disabled={busy || !catalog} className="space-y-4">
            {Object.entries({
              customer_name: "اسم الزبونة",
              phone: "رقم الواتساب",
              city: "المدينة",
              address: "المنطقة والعنوان",
            }).map(([id, label]) => (
              <label key={id} className="block">
                {label}
                <input
                  className="input"
                  required={id !== "city"}
                  type={id === "phone" ? "tel" : "text"}
                  maxLength={
                    { customer_name: 100, phone: 30, city: 100, address: 320 }[
                      id
                    ]
                  }
                  value={customer[id]}
                  onChange={(e) =>
                    setCustomer({ ...customer, [id]: e.target.value })
                  }
                />
              </label>
            ))}
            {items.map((item, index) => {
              const variant = byId.get(item.variant_id);
              const product = products.find((p) => p.id === item.product_id);
              const options = (product?.variants ?? []).filter(
                (v) => v.stock > 0,
              );
              return (
                <fieldset key={index} className="card p-3 space-y-2">
                  <legend>قطعة {index + 1}</legend>
                  <details className="rounded-xl border border-stone-300">
                    <summary className="cursor-pointer rounded-xl p-3">
                      {product ? "غيّر المنتج" : "اختار من المخزون بالصور"}
                    </summary>
                    <div className="max-h-96 overflow-y-auto p-2">
                      {stockedProducts.length === 0 ? (
                        <p>ما في قطع متاحة بالمخزون.</p>
                      ) : (
                        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                          {stockedProducts.map((candidate) => (
                            <li key={candidate.id}>
                              <button
                                type="button"
                                className="card h-full w-full overflow-hidden text-start"
                                aria-pressed={candidate.id === item.product_id}
                                onClick={(event) => {
                                  if (candidate.id !== item.product_id) {
                                    updateItem(index, {
                                      ...blankItem(),
                                      product_id: candidate.id,
                                      price: (
                                        candidate.price_cents / 100
                                      ).toFixed(2),
                                    });
                                  }
                                  const picker =
                                    event.currentTarget.closest("details");
                                  picker.open = false;
                                  picker.querySelector("summary").focus();
                                }}
                              >
                                <img
                                  src={candidate.image}
                                  alt=""
                                  loading="lazy"
                                  className="aspect-square w-full object-contain"
                                />
                                <span className="block p-2 text-sm" dir="auto">
                                  {candidate.title}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                  {product && (
                    <div className="flex items-center gap-3">
                      <img
                        src={product.image}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-lg object-contain"
                      />
                      <span dir="auto">{product.title}</span>
                    </div>
                  )}
                  <label className="block">
                    القياس واللون
                    <select
                      className="input"
                      required
                      value={item.variant_id}
                      onChange={(e) =>
                        updateItem(index, {
                          variant_id: e.target.value,
                          qty: "1",
                        })
                      }
                    >
                      <option value="">
                        {product
                          ? "اختار القياس واللون"
                          : "اختار المنتج أول شي"}
                      </option>
                      {variant?.stock === 0 && (
                        <option value={variant.id} disabled>
                          {variant.color} · {variant.size} · نفد المخزون
                        </option>
                      )}
                      {options.map((v) => (
                        <option
                          key={v.id}
                          value={v.id}
                          disabled={items.some(
                            (other, i) =>
                              i !== index && other.variant_id === v.id,
                          )}
                        >
                          {v.color} · {v.size} ({v.stock})
                        </option>
                      ))}
                    </select>
                  </label>
                  {variant && (
                    <p>
                      كلفة القطعة{" "}
                      {costs[variant.id] == null
                        ? "بعدها مش مدخّلة"
                        : money(costs[variant.id])}
                    </p>
                  )}
                  <label className="block">
                    الكمية
                    <input
                      className="input"
                      required
                      type="number"
                      min="1"
                      max={Math.min(20, variant?.stock ?? 20)}
                      value={item.qty}
                      onChange={(e) =>
                        updateItem(index, { qty: e.target.value })
                      }
                    />
                  </label>
                  <Amount
                    label="سعر بيع القطعة بالدولار"
                    value={item.price}
                    onChange={(price) => updateItem(index, { price })}
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="navchip"
                      onClick={() =>
                        setItems(items.filter((_, i) => i !== index))
                      }
                    >
                      شيل هالقطعة من الطلب
                    </button>
                  )}
                </fieldset>
              );
            })}
            <button
              type="button"
              className="navchip"
              disabled={items.length >= 20}
              onClick={() => setItems([...items, blankItem()])}
            >
              أضف قطعة للطلب
            </button>
            {Object.entries(moneyFields).map(([id, label]) => (
              <Amount
                key={id}
                label={label}
                value={delivery[id]}
                onChange={(value) => setDelivery({ ...delivery, [id]: value })}
              />
            ))}
            <button className="btn">سجّل الطلب واحجز القطع</button>
          </fieldset>
        </form>
      )}

      {tab === "stock" && (
        <div className="space-y-3">
          <details className="card p-3">
            <summary className="cursor-pointer">
              أقسام المخزون ·{" "}
              <bdi>
                {stockCategories.find(({ slug }) => slug === stockCategory)
                  ?.label ?? "كل المنتجات"}
              </bdi>
            </summary>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="أقسام المخزون"
            >
              {[
                { slug: "shop-all", label: "كل المنتجات" },
                ...stockCategories,
              ].map(({ slug, label, image }) => (
                <button
                  key={slug}
                  type="button"
                  className="navchip inline-flex items-center gap-2"
                  aria-pressed={stockCategory === slug}
                  onClick={(event) => {
                    setStockCategory(slug);
                    const panel = event.currentTarget.closest("details");
                    panel.open = false;
                    panel.querySelector("summary").focus();
                  }}
                >
                  {image && (
                    <img
                      src={image}
                      alt=""
                      className="size-8 rounded object-cover"
                      loading="lazy"
                    />
                  )}
                  <bdi>{label}</bdi>
                </button>
              ))}
            </div>
          </details>
          <label className="block">
            دوّر على منتج
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {visible.length === 0 && <p role="status">ما في منتجات مطابقة.</p>}
          {visible.map((p) => (
            <details key={p.id} className="card p-3">
              <summary className="cursor-pointer">
                <span className="inline-flex max-w-[calc(100%_-_1.5rem)] flex-wrap items-center gap-x-2 gap-y-1 align-middle">
                  <bdi>{p.title}</bdi>
                  <bdi>{money(p.price_cents)}</bdi>
                  <span className="inline-flex shrink-0 items-center gap-2">
                    <span>
                      {p.variants.reduce((sum, v) => sum + v.stock, 0)} قطعة
                      متاحة
                    </span>
                    <img
                      src={p.image}
                      alt=""
                      width={44}
                      height={44}
                      className="size-11 rounded border border-stone-200 bg-stone-100 object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                  </span>
                </span>
              </summary>
              <img
                src={p.image}
                alt={p.title}
                className="w-24 mt-3"
                loading="lazy"
              />
              <p>{p.description}</p>
              <form
                className="py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api(
                      endpoint,
                      json("PUT", {
                        product_id: p.id,
                        cost_cents:
                          costEdits[p.id] === ""
                            ? null
                            : cents(
                                costEdits[p.id] ??
                                  String((costs[p.id] ?? 0) / 100),
                              ),
                      }),
                    );
                    setCostEdits((current) => {
                      const next = { ...current };
                      delete next[p.id];
                      return next;
                    });
                    await loadCosts();
                  });
                }}
              >
                <Amount
                  label="كلفة شراء القطعة بالدولار (لكل الألوان والقياسات)"
                  value={
                    costEdits[p.id] ??
                    (costs[p.id] == null ? "" : String(costs[p.id] / 100))
                  }
                  onChange={(value) =>
                    setCostEdits({ ...costEdits, [p.id]: value })
                  }
                />
                <button className="navchip mt-2" disabled={busy}>
                  احفظ الكلفة
                </button>
              </form>
              {sortInventoryVariants(p.variants).map((v) => (
                <section key={v.id} className="border-t py-3 space-y-3">
                  <p>
                    {v.color} · {v.size} · المتاح {v.stock}
                  </p>
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(async () => {
                        const stock = Number(stockEdits[v.id] ?? v.stock);
                        await api(
                          endpoint,
                          json("PUT", {
                            action: "stock",
                            variant_id: v.id,
                            stock,
                            expected_stock: v.stock,
                          }),
                        );
                        setStockEdits((current) => {
                          const next = { ...current };
                          delete next[v.id];
                          return next;
                        });
                        await refresh();
                      });
                    }}
                  >
                    <label className="block">
                      عدد القطع المتوفّرة
                      <span className="mt-1 flex items-stretch gap-2" dir="ltr">
                        <button
                          type="button"
                          className="navchip min-w-12 text-xl"
                          aria-label={`نقّص مخزون ${p.title} ${v.color} ${v.size}`}
                          disabled={
                            busy || Number(stockEdits[v.id] ?? v.stock) <= 0
                          }
                          onClick={() =>
                            setStockEdits({
                              ...stockEdits,
                              [v.id]: Math.max(
                                0,
                                Number(stockEdits[v.id] ?? v.stock) - 1,
                              ),
                            })
                          }
                        >
                          −
                        </button>
                        <input
                          className="input text-center"
                          aria-label={`مخزون ${p.title} ${v.color} ${v.size}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          max="1000000"
                          step="1"
                          required
                          value={stockEdits[v.id] ?? v.stock}
                          onChange={(e) =>
                            setStockEdits({
                              ...stockEdits,
                              [v.id]: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="navchip min-w-12 text-xl"
                          aria-label={`زيد مخزون ${p.title} ${v.color} ${v.size}`}
                          disabled={
                            busy ||
                            Number(stockEdits[v.id] ?? v.stock) >= 1000000
                          }
                          onClick={() =>
                            setStockEdits({
                              ...stockEdits,
                              [v.id]: Number(stockEdits[v.id] ?? v.stock) + 1,
                            })
                          }
                        >
                          +
                        </button>
                      </span>
                    </label>
                    <button className="btn" disabled={busy}>
                      احفظ المخزون
                    </button>
                  </form>
                </section>
              ))}
            </details>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-3">
          <label className="block">
            تاريخ تسجيل الطلب
            <input
              className="input"
              type="date"
              value={day}
              disabled={busy}
              onChange={(e) => {
                const next = e.target.value;
                setDay(next);
                run(() => loadOrders(0, next));
              }}
            />
          </label>
          {day && orderPage.summary && (
            <section className="card p-4 space-y-1">
              <h3 className="text-xl">
                ملخّص الطلبات المسلّمة المسجّلة بهالتاريخ
              </h3>
              <p>
                {orderPage.summary.delivered_count} طلب · مبيعات{" "}
                {money(orderPage.summary.sales_cents)}
              </p>
              <p>
                كلفة التوصيل {money(orderPage.summary.delivery_cents)} · بانتظار
                التحصيل {money(orderPage.summary.outstanding_cents)}
              </p>
              <p>
                ربح{" "}
                {orderPage.summary.missing_cost
                  ? "الطلبات ذات الكلفة المسجّلة "
                  : ""}
                {money(orderPage.summary.profit_cents)}
              </p>
              {orderPage.summary.missing_cost > 0 && (
                <p>
                  بعد في {orderPage.summary.missing_cost} طلب بلا كلفة شراء
                  كاملة.
                </p>
              )}
            </section>
          )}
          {!orderPage.orders.length && <p>ما في طلبات بهالفترة.</p>}
          {orderPage.orders.map((o) => {
            const total = o.subtotal_cents + o.delivery_charge_cents;
            const profit =
              o.purchase_cents === null
                ? null
                : total - o.purchase_cents - o.delivery_cost_cents;
            const returned = ["returned", "returned_damaged"].includes(
              o.status,
            );
            return (
              <article key={o.id} className="card p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2 break-words">
                    <h3 className="text-xl">
                      {o.customer_name} · {statusLabel[o.status]}
                    </h3>
                    <p>
                      <bdi>{o.phone}</bdi> ·{" "}
                      {[o.city, o.address].filter(Boolean).join(" · ")}
                    </p>
                    <p>
                      تسجّل {dateFormat.format(o.created_at * 1000)}
                      {o.dispatched_at &&
                        ` · طلع ${dateFormat.format(o.dispatched_at * 1000)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {o.items.map((item, i) => {
                      const image = byId.get(item.variant_id)?.product.image;
                      if (!image) return null;
                      return (
                        <figure
                          key={i}
                          className="w-14 text-center text-xs sm:w-20"
                        >
                          <img
                            src={image}
                            alt={item.title}
                            width={80}
                            height={80}
                            className="aspect-square w-full rounded border border-stone-200 bg-stone-100 object-contain"
                            loading="lazy"
                            decoding="async"
                          />
                          <figcaption className="break-words">
                            <bdi>
                              {item.color} · ×{item.qty}
                            </bdi>
                          </figcaption>
                        </figure>
                      );
                    })}
                  </div>
                </div>
                <ul>
                  {o.items.map((item, i) => (
                    <li key={i}>
                      {item.title} · {item.color} · {item.size} × {item.qty}
                    </li>
                  ))}
                </ul>
                <p>
                  بيع {money(o.subtotal_cents)} · شراء{" "}
                  {o.purchase_cents == null
                    ? "غير محدّد"
                    : money(o.purchase_cents)}
                </p>
                <p>
                  توصيل على الزبونة {money(o.delivery_charge_cents)} · كلفة
                  التوصيل {money(o.delivery_cost_cents)}
                </p>
                {o.status === "delivered" && (
                  <p>
                    {o.collected_at ? "تم التحصيل" : "بانتظار التحصيل"} ·{" "}
                    {money(total)}
                  </p>
                )}
                {!returned && o.status !== "cancelled" && (
                  <p>
                    {o.status === "delivered" ? "ربح الطلب" : "الربح المتوقّع"}{" "}
                    {profit === null ? "غير محدّد" : money(profit)}
                  </p>
                )}
                {o.status === "confirmed" && (
                  <MikExpressOrder key={o.city ?? ""} order={o} />
                )}
                {["confirmed", "dispatched"].includes(o.status) &&
                  !o.collected_at &&
                  (editingOrder === o.id ? (
                    <OrderEditForm
                      key={o.id}
                      order={o}
                      products={products}
                      busy={busy}
                      onCancel={() => setEditingOrder(null)}
                      onSave={(changes) =>
                        run(async () => {
                          await api(endpoint, json("PATCH", changes));
                          setEditingOrder(null);
                          await Promise.all([refresh(), loadOrders()]);
                        })
                      }
                    />
                  ) : (
                    <button
                      type="button"
                      className="navchip"
                      disabled={busy}
                      onClick={() => setEditingOrder(o.id)}
                    >
                      تعديل الطلب
                    </button>
                  ))}
                <div className="flex flex-wrap gap-2">
                  {!o.collected_at &&
                    actions[o.status]?.map(([status, label]) => (
                      <button
                        className="navchip"
                        key={status}
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(
                              endpoint,
                              json("PATCH", {
                                id: o.id,
                                status,
                                from: o.status,
                              }),
                            );
                            await Promise.all([refresh(), loadOrders()]);
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                </div>
              </article>
            );
          })}
          <div className="flex gap-3">
            {offset > 0 && (
              <button
                className="navchip"
                disabled={busy}
                onClick={() => run(() => loadOrders(offset - 30))}
              >
                السابق
              </button>
            )}
            {orderPage.more && (
              <button
                className="navchip"
                disabled={busy}
                onClick={() => run(() => loadOrders(offset + 30))}
              >
                التالي
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
