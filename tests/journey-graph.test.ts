import { describe, expect, it } from "vitest";
import { validateGraph } from "../src/lib/journeyGraph";

describe("journey graph", () => {
  it("accepts a valid trigger and branch graph", () => {
    expect(validateGraph({ nodes: [{ id: "t", type: "trigger", title: "Trigger", positionX: 0, positionY: 0, configJson: "{}" }, { id: "a", type: "condition", title: "Condition", positionX: 200, positionY: 0, configJson: "{}" }, { id: "b", type: "email", title: "Email", positionX: 400, positionY: 100, configJson: "{}" }], edges: [{ id: "e", fromNodeId: "t", toNodeId: "a", label: "next", conditionJson: null }, { id: "e2", fromNodeId: "a", toNodeId: "b", label: "yes", conditionJson: "[]" }] })).toEqual([]);
  });

  it("rejects missing references and multiple triggers", () => {
    const errors = validateGraph({ nodes: [{ id: "a", type: "trigger", title: "A", positionX: 0, positionY: 0, configJson: "{}" }, { id: "b", type: "trigger", title: "B", positionX: 0, positionY: 0, configJson: "{}" }], edges: [{ id: "e", fromNodeId: "a", toNodeId: "missing", label: null, conditionJson: null }] });
    expect(errors).toEqual(expect.arrayContaining(["A journey can have only one trigger", "Edge e references missing node"]));
  });
});
