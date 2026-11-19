import React from "react";

export const CONTACTS = Object.freeze({
  instagram: "https://www.instagram.com/_classy_line_/",
  facebook: "https://www.facebook.com/1473141565872907",
  whatsapp: "https://wa.me/96178719771",
});

function ContactIcon({ type }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {type === "instagram" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle
            cx="17.5"
            cy="6.5"
            r="0.8"
            fill="currentColor"
            stroke="none"
          />
        </>
      ) : type === "facebook" ? (
        <path
          d="M14 8h3V4h-3c-3.3 0-5 2-5 5v2h-3v4h3v6h4v-6h3l1-4h-4V9c0-.7.3-1 1-1Z"
          fill="currentColor"
          stroke="none"
        />
      ) : (
        <>
          <path d="M20.5 11.6a8.5 8.5 0 0 1-12.8 7.3L3 20.5l1.5-4.6A8.5 8.5 0 1 1 20.5 11.6Z" />
          <path d="M8 7.6c-.6.5-.8 1.2-.5 2 .9 2.5 2.7 4.3 5.2 5.2.8.3 1.5.1 2-.5l.8-1-2.3-1.2-.8.8a7.6 7.6 0 0 1-2.6-2.6l.8-.8-1.2-2.3Z" />
        </>
      )}
    </svg>
  );
}

function ContactLink({ type, label, className, children }) {
  return (
    <a
      href={CONTACTS[type]}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      className={className}
    >
      <ContactIcon type={type} />
      {children}
    </a>
  );
}

export default function ContactLinks({ text = false, className = "" }) {
  return (
    <nav
      aria-label="Contact ClassyLine"
      className={`contact-links ${className}`}
    >
      <ContactLink
        type="instagram"
        label="Visit ClassyLine on Instagram"
        className="contact-link"
      >
        {text && <span>Instagram</span>}
      </ContactLink>
      <ContactLink
        type="facebook"
        label="Visit ClassyLine on Facebook"
        className="contact-link"
      >
        {text && <span>Facebook</span>}
      </ContactLink>
      <ContactLink
        type="whatsapp"
        label="Contact ClassyLine on WhatsApp"
        className="contact-link"
      >
        {text && <span>WhatsApp · +961 78 719 771</span>}
      </ContactLink>
    </nav>
  );
}

// Direct contact only: no order payload, API request or checkout state change.
export function FloatingWhatsApp() {
  return (
    <ContactLink
      type="whatsapp"
      label="Contact ClassyLine on WhatsApp"
      className="floating-contact"
    >
      <span className="sr-only">WhatsApp contact</span>
    </ContactLink>
  );
}
