import type { Domain, Effect, WorldCanon } from './types';

/**
 * Page 0 is laid out here, deterministically, from the structure the model
 * already returned. The model supplies palette and motif hints only — it never
 * supplies coordinates. An LLM cannot measure text, so LLM-authored SVG collides
 * and overflows exactly when the diagram gets dense enough to be interesting.
 */
export const DIAGRAM = {
  nodeWidth: 208,
  colGap: 92,
  rowGap: 16,
  padX: 14,
  padY: 12,
  lineHeight: 17,
  charsPerLine: 29,
  margin: 28,
  headerHeight: 34,
} as const;

export type NodeKind = 'rule' | 'effect' | 'canon';

export interface DiagramNode {
  id: string;
  kind: NodeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
  label: string;
  domain?: Domain;
  order?: 1 | 2 | 3;
  /** The page this effect is dramatised on, for click-through. */
  pageIndex?: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  path: string;
}

export interface DiagramLayout {
  width: number;
  height: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  columns: { label: string; x: number }[];
}

export function wrapText(text: string, charsPerLine = DIAGRAM.charsPerLine): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= charsPerLine) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

function makeNode(
  id: string,
  kind: NodeKind,
  label: string,
  extra: Partial<DiagramNode> = {},
): DiagramNode {
  const lines = wrapText(label);
  return {
    id,
    kind,
    label,
    lines,
    x: 0,
    y: 0,
    width: DIAGRAM.nodeWidth,
    height: DIAGRAM.padY * 2 + lines.length * DIAGRAM.lineHeight,
    ...extra,
  };
}

export interface LayoutInput {
  rule: string;
  chain: Effect[];
  /** effect id → page index, so a node knows where to send the reader. */
  pageByEffect: Map<string, number>;
  /** Chapter 2+ only: the canon this chapter branches off. */
  priorCanon?: WorldCanon;
}

export function layoutChain({ rule, chain, pageByEffect, priorCanon }: LayoutInput): DiagramLayout {
  const ruleNode = makeNode('rule', 'rule', rule);

  // Chapter 2+: the invariants and tensions the chain actually branches off get
  // their own nodes, so "this chapter touched the existing world" is visible.
  const canonNodes: DiagramNode[] = [];
  const seen = new Set<string>();
  for (const effect of chain) {
    for (const ref of effect.derivedFrom) {
      if (ref.kind !== 'invariant' && ref.kind !== 'liveTension') continue;
      const id = `${ref.kind}:${ref.index}`;
      if (seen.has(id)) continue;
      const pool = ref.kind === 'invariant' ? priorCanon?.invariants : priorCanon?.liveTensions;
      const label = pool?.[ref.index];
      if (!label) continue;
      seen.add(id);
      canonNodes.push(makeNode(id, 'canon', label));
    }
  }

  const columns: DiagramNode[][] = [
    [ruleNode, ...canonNodes],
    chain.filter((e) => e.order === 1).map(effectNode),
    chain.filter((e) => e.order === 2).map(effectNode),
    chain.filter((e) => e.order === 3).map(effectNode),
  ];

  function effectNode(effect: Effect): DiagramNode {
    return makeNode(effect.id, 'effect', effect.text, {
      domain: effect.domain,
      order: effect.order,
      pageIndex: pageByEffect.get(effect.id),
    });
  }

  const columnHeights = columns.map(
    (nodes) =>
      nodes.reduce((sum, node) => sum + node.height, 0) +
      Math.max(0, nodes.length - 1) * DIAGRAM.rowGap,
  );
  const tallest = Math.max(...columnHeights, 0);
  const top = DIAGRAM.margin + DIAGRAM.headerHeight;

  columns.forEach((nodes, columnIndex) => {
    const x = DIAGRAM.margin + columnIndex * (DIAGRAM.nodeWidth + DIAGRAM.colGap);
    let y = top + (tallest - columnHeights[columnIndex]) / 2;
    for (const node of nodes) {
      node.x = x;
      node.y = y;
      y += node.height + DIAGRAM.rowGap;
    }
  });

  const nodes = columns.flat();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: DiagramEdge[] = [];

  for (const effect of chain) {
    const target = byId.get(effect.id);
    if (!target) continue;
    for (const ref of effect.derivedFrom) {
      const sourceId =
        ref.kind === 'rule' ? 'rule'
        : ref.kind === 'effect' ? ref.id
        : `${ref.kind}:${ref.index}`;
      const source = byId.get(sourceId);
      if (!source) continue;

      const x1 = source.x + source.width;
      const y1 = source.y + source.height / 2;
      const x2 = target.x;
      const y2 = target.y + target.height / 2;
      const bend = DIAGRAM.colGap * 0.55;
      edges.push({
        id: `${sourceId}->${effect.id}`,
        from: sourceId,
        to: effect.id,
        path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
      });
    }
  }

  return {
    width: DIAGRAM.margin * 2 + 4 * DIAGRAM.nodeWidth + 3 * DIAGRAM.colGap,
    height: top + tallest + DIAGRAM.margin,
    nodes,
    edges,
    columns: ['The change', 'What it changed', 'What that led to', 'And after that'].map((label, i) => ({
      label,
      x: DIAGRAM.margin + i * (DIAGRAM.nodeWidth + DIAGRAM.colGap),
    })),
  };
}
