/** Shared payload types for the Vue Agent message renderers. */

export interface AgentInlineToken {
  kind: "text" | "bold" | "code";
  text: string;
}

export interface FlowchartNode {
  id: string;
  label: string;
  kind: string;
  stage?: number;
  next?: string[];
}

export interface FlowchartEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowchartData {
  title?: string;
  nodes: FlowchartNode[];
  edges?: FlowchartEdge[];
}

export interface AgentTableColumn {
  key?: string;
  label?: string;
}

export interface AgentTableRow {
  [key: string]: string;
}

export interface AgentMessage {
  role: "agent" | "user";
  type?: string;
  content?: string;
  data?: Record<string, unknown>;
  blocks?: AgentMessage[];
  reasoning?: string;
  flowchart?: FlowchartData;
}
