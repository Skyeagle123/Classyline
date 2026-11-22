import React, { useEffect, useState } from "react";
import { api, money } from "../api.js";

const columns = [
  "الصنف واللون والقياس",
  "القطع المباعة",
  "كلفة القطعة",
  "بيع القطعة",
  "إجمالي الكلفة",
  "إجمالي البيع",
  "الربح",
];

export default function ProductSalesReport() {
  const [filter, setFilter] = useState({ day: "", offset: 0 });
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      report: "products",
      offset: String(filter.offset),
    });
    if (filter.day) params.set("day", filter.day);
    setReport(null);
    setError("");
    api("/admin/whatsapp-sales?" + params, { signal: controller.signal })
      .then(setReport)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [filter]);

  return (
    <section className="space-y-3">
      <p className="text-sm">
        الطلبات اللي تسلّمت. سعر البيع والربح بلا ديليفري.
      </p>
      <label className="block">
        تاريخ تسجيل الطلب (اختياري)
        <input
          type="date"
          className="input"
          value={filter.day}
          onChange={(event) =>
            setFilter({ day: event.target.value, offset: 0 })
          }
        />
      </label>
      {filter.day && (
        <button
          type="button"
          className="navchip"
          onClick={() => setFilter({ day: "", offset: 0 })}
        >
          كل التواريخ
        </button>
      )}
      {error && <p role="alert">{error}</p>}
      {!report && !error && <p role="status">عم يحمّل جدول المبيعات…</p>}
      {report && (
        <>
          <div
            className="overflow-x-auto"
            tabIndex={0}
            aria-label="جدول المبيعات والأرباح"
          >
            <table className="w-full text-right text-sm">
              <thead>
                <tr>
                  {columns.map((label) => (
                    <th
                      scope="col"
                      key={label}
                      className="p-2 whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.products.map((item) => {
                  const price = item.unit_cents * item.quantity;
                  const cost =
                    item.cost_cents === null
                      ? null
                      : item.cost_cents * item.quantity;
                  return (
                    <tr key={JSON.stringify(item)} className="border-t">
                      <th scope="row" className="min-w-36 p-2 font-medium">
                        <div className="flex items-center gap-2">
                          {item.image && (
                            <img
                              src={item.image}
                              alt=""
                              width={44}
                              height={44}
                              className="size-11 shrink-0 rounded border border-stone-200 bg-stone-100 object-contain"
                              loading="lazy"
                              decoding="async"
                            />
                          )}
                          <div>
                            <bdi>{item.title}</bdi>
                            <span className="block font-normal">
                              <bdi>{item.color} · {item.size}</bdi>
                            </span>
                          </div>
                        </div>
                      </th>
                      {[
                        item.quantity,
                        item.cost_cents === null
                          ? "غير مسجّلة"
                          : money(item.cost_cents),
                        money(item.unit_cents),
                        cost === null ? "—" : money(cost),
                        money(price),
                        cost === null ? "—" : money(price - cost),
                      ].map((value, index) => (
                        <td key={index} className="p-2 whitespace-nowrap">
                          {value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t font-semibold">
                <tr>
                  <th scope="row" className="p-2">
                    إجمالي الفترة
                  </th>
                  <td className="p-2">{report.totals.quantity}</td>
                  <td colSpan={2} />
                  <td className="p-2 whitespace-nowrap">
                    {money(report.totals.known_cost_cents)}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {money(report.totals.sales_cents)}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {money(report.totals.known_profit_cents)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {!report.totals.quantity && <p>ما في قطع مسلّمة بهالفترة.</p>}
          {report.totals.missing_quantity > 0 && (
            <p className="text-sm">
              كلفة {report.totals.missing_quantity} قطعة مش مسجّلة. إجمالي
              الكلفة والربح بيحسب بس القطع اللي كلفتها معروفة.
            </p>
          )}
          <div className="flex gap-2">
            {filter.offset > 0 && (
              <button
                type="button"
                className="navchip"
                onClick={() =>
                  setFilter({ ...filter, offset: filter.offset - 30 })
                }
              >
                السابق
              </button>
            )}
            {report.more && (
              <button
                type="button"
                className="navchip"
                onClick={() =>
                  setFilter({ ...filter, offset: filter.offset + 30 })
                }
              >
                التالي
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
