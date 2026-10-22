import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((x) =>
    x.isDirectory() ? walk(`${dir}/${x.name}`) : [`${dir}/${x.name}`],
  );
}
for (const file of ["index.html", ...walk("src")]) {
  const s = readFileSync(file, "utf8");
  assert.ok(
    !/ADMIN_PASSWORD|PRODUCTS_CSV_OVERRIDE|dangerouslySetInnerHTML|eval\(/.test(
      s,
    ),
    `Unsafe frontend pattern in ${file}`,
  );
}
console.log("Frontend secret/auth and injection checks passed");

const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n");
const secretPattern =
  /(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{20,}|sk-[A-Za-z0-9]{24,})/;
for (const file of tracked) {
  if (!/\.(?:js|jsx|mjs|cjs|json|sql|html|md|yml|yaml|toml)$/.test(file))
    continue;
  assert.ok(
    !secretPattern.test(readFileSync(file, "utf8")),
    `Potential credential in ${file}`,
  );
}
console.log("Repository credential-pattern scan passed");
