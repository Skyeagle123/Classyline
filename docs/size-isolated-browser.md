# Size ordering isolated qualification

Application SHA 00b25b282d66818632a2d214e7a52ffbd0f8a1cb; tree 823de98f6faa7fcb65ea980f771f1c7318561694.
Independent harness checkout; separate pinned tooling lock; no Production environment or secrets.
45 planned cases: existing 21 isolation/UI cases plus 8 size families at each 360/768/1363 viewport.
39 planned screenshots (15 existing plus 24 size fixtures). Synthetic DOM qualification, not live checkout.
HTTP and WebSocket interception precede page creation. Only loopback static assets are forwarded.
No Functions server, customer catalog access, checkout/recovery/Admin submission or database binding.
New branch phase/storefront-size-browser-qualification is deliberately outside current Cloudflare Preview allowlist.
Automatic hosted Chromium remains pending publication and separate Owner authorization.
