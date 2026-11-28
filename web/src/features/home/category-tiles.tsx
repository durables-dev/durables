import { searchAddress } from "@/lib/search-address";
import { categories, type CategoryName } from "@durables/schemas";
import { useId } from "react";
import { Link } from "react-router";
import styles from "./category-tiles.module.css";

// Each category's icon, a 24-unit stroke path, from the home canvas with five categories
// (Main.dc.html on DUR-120, fiveCategories on).
const icons: Record<CategoryName, string> = {
  "AI models":
    "M8 8h8v8H8zM10 4v4M14 4v4M10 16v4M14 16v4M4 10h4M4 14h4M16 10h4M16 14h4",
  "Data and storage":
    "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  Messaging: "M4 5h16v11H9l-5 4z",
  Payments:
    "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M7 15h4",
  "Workflow patterns": "M4 4h6v5H4zM14 15h6v5h-6zM7 9v4a2 2 0 0 0 2 2h5",
};

// Browse by category: one tile per category on the shared list, in its order. A tile opens
// the results for its category, with no filter turned on. Tiles show no count (DUR-2).
export function CategoryTiles() {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={styles["section"]}>
      <h2 id={headingId} className={styles["heading"]}>
        Browse by category
      </h2>
      <ul className={styles["tiles"]}>
        {categories.map(({ name }) => (
          <li key={name} className={styles["item"]}>
            <Link
              to={searchAddress({ category: name })}
              className={styles["tile"]}
            >
              <svg
                className={styles["icon"]}
                width="22"
                height="22"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path d={icons[name]} />
              </svg>
              <span className={styles["name"]}>{name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
