import React from "react";
import { categoryGroups } from "../../shared/categories.js";

export default function ShopNavigation() {
  const [open, setOpen] = React.useState(false);
  const trigger = React.useRef(null),
    container = React.useRef(null);
  const panelId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (!container.current?.contains(event.target)) setOpen(false);
    };
    const navigate = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    window.addEventListener("popstate", navigate);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("popstate", navigate);
    };
  }, [open]);
  return (
    <nav
      className="shop-navigation"
      aria-label="Collections"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          trigger.current?.focus();
          event.stopPropagation();
        }
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <a href="/category/new-in" onClick={() => setOpen(false)}>
        New In
      </a>
      <button
        type="button"
        ref={trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        Shop <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      <a href="/category/sale" onClick={() => setOpen(false)}>
        Sale
      </a>
      <div id={panelId} className="shop-panel" hidden={!open}>
        <a
          className="shop-all-link"
          href="/category/shop-all"
          onClick={() => setOpen(false)}
        >
          Shop All →
        </a>
        {categoryGroups.map((group) => (
          <section key={group.slug} aria-label={group.label}>
            <a
              className="shop-group-heading"
              href={`/shop/${group.slug}`}
              onClick={() => setOpen(false)}
            >
              {group.label}
            </a>
            <ul>
              {group.categories.map((category) => (
                <li key={category.slug}>
                  <a
                    href={`/category/${category.slug}`}
                    onClick={() => setOpen(false)}
                  >
                    {category.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </nav>
  );
}
