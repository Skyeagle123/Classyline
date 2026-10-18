import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { DOMParser } from "@xmldom/xmldom";
import { HEADERS, MAX_ROWS } from "../shared/catalog-import.js";
export const MAX_FILE_BYTES = 1024 * 1024;
const MAX_EXPANDED = 4 * 1024 * 1024;
const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const elements = (node, name) =>
  Array.from(node.getElementsByTagNameNS(ns, name));
const xml = (s) => {
  if (/<!DOCTYPE|<!ENTITY/i.test(s))
    throw Error("XML entities and DTDs are not allowed.");
  let broken = false;
  const doc = new DOMParser({
    onError: () => {
      broken = true;
    },
  }).parseFromString(s, "application/xml");
  if (broken) throw Error("Malformed workbook XML.");
  return doc;
};
// Validate the ZIP directory before any decompression allocation. ZIP64/macros/encryption are refused.
function archive(bytes) {
  if (bytes.byteLength > MAX_FILE_BYTES || bytes.byteLength < 22)
    throw Error("Upload an XLSX file up to 1 MiB.");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (
    end < 0 ||
    v.getUint16(end + 4, true) !== 0 ||
    v.getUint16(end + 6, true) !== 0
  )
    throw Error("Unsupported or damaged XLSX archive.");
  const count = v.getUint16(end + 10, true),
    start = v.getUint32(end + 16, true),
    size = v.getUint32(end + 12, true);
  if (
    count > 200 ||
    count === 65535 ||
    v.getUint16(end + 8, true) !== count ||
    (end >= 20 && v.getUint32(end - 20, true) === 0x07064b50) ||
    start + size !== end
  )
    throw Error("Workbook archive exceeds supported limits.");
  let pos = start,
    total = 0;
  const names = new Set(),
    lengths = new Map();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || v.getUint32(pos, true) !== 0x02014b50)
      throw Error("Damaged XLSX directory.");
    const flags = v.getUint16(pos + 8, true),
      method = v.getUint16(pos + 10, true),
      length = v.getUint32(pos + 24, true),
      n = v.getUint16(pos + 28, true),
      extra = v.getUint16(pos + 30, true),
      comment = v.getUint16(pos + 32, true),
      local = v.getUint32(pos + 42, true);
    if (
      pos + 46 + n + extra + comment > end ||
      local + 30 >= start ||
      v.getUint32(local, true) !== 0x04034b50 ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      throw Error("Encrypted or unsupported workbook.");
    const name = strFromU8(bytes.slice(pos + 46, pos + 46 + n));
    if (
      names.has(name) ||
      name.includes("..") ||
      name.startsWith("/") ||
      name.includes("\\") ||
      /\.bin$|vba|externalLinks/i.test(name)
    )
      throw Error(
        "Duplicate paths, macros and external workbook links are not allowed.",
      );
    names.add(name);
    lengths.set(name, length);
    total += length;
    if (length > 2 * 1024 * 1024 || total > MAX_EXPANDED)
      throw Error("Expanded workbook is too large.");
    pos += 46 + n + extra + comment;
  }
  if (pos !== end) throw Error("Damaged XLSX directory.");
  const files = unzipSync(bytes, {
    filter: (f) =>
      /^(xl\/(workbook.xml|_rels\/workbook.xml.rels|sharedStrings.xml|worksheets\/sheet\d+.xml)|\[Content_Types\].xml)$/.test(
        f.name,
      ),
  });
  for (const [name, data] of Object.entries(files))
    if (data.length !== lengths.get(name))
      throw Error("Workbook size mismatch.");
  return files;
}
export function parseWorkbook(input) {
  const files = archive(new Uint8Array(input));
  const read = (name) => {
    if (!files[name]) throw Error("Required workbook sheet missing.");
    return xml(strFromU8(files[name]));
  };
  const book = read("xl/workbook.xml"),
    rels = read("xl/_rels/workbook.xml.rels");
  const sheet = elements(book, "sheet").find(
    (s) => s.getAttribute("name") === "Products",
  );
  if (!sheet) throw Error("The workbook needs a Products sheet.");
  const id = sheet.getAttribute("r:id");
  const rel = Array.from(rels.getElementsByTagName("Relationship")).find(
    (r) => r.getAttribute("Id") === id,
  );
  if (!rel || rel.getAttribute("TargetMode") === "External")
    throw Error("Invalid Products sheet relationship.");
  const target = rel.getAttribute("Target").replace(/^\/xl\//, "");
  if (!/^worksheets\/sheet\d+\.xml$/.test(target))
    throw Error("Unsupported Products sheet location.");
  const strings = files["xl/sharedStrings.xml"]
    ? elements(read("xl/sharedStrings.xml"), "si").map((s) =>
        elements(s, "t")
          .map((t) => t.textContent)
          .join(""),
      )
    : [];
  if (strings.length > 10000) throw Error("Too many shared strings.");
  const physical = elements(read("xl/" + target), "row");
  if (physical.length > 2000) throw Error("Too many worksheet rows.");
  let header = null;
  const rows = [];
  for (const r of physical) {
    const cells = elements(r, "c"),
      map = new Map(),
      errors = [];
    if (cells.length > HEADERS.length) throw Error("Unexpected extra columns.");
    for (const c of cells) {
      const ref = c.getAttribute("r");
      if (!/^[A-K][1-9]\d{0,6}$/.test(ref))
        throw Error("Unsupported cell reference.");
      const col = ref.charCodeAt(0) - 65;
      if (map.has(col)) throw Error("Duplicate cell.");
      const type = c.getAttribute("t");
      const raw = elements(c, "v")[0]?.textContent || "";
      const value =
        type === "s"
          ? strings[Number(raw)]
          : type === "inlineStr"
            ? elements(c, "t")
                .map((t) => t.textContent)
                .join("")
            : raw;
      if (
        value === undefined ||
        (type && !["s", "inlineStr", "n", "str"].includes(type)) ||
        elements(c, "f").length
      )
        errors.push(ref);
      map.set(col, value ?? "");
    }
    if (!header) {
      if (r.getAttribute("r") !== "1") throw Error("Headers must be in row 1.");
      if (HEADERS.some((h, i) => map.get(i) !== h))
        throw Error("Keep the 11 template column headers unchanged in row 1.");
      header = true;
      continue;
    }
    if ([...map.values()].every((v) => v === "") && !errors.length) continue;
    if (rows.length >= MAX_ROWS)
      throw Error(`Maximum ${MAX_ROWS} product rows per upload.`);
    rows.push({
      ...Object.fromEntries(HEADERS.map((h, i) => [h, map.get(i) || ""])),
      _errors: errors,
      _row: Number(r.getAttribute("r")),
    });
  }
  if (!header || !rows.length) throw Error("No product rows found.");
  return rows;
}
const escape = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
// Typed inline strings preserve exact values and cannot become formula cells.
const safe = (s) => String(s ?? "");
function sheetXML(matrix, instructions = false) {
  const cells = (row, j) =>
    row
      .map((x, i) => {
        const value = safe(x),
          ref = `${String.fromCharCode(65 + i)}${j + 1}`;
        if (
          !instructions &&
          j > 0 &&
          ((i === 4 && /^\d{1,7}(\.\d{1,2})?$/.test(value)) ||
            (i === 7 && /^\d{1,7}$/.test(value)))
        )
          return `<c r="${ref}" s="${i === 4 ? 3 : 2}" t="n"><v>${value}</v></c>`;
        return `<c r="${ref}" s="${j === 0 ? 1 : 2}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
      })
      .join("");
  const validations = instructions
    ? ""
    : `<autoFilter ref="A1:K${Math.max(1, matrix.length)}"/><dataValidations count="2"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Choose a category" error="Use a listed category." sqref="C2:C51"><formula1>"New In,Dresses,Tops,Sets,Jackets,Sale"</formula1></dataValidation><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Choose a status" error="Choose Active or Draft." sqref="K2:K51"><formula1>"Active,Draft"</formula1></dataValidation></dataValidations>`;
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${instructions ? 1 : 11}" width="${instructions ? 100 : 25}" customWidth="1"/></cols><sheetData>${matrix.map((row, j) => `<row r="${j + 1}" ht="${instructions ? 45 : 42}" customHeight="1">${cells(row, j)}</row>`).join("")}</sheetData>${validations}</worksheet>`;
}
// Application runtime exporter: typed numbers or literal strings, never formula cells.
export function createWorkbook(rows = []) {
  const instructions = [
    ["ClassyLine product management"],
    [
      "One row per unique SKU. Keep all 11 headers unchanged. Maximum 50 products and 100 variants per import.",
    ],
    [
      "Categories and Collections: New In, Dresses, Tops, Sets, Jackets, Sale. Collections may be separated by |.",
    ],
    [
      "For multiple variants, use matched lists: Size M | L, Color Blue | Blue, Stock 3 | 2. Omitted existing variants are retained.",
    ],
    [
      "Price USD: number with at most two decimals. Stock: available pieces excluding pending reservations. Status: Active or Draft.",
    ],
    [
      "Image: existing filename under /products/, controlled /products/ path or public HTTPS URL. Excel does not upload images.",
    ],
    [
      "Upload, review every old/new value and stock warning, then confirm. Any invalid row or conflict cancels the whole import.",
    ],
    [
      "Confirmations expire after 10 minutes. After a lost response, retry the same confirmation before previewing again.",
    ],
    [
      "Exports include drafts and are admin-only. Exported text is typed text, never formulas.",
    ],
    [
      "Persistent imports require the DB binding, independent admin secrets and migrations 0001, 0002, 0003.",
    ],
  ];
  const content = {
    "[Content_Types].xml": `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="r1"/><sheet name="Instructions" sheetId="2" r:id="r2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="r3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF241E1B"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFF6F1E8"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF241E1B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheetXML([
      HEADERS,
      ...rows.map((r) => HEADERS.map((h) => r[h] ?? "")),
    ]),
    "xl/worksheets/sheet2.xml": sheetXML(instructions, true),
  };
  return zipSync(
    Object.fromEntries(
      Object.entries(content).map(([name, value]) => [name, strToU8(value)]),
    ),
    { level: 6 },
  );
}
