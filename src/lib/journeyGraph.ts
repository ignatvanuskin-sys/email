import { z } from "zod";

export const graphNodeSchema = z.object({ id: z.string().min(1).max(100), type: z.enum(["trigger", "email", "telegram", "delay", "condition", "goal", "exit"]), title: z.string().trim().min(1).max(200), positionX: z.number().int().min(-10000).max(10000), positionY: z.number().int().min(-10000).max(10000), configJson: z.string().max(20000).default("{}") });
export const graphEdgeSchema = z.object({ id: z.string().min(1).max(100), fromNodeId: z.string().min(1), toNodeId: z.string().min(1), label: z.string().max(120).nullable().optional(), conditionJson: z.string().max(10000).nullable().optional() });
export const graphSchema = z.object({ nodes: z.array(graphNodeSchema).max(100), edges: z.array(graphEdgeSchema).max(200) });

export type JourneyGraph = z.infer<typeof graphSchema>;

export function validateGraph(graph: JourneyGraph): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) { if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`); ids.add(node.id); }
  for (const edge of graph.edges) { if (!ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId)) errors.push(`Edge ${edge.id} references missing node`); if (edge.fromNodeId === edge.toNodeId) errors.push(`Edge ${edge.id} cannot connect a node to itself`); }
  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length > 1) errors.push("A journey can have only one trigger");
  if (graph.nodes.length && triggers.length === 0) errors.push("A journey needs a trigger node");
  return errors;
}
