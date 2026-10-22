import React from "react";
import ContactLinks from "./ContactLinks.jsx";
export default function Footer() {
  return (
    <footer>
      <p>ClassyLine · Cash on Delivery · Delivery throughout Lebanon</p>
      <section
        className="footer-contact"
        aria-labelledby="footer-contact-title"
      >
        <h2 id="footer-contact-title">Contact Us</h2>
        <ContactLinks text />
      </section>
      <a href="/admin" className="navchip mt-4">
        Store admin
      </a>
    </footer>
  );
}
