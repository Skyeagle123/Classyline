# ClassyLine storefront

Development only. No production release is authorized.

Use Node 24: `npm ci --ignore-scripts`, `npm test`, `npm run security:check`, `npm run build`.
`npm run dev` previews frontend only; the API requires a Pages Functions runtime and isolated DB binding. Missing bindings/secrets fail closed. Local SQLite request tests require no cloud resources or credentials.

See [implementation and release prerequisites](docs/IMPLEMENTATION.md) and [API contract](docs/API.md).
