import React from "react";
import { api } from "../api.js";
function parseFile(file) {
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new Worker(new URL("../excel-worker.js", import.meta.url), {
        type: "module",
      });
    } catch {
      reject(Error("This browser cannot process Excel files securely."));
      return;
    }
    const end = (fn, value) => {
      clearTimeout(timer);
      worker.terminate();
      fn(value);
    };
    const timer = setTimeout(
      () =>
        end(
          reject,
          Error("Workbook processing timed out. Use a smaller file."),
        ),
      5000,
    );
    worker.onmessage = ({ data }) =>
      data.error ? end(reject, Error(data.error)) : end(resolve, data.rows);
    worker.onerror = () => end(reject, Error("Unable to process workbook."));
    file
      .arrayBuffer()
      .then((data) => worker.postMessage(data, [data]))
      .catch((e) => end(reject, e));
  });
}
export default function ExcelCatalog({ refresh }) {
  const [preview, setPreview] = React.useState(null),
    [rows, setRows] = React.useState(null),
    [msg, setMsg] = React.useState(""),
    [busy, setBusy] = React.useState(false),
    [confirmed, setConfirmed] = React.useState(false),
    [summary, setSummary] = React.useState(null);
  async function download(exporting) {
    setBusy(true);
    setMsg("");
    try {
      const { createWorkbook } = await import("../excel.js");
      const records = exporting
        ? (await api("/admin/catalog/export")).rows
        : [];
      const blob = new Blob([createWorkbook(records)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = exporting
        ? "ClassyLine_Catalog_Export.xlsx"
        : "ClassyLine_Product_Template.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file) {
    setPreview(null);
    setRows(null);
    setSummary(null);
    setConfirmed(false);
    setMsg("");
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 1024 * 1024) {
      setMsg("Choose an XLSX file up to 1 MiB.");
      return;
    }
    setBusy(true);
    try {
      const records = await parseFile(file);
      setRows(records);
      setPreview(
        await api("/admin/catalog/preview", {
          method: "POST",
          body: JSON.stringify({ rows: records }),
        }),
      );
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!preview?.ticket || !confirmed || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const result = await api("/admin/catalog/import", {
        method: "POST",
        body: JSON.stringify({
          rows,
          ticket: preview.ticket,
          confirm_changes: true,
        }),
      });
      setSummary(result.summary);
      setPreview(null);
      setRows(null);
      setConfirmed(false);
      try {
        await refresh();
      } catch {
        setMsg("Import saved. Catalog refresh failed; refresh the dashboard.");
      }
    } catch (e) {
      setMsg(
        `${e.message} If the response was lost, retry this same confirmation; it cannot import twice.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-5 space-y-4">
      <h2 className="text-2xl">Manage products with Excel</h2>
      <p>
        Download the template, enter one row per SKU, then upload to review. No
        products change until you confirm every proposed change. Invalid rows
        block the whole import.
      </p>
      <p className="muted text-sm">
        Up to 50 products / 100 variants / 1 MiB. Drafts stay hidden. Excel
        references existing images; it does not upload them.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="navchip"
          disabled={busy}
          onClick={() => download(false)}
        >
          Download Excel template
        </button>
        <button
          className="navchip"
          disabled={busy}
          onClick={() => download(true)}
        >
          Export current catalog
        </button>
      </div>
      <label className="block">
        Upload completed XLSX
        <input
          className="input mt-2"
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            upload(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </label>
      <p role="status">{busy ? "Processing…" : msg}</p>
      {summary && (
        <p role="status">
          Import saved: {summary.created} created, {summary.updated} updated,{" "}
          {summary.unchanged} unchanged, {summary.rejected} rejected.
        </p>
      )}
      {preview && (
        <>
          <p>
            {preview.summary.created} to create · {preview.summary.updated} to
            update · {preview.summary.unchanged} unchanged ·{" "}
            {preview.summary.rejected} rejected
          </p>
          {preview.rows.map((r) => (
            <article key={r.row} className="border rounded-lg p-4 space-y-2">
              <h3>
                Row {r.row}: {r.product?.id || "Invalid SKU"} —{" "}
                {r.errors.length ? "Rejected" : r.action}
              </h3>
              <ul>
                {r.errors.map((e, i) => (
                  <li key={i} role="alert">
                    Error: {e}
                  </li>
                ))}
                {r.warnings.map((w, i) => (
                  <li key={i}>Warning: {w}</li>
                ))}
              </ul>
              {r.after && (
                <details>
                  <summary className="navchip">
                    Review old and new values
                  </summary>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <h4>Current</h4>
                      <pre className="text-sm whitespace-pre-wrap break-all">
                        {JSON.stringify(r.before, null, 2) || "New product"}
                      </pre>
                    </div>
                    <div>
                      <h4>After import</h4>
                      <pre className="text-sm whitespace-pre-wrap break-all">
                        {JSON.stringify(r.after, null, 2)}
                      </pre>
                    </div>
                  </div>
                </details>
              )}
            </article>
          ))}
          <label className="flex gap-3">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy || !preview.can_import}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I reviewed all old/new values, stock changes and Active/Draft
            statuses. Apply the entire import.
          </label>
          <button
            className="btn"
            disabled={busy || !preview.can_import || !confirmed}
            onClick={confirm}
          >
            Confirm import to server
          </button>
          <p className="muted text-sm">
            Preview expires after 10 minutes. A stock/catalog conflict cancels
            all changes. Keep this screen open if a response is lost and retry
            the same confirmation.
          </p>
        </>
      )}
    </section>
  );
}
