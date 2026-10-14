'use client';

import { useEffect, useRef } from 'react';
import { DIAGRAM, layoutChain } from '@/lib/diagram';
import { DOMAIN_COLOUR } from '@/lib/domain';
import type { StoredChapter, WorldCanon } from '@/lib/types';

interface Props {
  chapter: StoredChapter;
  priorCanon?: WorldCanon;
  onOpenPage: (pageIndex: number) => void;
  highlightEffectId?: string;
}

/**
 * Page 0. Every coordinate is computed here from the chain the model returned;
 * the model contributes palette and motif hints and nothing else.
 *
 * Nodes carrying a plate number open that page. Nodes without one were reasoned
 * through but never illustrated — which is itself worth being able to see.
 */
export default function ChainDiagram({ chapter, priorCanon, onOpenPage, highlightEffectId }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const pageByEffect = new Map(chapter.pages.map((p) => [p.derivedFrom, p.index]));
  const layout = layoutChain({
    rule: chapter.rule,
    chain: chapter.chain,
    pageByEffect,
    priorCanon,
  });

  useEffect(() => {
    if (!highlightEffectId || !scroller.current) return;
    const node = layout.nodes.find((n) => n.id === highlightEffectId);
    if (!node) return;
    scroller.current.scrollTo({
      left: Math.max(0, node.x - 80),
      behavior: 'smooth',
    });
  }, [highlightEffectId, layout.nodes]);

  return (
    <div className="flex h-full w-full flex-col">
      <header className="mb-3 px-1">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="display text-2xl text-[var(--text)] sm:text-3xl">
            {chapter.number === 1 ? 'How this world came to be' : 'What this rule changed'}
          </h2>
          <p className="text-[1rem] text-[var(--dim)]">Chapter {chapter.number}</p>
        </div>
        <p className="mt-2 max-w-2xl text-[1rem] leading-relaxed text-[var(--dim)]">
          Each box is something that changed. Arrows show what led to what. Boxes marked with a
          page number are in the story — select one to go to that page.
        </p>
        {chapter.transitionNote && (
          <p className="mt-2 max-w-2xl border-l-2 border-[var(--accent)] pl-3 text-[0.95rem] italic leading-relaxed text-[var(--dim)]">
            {chapter.transitionNote}
          </p>
        )}
      </header>

      <div
        ref={scroller}
        className="flex-1 overflow-x-auto overflow-y-hidden rounded-sm border border-[var(--hair)] bg-[var(--vellum)]"
      >
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          width={layout.width}
          height={layout.height}
          role="img"
          aria-label={`Causal chain for the rule: ${chapter.rule}`}
          className="block max-w-none"
        >
          <defs>
            <marker
              id="chain-arrow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="7"
              markerHeight="7"
              orient="auto"
            >
              <path d="M 0 1 L 7 4 L 0 7 z" fill="var(--vellum-ink)" opacity="0.35" />
            </marker>
          </defs>

          {layout.columns.map((column) => (
            <text
              key={column.label}
              x={column.x}
              y={DIAGRAM.margin + 12}
              className="mono"
              fontSize="10.5"
              letterSpacing="1.4"
              fill="var(--vellum-ink)"
              opacity="0.5"
            >
              {column.label.toUpperCase()}
            </text>
          ))}

          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke="var(--vellum-ink)"
              strokeOpacity="0.28"
              strokeWidth="1.4"
              markerEnd="url(#chain-arrow)"
            />
          ))}

          {layout.nodes.map((node) => {
            const isRule = node.kind === 'rule';
            const isCanon = node.kind === 'canon';
            const highlighted = node.id === highlightEffectId;
            const clickable = node.pageIndex !== undefined;

            return (
              <g
                key={node.id}
                onClick={clickable ? () => onOpenPage(node.pageIndex!) : undefined}
                onKeyDown={
                  clickable
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onOpenPage(node.pageIndex!);
                        }
                      }
                    : undefined
                }
                tabIndex={clickable ? 0 : undefined}
                role={clickable ? 'button' : undefined}
                aria-label={clickable ? `${node.label} — open page ${node.pageIndex}` : undefined}
                style={{ cursor: clickable ? 'pointer' : 'default' }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={node.width}
                  height={node.height}
                  rx="2"
                  fill={isRule ? 'var(--vellum-ink)' : isCanon ? 'transparent' : '#f7f3ea'}
                  stroke={highlighted ? 'var(--accent)' : 'var(--vellum-ink)'}
                  strokeOpacity={highlighted ? 1 : isCanon ? 0.35 : 0.22}
                  strokeWidth={highlighted ? 2.5 : 1}
                  strokeDasharray={isCanon ? '3 3' : undefined}
                />

                {node.domain && (
                  <rect
                    x={node.x}
                    y={node.y}
                    width="3"
                    height={node.height}
                    fill={DOMAIN_COLOUR[node.domain]}
                  />
                )}

                {node.lines.map((line, i) => (
                  <text
                    key={i}
                    x={node.x + DIAGRAM.padX}
                    y={node.y + DIAGRAM.padY + 12 + i * DIAGRAM.lineHeight}
                    fontFamily="var(--font-body)"
                    fontSize="12.5"
                    fill={isRule ? 'var(--vellum)' : 'var(--vellum-ink)'}
                    opacity={isCanon ? 0.75 : 1}
                    fontStyle={isCanon ? 'italic' : undefined}
                  >
                    {line}
                  </text>
                ))}

                {/* Only the page number: the domain is already the coloured
                    stripe, and its name meant nothing to most readers. */}
                {node.pageIndex !== undefined && (
                  <text
                    x={node.x + node.width - DIAGRAM.padX}
                    y={node.y + node.height - 5}
                    textAnchor="end"
                    className="mono"
                    fontSize="9"
                    letterSpacing="1"
                    fill="var(--vellum-ink)"
                    opacity="0.45"
                  >
                    PAGE {node.pageIndex}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="mt-2 px-1 text-[0.95rem] text-[var(--dimmer)] sm:hidden">
        Scroll sideways to see the whole picture.
      </p>
    </div>
  );
}
