// Case conversions between a detected activity name and the names derived from it.
// `charge_card`, `chargeCard` and `ChargeCard` all give the words ["charge", "card"].

function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word !== "")
    .map((word) => word.toLowerCase());
}

/** The listing name: `charge_card` → `charge-card`. */
export function toKebabCase(name: string): string {
  return words(name).join("-");
}

/** A Python module name: `charge_card` → `charge_card`. */
export function toSnakeCase(name: string): string {
  return words(name).join("_");
}

/** A Python class name: `charge_card` → `ChargeCard`. */
export function toPascalCase(name: string): string {
  return words(name)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}
