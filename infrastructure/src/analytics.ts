import { TerraformOutput } from "cdktn";
import { Construct } from "constructs";
import { WebAnalyticsSite } from "../.gen/providers/cloudflare/web-analytics-site";

export interface AnalyticsProps {
  /** The Cloudflare account and the durables.dev zone, supplied at deploy. */
  readonly accountId: string;
  readonly zoneId: string;
}

// Cloudflare Web Analytics (ADR 0009). The beacon is added to web/index.html by hand, so
// auto-injection is off and the site token is an output web reads from.
export class Analytics extends Construct {
  constructor(
    scope: Construct,
    id: string,
    { accountId, zoneId }: AnalyticsProps,
  ) {
    super(scope, id);

    const site = new WebAnalyticsSite(this, "site", {
      accountId,
      zoneTag: zoneId,
      autoInstall: false,
    });

    new TerraformOutput(this, "site-token", {
      value: site.siteToken,
      description: "The token for the beacon snippet in web/index.html",
      staticId: true,
    });
  }
}
