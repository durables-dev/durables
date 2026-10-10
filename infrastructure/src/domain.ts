import type { ITerraformDependable } from "cdktn";
import { Construct } from "constructs";
import { WorkersCustomDomain } from "../.gen/providers/cloudflare/workers-custom-domain";
import { accountId, hostname, zoneId } from "./config";

export interface DomainProps {
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
      accountId,
      zoneId,
      hostname,
      service: props.workerName,
      dependsOn: props.dependsOn,
    });
  }
}
