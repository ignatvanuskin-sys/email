import { productionConfigIssues } from "./env";

export function productionEnvIssues(): string[] {
  return productionConfigIssues();
}
