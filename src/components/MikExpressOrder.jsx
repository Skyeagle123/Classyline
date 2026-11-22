import React, { useRef, useState } from "react";

const ordersUrl = "https://app.mikexpress.com/member/orders";

function CopyField({ label, value, onChange, onStatus }) {
  const inputRef = useRef(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      onStatus(`تم نسخ ${label}.`);
    } catch {
      inputRef.current.focus();
      inputRef.current.select();
      onStatus("النص محدّد. اختار Copy من قائمة التليفون.");
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-36 flex-1">
        {label}
        <input
          ref={inputRef}
          dir="auto"
          className="input"
          value={value}
          readOnly={!onChange}
          onChange={onChange && ((event) => onChange(event.target.value))}
        />
      </label>
      <button
        type="button"
        className="navchip"
        aria-label={`انسخ ${label}`}
        disabled={!value.trim()}
        onClick={copy}
      >
        نسخ
      </button>
    </div>
  );
}

export default function MikExpressOrder({ order }) {
  const [status, setStatus] = useState("");
  const [city, setCity] = useState(order.city ?? "");
  const [firstName, ...rest] = order.customer_name.trim().split(/\s+/);
  const [first, setFirst] = useState(firstName);
  const [last, setLast] = useState(rest.join(" "));
  const total = (
    (order.subtotal_cents + order.delivery_charge_cents) /
    100
  ).toFixed(2);
  const packageDescription = order.items
    .map((item) =>
      [item.title, item.color, item.size, `× ${item.qty}`].join(" · "),
    )
    .join(" / ");
  const fields = [
    ["مرجع الطلب (Order External ID)", order.id],
    ["الاسم", first, setFirst],
    ["الكنية", last, setLast],
    ["رقم الهاتف", order.phone],
    ["المدينة", city, setCity],
    ["العنوان التفصيلي", order.address],
    ["تفاصيل القطع", packageDescription],
    [
      "الكمية الإجمالية",
      String(order.items.reduce((sum, item) => sum + item.qty, 0)),
    ],
    ["مبلغ التحصيل بالدولار (مع التوصيل)", total],
  ];

  return (
    <details className="rounded-xl border border-stone-300 p-3">
      <summary className="cursor-pointer font-semibold">
        جهّز لـMikExpress
      </summary>
      <div className="mt-3 space-y-3">
        <a
          className="btn"
          href={ordersUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          افتح طلبات MikExpress
        </a>
        <p className="text-sm">
          افتح Bulk Create بـMikExpress. انسخ كل خانة والصقها بمطرحها، وراجع
          الطلب قبل الحفظ. إذا كانت المدينة فاضية، فيك تضيفها من تعديل الطلب.
        </p>
        {fields.map(([label, value, onChange]) => (
          <CopyField
            key={label}
            {...{ label, value, onChange }}
            onStatus={setStatus}
          />
        ))}
        <p className="text-sm" role="status">
          {status}
        </p>
      </div>
    </details>
  );
}
