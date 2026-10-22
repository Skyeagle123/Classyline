# V2.1 WhatsApp and color swatches

Local preparation only. Baseline main: `583105d0c548caf9c81228f0d1f3572d9b6cbe37`, tree `6b9139f265772078cb8d912ad9ad2a888c82d4bb`. No release-controller, dependency, migration or catalog changes.

## Public contact

All storefront contact links point to `https://wa.me/96178719771`; the visible number is `+961 78 719 771`. Header, footer and floating contact share the same component. Links retain `noopener noreferrer` and open WhatsApp only when clicked. No Business API or automated message sending is introduced.

## Checkout configuration contract

Future, separately authorized Cloudflare Pages configuration:

| Setting          | Value                                                              |
| ---------------- | ------------------------------------------------------------------ |
| Project          | classyline2                                                        |
| Variable name    | WHATSAPP_NUMBER                                                    |
| Type             | Plain text, public destination number                              |
| Exact value      | 96178719771                                                        |
| Production scope | Production only after explicit activation authorization            |
| Preview scope    | Separate protected Preview setting only when separately authorized |

The frontend reads `whatsapp_enabled` from the server catalog. A valid canonical international-digits string enables the existing “WhatsApp + Cash on Delivery” choice. COD remains available independently. Missing, malformed, whitespace-containing, non-string, leading-zero and out-of-length values disable WhatsApp and reject new WhatsApp checkout. There is no destination fallback to the public contact link.

Checkout persists the pending order and reserves stock before returning the optional WhatsApp link. The link contains saved reference, item title, size, color, quantity, delivery and total, excluding customer name, phone and address. It does not confirm the order or prove a message was sent. Idempotency and recovery continue returning the saved order without another reservation. The customer explicitly opens/sends WhatsApp after saving; the site does not send messages automatically.

Pages bindings are deployment configuration. Plan a new, separately approved Pages deployment to activate the variable; saving the project setting is not acceptance evidence that an already deployed Functions bundle changed. Set and verify the appropriate environment before that deployment and verify its deployment-specific binding snapshot afterward. No extra deployment is needed solely for activation if the binding is included in the approved V2.1 release. Contact-number and swatch changes themselves also require a code deployment. Official references:

- https://developers.cloudflare.com/pages/functions/bindings/#environment-variables
- https://developers.cloudflare.com/pages/functions/wrangler-configuration/#environment-variables

Production readback on 22 October 2026: current V2 deployment `9f36717b-a93f-410b-858a-4e9c0e4314fe`, source `45ac09182cca5cc989fbae1c967c6e7e849e63c3`, SUCCESS; automatic Production builds disabled; WHATSAPP_NUMBER absent. No setting was changed.

## Color coverage

The 22 distinct Production labels were inspected using a SELECT-only query, with zero rows written. Fixed swatches cover Beige, Black, Bordeaux, Burgundy, Charcoal Grey, Chocolate Brown, Cream, Cream Beige, Emerald Green, Ivory, Light Blue, Light Grey, Magenta, Navy Blue, Olive Green, Pink, Red, Rose Pink, Teal, Washed Blue and White. Existing basic colors and Gray/Grey aliases remain supported.

`Eashed Blue` is an unrecognized existing label. It receives a neutral taupe circle, as do all unknown labels. Its spelling and identity remain unchanged; no guessed correction or label-to-ID normalization is performed. Multi-color descriptions also retain their label with a neutral circle. Display colors are approximate, not a color-calibrated product guarantee.

Swatch styling accepts only fixed allowlisted hex values or the fixed neutral fallback. Inherited names such as `constructor` and `__proto__` never resolve as colors. Labels remain visible; selected state remains expressed through `aria-pressed`, disabled combinations remain disabled, and keyboard focus is visible. Light swatches have a contrasting border, and swatches cannot shrink when labels wrap. Exact stored colors, sizes, variant IDs, price, stock, SKU and Excel contracts are unchanged.

## Qualification and release boundaries

Offline validation uses in-memory SQLite, synthetic orders, mounted React components and local build tooling. No real order, WhatsApp request, R2 write or Cloudflare deployment is executed. A future protected Preview must verify actual mobile/desktop appearance and checkout-choice availability with the approved configuration; live order tests require their own bounded authorization.

Before any V2.1 release, independently review this exact candidate and prepare a new release-controller identity, approved CI and rollback baseline. The existing single-use V2 recovery controller cannot authorize another release. Keep CLASSYLINE_RELEASE_ARMED=false. No merge, dispatch, environment-variable change or deployment is authorized by this package.
