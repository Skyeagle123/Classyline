# ClassyLine domain preparation — 22 October 2026

Read-only research only. No registration, reservation, DNS, Pages domain, Access
or hostname modification was performed. Availability is not established by a
missing website or a search-engine result.

## Availability and published price evidence

| Name | Observed availability evidence | Published first-year / renewal evidence |
|---|---|---|
| `classyline.shop` | Registry RDAP GET returned HTTP 404, `errorCode:404`, title `Error in processing request`. This generic response is insufficient to assert availability. Registrar name-specific search could not be retrieved. **Exact-name availability and premium status UNVERIFIED.** | Namecheap's public `.shop` tariff: promotional $0.98 first year (regular $38.98), renewal $48.98/year; $0.20 ICANN fee applies as indicated by the registrar. Thus indicative non-premium totals $1.18 / $49.18 before tax, not a quote for this exact name. Promotions may end and premium names differ. |
| `classyline.com.lb` | Official registry RDAP GET returned HTTP 404, `errorCode:404`, title `No results for query classyline.com.lb`. No matching RDAP record was found; this does **not** prove the name is unrestricted or registrar-orderable. **Final availability UNVERIFIED.** | LBDR publishes $20/year creation and renewal **wholesale to registrars**, excluding VAT; this is not a consumer price. 101domain publishes retail $229.99 registration / $262.99 renewal per year, with mandatory trustee service for its customers. No local accredited registrar's exact-name consumer quote was obtained; their fee may differ substantially. |

Sources read:
- https://www.namecheap.com/domains/registration/gtld/shop/
- https://rdap.gmoregistry.net/rdap/domain/classyline.shop
- https://rdap.lbdr.org.lb/domain/classyline.com.lb
- https://www.iana.org/domains/root/db/.lb.html (official `.lb` RDAP delegation)
- https://lbdr.org.lb/lbdr-schedule-of-fees-for-registrars/
- https://www.101domain.com/com_lb.htm
- https://lbdr.org.lb/find-an-accredited-registrar/
- https://lbdr.org.lb/lbdr-zones-and-requirements/
- https://lbdr.org.lb/register-domain/

For `.com.lb`, LBDR requires a legally registered business entity and the LBDR-A
form plus the applicable Commercial Circular, trademark or private-practice
documents. The registry may request representative authority, Lebanese address
or identity evidence. Do not treat a trademark as universally mandatory based
on an intermediary's older wording; the current registry policy is authoritative.
The Owner's business eligibility has not been established in this task. No such
documents were requested, collected or sent. LBDR lists accredited registrars
including IDM, Sodetel and Terranet; local retail pricing requires their quote.

**Recommendation:** prefer `classyline.shop` if its exact-name availability,
non-premium price and recurring cost are confirmed and accepted. It is shorter,
states the shop's purpose and avoids the unresolved local business-document and
retail-quote requirements. Lebanon-only delivery remains explicit in the site;
the suffix does not restrict checkout geography. If local identity is the Owner's
priority, revisit `.com.lb` after eligibility and a local registrar quote are
verified. Neither domain blocks V2 code review; no purchase is authorized.

## Separate future cutover gates

Cloudflare source: https://developers.cloudflare.com/pages/configuration/custom-domains/

1. Independently approve one exact domain, availability, total first-year and
   renewal price, registrant identity, recovery and ownership. Purchase requires
   separate Owner authorization. Preserve the working `classyline2.pages.dev`.
2. Before connecting a hostname, review existing Access destinations. The existing
   `classyline2.pages.dev` Admin paths and `*.classyline2.pages.dev` Preview
   application do **not** automatically protect an unrelated custom domain.
   Plan equivalent owner-only `/admin`, `/admin/*`, `/api/admin`, `/api/admin/*`
   coverage on every new serving hostname before customer exposure. Keep public
   storefront/catalog/checkout/active images public, and application Admin auth
   and Draft/orphan-image checks intact. No Access policy change is made here.
3. Add the chosen hostname through Pages Custom domains, then configure DNS;
   adding only an unassociated CNAME can produce a 522. An apex domain needs the
   zone in the same Cloudflare account and appropriate nameservers. An externally
   hosted subdomain such as `www` can use a CNAME to `classyline2.pages.dev` after
   Pages association. Keep mail/MX/TXT records intact during any nameserver change.
4. Wait for certificate issuance and verify HTTPS, CAA compatibility and Access
   behavior on canonical, alternate and deployment hostnames. Choose exactly one
   canonical host, plan explicit `www`/apex and Production pages.dev redirects,
   preserve paths/query strings and avoid blanket redirects over Preview/Access
   authentication flows. Canonical metadata and redirect changes need their own
   reviewed source/configuration package; no placeholder domain is installed now.
5. Host-only Admin cookies do not migrate between hostnames. A later Owner login
   on the protected canonical host is required; do not weaken Secure/HttpOnly/
   SameSite or same-origin enforcement. Local carts also belong to an origin;
   warn the Owner about cutover rather than moving or copying customer state.
6. Run bounded authorized smoke checks, preserve the old hostname and document
   DNS/hostname rollback separately. Do not restore D1 or R2 to reverse a DNS
   change, and do not automatically delete orders, products or image objects.
