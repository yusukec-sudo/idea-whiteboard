
export interface Node {
  id: string;
  parentId: string | null;
  title: string;
  x: number;
  y: number;
  note?: string;
  isTheme?: boolean;
}

export interface Edge {
  source: string;
  target: string;
}

export interface SummaryCard {
  title: string;
  summary: string;
  risks: string[];
  nextSteps: string[];
}

export interface AIResponse {
  newNodes?: { id: string; parentId: string | null; title: string; note?: string }[];
  newEdges?: { source: string; target: string }[];
  summaryCards?: SummaryCard[];
  missingPoints?: string[];
}

export type TabType = 'expand' | 'organize' | 'summary' | 'missing';

export interface MapData {
  nodes: Node[];
  edges: Edge[];
  theme: string;
}
