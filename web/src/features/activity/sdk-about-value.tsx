import { useState } from "react";
import styles from "./sdk-about-value.module.css";
import type { SdkProfile } from "@/lib/sdk-catalog";

export interface SdkAboutValueProps {
  /** The activity's SDK, named as the api names it. */
  sdk: string;
  /** The catalog's profile for the SDK. Undefined while it loads, or when it can't be read. */
  profile: SdkProfile | undefined;
}

// The About card's SDK value: the SDK's logo, its name and its package (API map D1–D9). The
// logo, its credit and its tile all come from the catalog's profile, so web holds no logo
// files and no mapping from an SDK to its logo. Without the profile, the value is the name.
export function SdkAboutValue({ sdk, profile }: SdkAboutValueProps) {
  if (profile === undefined) return sdk;
  if (profile.logoUrl === undefined) {
    return <NameAndPackage sdk={sdk} profile={profile} />;
  }
  // Keyed by the logo's address, so a different logo starts loading afresh.
  return (
    <LogoNameAndPackage
      key={profile.logoUrl}
      sdk={sdk}
      profile={profile}
      logoUrl={profile.logoUrl}
    />
  );
}

interface NameAndPackageProps {
  sdk: string;
  profile: SdkProfile;
}

function NameAndPackage({ sdk, profile }: NameAndPackageProps) {
  return (
    <>
      {sdk}, <span className={styles["package"]}>{profile.package}</span>
    </>
  );
}

interface LogoNameAndPackageProps extends NameAndPackageProps {
  logoUrl: string;
}

type LogoState = "loading" | "loaded" | "failed";

// The name shows alone while the logo loads. The logo and the package then appear together,
// so the row moves once. A logo that fails leaves the name and package, with no image at all.
function LogoNameAndPackage({
  sdk,
  profile,
  logoUrl,
}: LogoNameAndPackageProps) {
  const [logo, setLogo] = useState<LogoState>("loading");
  if (logo === "failed") return <NameAndPackage sdk={sdk} profile={profile} />;
  const tile = profile.lightTile === true ? ` ${styles["tile"]}` : "";
  return (
    <span className={styles["withLogo"]}>
      <img
        src={logoUrl}
        alt={profile.credit ?? ""}
        title={profile.credit}
        className={`${styles["logo"]}${tile}`}
        hidden={logo === "loading"}
        onLoad={() => {
          setLogo("loaded");
        }}
        onError={() => {
          setLogo("failed");
        }}
      />
      <span>
        {logo === "loading" ? (
          sdk
        ) : (
          <NameAndPackage sdk={sdk} profile={profile} />
        )}
      </span>
    </span>
  );
}
