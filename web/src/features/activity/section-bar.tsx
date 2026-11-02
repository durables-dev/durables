import { listingSections, sectionHref } from "./listing-sections";
import { scrollToSection } from "./scroll-to-section";
import styles from "./section-bar.module.css";

// The bar under the top of the page. Each link scrolls to its section, and the bar stays
// stuck to the top of the window while the page scrolls.
export function SectionBar() {
  return (
    <nav aria-label="Page sections" className={styles["bar"]}>
      <ul className={styles["links"]}>
        {listingSections.map(({ id, label }) => (
          <li key={id}>
            <a
              href={sectionHref(id)}
              className={styles["link"]}
              onClick={(event) => {
                scrollToSection(id, event);
              }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
