import { parseWorkbook } from "./excel.js";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ rows: parseWorkbook(data) });
  } catch (e) {
    self.postMessage({ error: e.message || "Unable to read workbook." });
  }
};
