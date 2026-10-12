import { Link } from "react-router";
import { currentYear } from "./current-year";
import styles from "./site-footer.module.css";

// Terms, Privacy and Security, in that order. About and Contact are out of scope, and the
// footer carries no Temporal disclaimer (DUR-2, rule 4).
const links = [
  { to: "/terms", label: "Terms" },
  { to: "/privacy", label: "Privacy" },
  { to: "/security", label: "Security" },
] as const;

export function SiteFooter() {
  return (
    <footer className={styles["footer"]}>
      <span className={styles["copyright"]}>© {currentYear()} Durables</span>
      <nav aria-label="Footer" className={styles["links"]}>
        {links.map((link) => (
          <Link key={link.to} to={link.to} className={styles["link"]}>
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
