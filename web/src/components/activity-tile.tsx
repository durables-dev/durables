import { tileColour } from "@/lib/tile-colour";
import styles from "./activity-tile.module.css";

export interface ActivityTileProps {
  /** The activity's title, which with the handle picks the tile's colour. */
  title: string;
  /** The publisher's handle. */
  handle: string;
}

// An activity's icon: the Durables flag in one brand colour on a tint of the same colour,
// picked by title and publisher. Decoration only, so it is hidden from assistive technology.
// Result cards and the profile's activity rows draw it.
export function ActivityTile({ title, handle }: ActivityTileProps) {
  const colour = tileColour(title, handle);

  return (
    <span className={`${styles["tile"]} ${styles[colour]}`} aria-hidden="true">
      <svg width="60%" height="60%" viewBox="0 0 100 100">
        <path d="M14 18 H58 V36 L82 28 V72 L58 64 V82 H14 Z" />
      </svg>
    </span>
  );
}
