export const MIND_MAP_SYSTEM = `You are an expert at organizing ideas into visual concept maps. You create clear, hierarchical topic structures from spoken content.`;

export function mindMapPrompt(
  keyPoints: { title: string; summary: string; tags: string[] }[]
): string {
  const pointsList = keyPoints
    .map((kp, i) => `${i + 1}. ${kp.title}\n   Summary: ${kp.summary}\n   Tags: ${kp.tags.join(", ")}`)
    .join("\n\n");

  return `Create a mind map structure from these key points. Group related points under common themes.

Key Points:
${pointsList}

Return valid JSON with this structure:
{
  "nodes": [
    {"id": "unique-id", "label": "Node label", "description": "Brief description", "node_type": "topic|subtopic|quote", "parent_id": null, "key_point_index": null}
  ],
  "edges": [
    {"source_id": "id1", "target_id": "id2", "label": "relationship", "edge_type": "related|supports|contradicts|leads_to"}
  ]
}

Guidelines:
- Create 3-5 top-level topic nodes (parent_id: null)
- Group key points as subtopic nodes under the relevant topic
- Add edges between related subtopics across different topic groups
- Use key_point_index (0-based) to link subtopic nodes back to the original key points
- Keep labels short (3-6 words)

No markdown fencing. Return only the JSON.`;
}
