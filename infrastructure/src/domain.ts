import type { ITerraformDependable } from "cdktn";
import { Construct } from "constructs";
import { WorkersCustomDomain } from "../.gen/providers/cloudflare/workers-custom-domain";
import { hostname } from "./config";

export interface DomainProps {
  /** The Cloudflare account and the durables.dev zone, supplied at deploy. */
  readonly accountId: string;
  readonly zoneId: string;
  readonly workerName: string;
  /** The domain names the Worker as a string, so the dependency must be explicit. */
  readonly dependsOn: ITerraformDependable[];
}

// durables.dev routes to the Worker. Cloudflare creates the DNS record and certificate.
// The hostname is proxied, which the Worker's Cache API and web's CSP assume.
export class Domain extends Construct {
  constructor(scope: Construct, id: string, props: DomainProps) {
    super(scope, id);

    new WorkersCustomDomain(this, "apex", {
      accountId: props.accountId,
      zoneId: props.zoneId,
      hostname,
      service: props.workerName,
      dependsOn: props.dependsOn,
    });
  }
}
