import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment artifacts", () => {
  it("contains production compose, image and PostgreSQL schema", () => {
    expect(existsSync("Dockerfile")).toBe(true);
    expect(existsSync("docker-compose.production.yml")).toBe(true);
    expect(existsSync("prisma/schema.postgres.prisma")).toBe(true);
    expect(readFileSync("prisma/schema.postgres.prisma", "utf8")).toContain('provider = "postgresql"');
  });

  it("documents production safety gates", () => {
    const docs = readFileSync("PRODUCTION_DEPLOYMENT.md", "utf8");
    expect(docs).toContain("MOCK_EMAIL=true");
    expect(docs).toContain("/api/internal/worker");
    expect(docs).toContain("PostgreSQL");
  });
});
