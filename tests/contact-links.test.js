import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
const result = await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup as render} from 'react-dom/server'; import Contacts,{FloatingWhatsApp,CONTACTS} from './src/components/ContactLinks.jsx'; import Header from './src/components/Header.jsx'; import Footer from './src/components/Footer.jsx'; export {React,render,Contacts,FloatingWhatsApp,CONTACTS,Header,Footer};`,
    resolveDir: process.cwd(),
    loader: "jsx",
  },
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["react", "react-dom/server"],
  plugins: [
    {
      name: "isolated-header-render",
      setup(builder) {
        builder.onLoad({ filter: /\/store\.jsx$/ }, () => ({
          contents: "export const useCart=()=>({count:0});",
          loader: "js",
        }));
        builder.onLoad({ filter: /\/CartDrawer\.jsx$/ }, () => ({
          contents: "export default function CartDrawer(){return null;}",
          loader: "js",
        }));
      },
    },
  ],
});
const compiled = { exports: {} };
new Function("require", "module", "exports", result.outputFiles[0].text)(
  createRequire(import.meta.url),
  compiled,
  compiled.exports,
);
const { React, render, Header, Footer, FloatingWhatsApp, CONTACTS } =
  compiled.exports;
const anchors = (html) => [...html.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
test("Header and Contact Us Footer expose exactly the approved safe contact links", () => {
  assert.deepEqual(CONTACTS, {
    instagram: "https://www.instagram.com/_classy_line_/",
    whatsapp: "https://wa.me/9613505598",
  });
  for (const component of [Header, Footer]) {
    const html = render(React.createElement(component));
    const links = anchors(html).filter((a) => a.includes('href="https://'));
    assert.equal(links.length, 2);
    for (const [type, url] of Object.entries(CONTACTS)) {
      const a = links.find((a) => a.includes(`href="${url}"`));
      assert.ok(a);
      assert.match(a, /target="_blank"/);
      assert.match(a, /rel="noopener noreferrer"/);
      assert.match(a, /aria-label="[^"]+opens in a new tab/);
      assert.ok(a.toLowerCase().includes(type));
    }
    assert.match(html, /aria-hidden="true" focusable="false"/);
  }
  const footer = render(React.createElement(Footer));
  assert.match(footer, /Contact Us/);
  assert.match(footer, /\+961 3 505 598/);
  assert.match(footer, /href="\/admin"/);
});
test("mobile contact button has an accessible name and sends no cart/order payload", () => {
  const html = render(React.createElement(FloatingWhatsApp)),
    links = anchors(html);
  assert.equal(links.length, 1);
  assert.match(links[0], /href="https:\/\/wa.me\/9613505598"/);
  assert.match(
    links[0],
    /aria-label="Contact ClassyLine on WhatsApp \(opens in a new tab\)"/,
  );
  assert.match(links[0], /rel="noopener noreferrer"/);
  assert.doesNotMatch(
    html,
    /\?text=|\/api\/|order confirmed|media_publish|<script|<iframe/i,
  );
});
