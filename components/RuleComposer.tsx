'use client';

import { useEffect, useRef, useState } from 'react';
import { persistNewWorld, persistNextChapter } from '@/lib/persist';
import {
  chapterResponseSchema,
  NEURONS_PER_PLATE,
  PAGES,
  type ChapterModels,
  type PreflightMode,
  type PreflightResult,
  type StoredWorld,
} from '@/lib/types';

export type ComposerTarget =
  | { mode: 'new' }
  | { mode: 'append'; world: StoredWorld; chapterNumber: number };

interface Props {
  target: ComposerTarget;
  onDone: (worldId: string) => void;
  onCancel?: () => void;
}

type Phase =
  | { kind: 'input' }
  | { kind: 'checking' }
  | { kind: 'interpreted'; rule: string; restated: boolean; mode: PreflightMode }
  | { kind: 'rejected'; reason: string }
  | { kind: 'generating'; rule: string; mode: PreflightMode; startedAt: number; storyKept: boolean }
  | { kind: 'waiting'; rule: string; mode: PreflightMode; secondsLeft: number; message: string }
  | {
      kind: 'failed';
      title: string;
      message: string;
      violations?: string[];
      /** Set when the same request could succeed if sent again. */
      retry?: { rule: string; mode: PreflightMode; storyKept: boolean };
    };

/** Failures that sending the same chapter again will not fix today. */
const FINAL_ERRORS = new Set(['quota_exhausted', 'blocked', 'config', 'bad_request']);

const EXAMPLES = ['gravity is half as strong', 'a world without women'];

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

export default function RuleComposer({ target, onDone, onCancel }: Props) {
  const appending = target.mode === 'append';
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [elapsed, setElapsed] = useState(0);
  const rateLimitRetried = useRef(false);
  // A finished story the server handed back when picture planning failed.
  // Sent again on retry so the story is not rewritten — that would spend more
  // of the day's 20 Gemini requests and lose a story that was fine.
  const keptDraft = useRef<{ key: string; draft: unknown } | null>(null);

  // A chapter is two thinking calls — well over a minute — so the wait needs a visible clock
  // rather than a spinner that says nothing.
  useEffect(() => {
    if (phase.kind !== 'generating') return;
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - phase.startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase.kind !== 'waiting') return;
    if (phase.secondsLeft <= 0) {
      generate(phase.rule, phase.mode);
      return;
    }
    const timer = setTimeout(() => setPhase({ ...phase, secondsLeft: phase.secondsLeft - 1 }), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    setPhase({ kind: 'checking' });
    try {
      const response = await fetch('/api/preflight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      });
      const body = await response.json();

      if (!response.ok) {
        setPhase(describeFailure(body));
        return;
      }

      const verdict = body as PreflightResult;
      if (verdict.verdict === 'unusable') {
        setPhase({ kind: 'rejected', reason: verdict.reason });
        return;
      }
      setPhase({
        kind: 'interpreted',
        rule: verdict.interpretedRule,
        restated: verdict.verdict === 'coercible',
        mode: verdict.mode ?? 'rule',
      });
    } catch (cause) {
      setPhase({
        kind: 'failed',
        title: 'could not reach the classifier',
        message: cause instanceof Error ? cause.message : 'Network error.',
      });
    }
  }

  async function generate(rule: string, mode: PreflightMode) {
    const chapterNumber = appending ? target.chapterNumber : 1;
    const draftKey = `${chapterNumber}|${mode}|${rule}`;
    const draft = keptDraft.current?.key === draftKey ? keptDraft.current.draft : undefined;

    setElapsed(0);
    setPhase({ kind: 'generating', rule, mode, startedAt: Date.now(), storyKept: draft !== undefined });

    try {
      const payload = appending
        ? {
            rule,
            mode,
            chapterNumber,
            styleBible: target.world.styleBible,
            worldCanon: target.world.worldCanon,
            chapterDigests: target.world.chapterDigests,
            draft,
          }
        : { rule, mode, chapterNumber, draft };

      const response = await fetch('/api/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        if (body.error === 'rate_limit' && !rateLimitRetried.current) {
          rateLimitRetried.current = true;
          setPhase({
            kind: 'waiting',
            rule,
            mode,
            secondsLeft: Number(body.retryAfterSeconds) || 30,
            message: body.message,
          });
          return;
        }
        if (body.draft) keptDraft.current = { key: draftKey, draft: body.draft };
        const error = String(body.error ?? 'upstream');
        setPhase({
          ...describeFailure(body),
          retry: FINAL_ERRORS.has(error)
            ? undefined
            : { rule, mode, storyKept: keptDraft.current?.key === draftKey },
        });
        return;
      }

      const chapter = chapterResponseSchema.parse(body.chapter);
      const models = body.models as ChapterModels | undefined;
      keptDraft.current = null;
      if (appending) {
        await persistNextChapter(target.world, chapter, rule, target.chapterNumber, mode, models);
        onDone(target.world.id);
      } else {
        onDone(await persistNewWorld(chapter, rule, mode, models));
      }
    } catch (cause) {
      setPhase({
        kind: 'failed',
        title: 'could not build the chapter',
        message: cause instanceof Error ? cause.message : 'Unknown error.',
      });
    }
  }

  function reset() {
    rateLimitRetried.current = false;
    keptDraft.current = null;
    setPhase({ kind: 'input' });
  }

  // The pre-flight call takes a few seconds. Without its own panel the form just
  // sits there looking inert, so it gets the same treatment as generation.
  if (phase.kind === 'checking') {
    return (
      <Panel>
        <p className="mono mb-3 text-[var(--accent)]">reading your rule…</p>
        <p className="display mb-4 text-2xl text-[var(--text)]">{input.trim()}</p>
        <p className="text-[0.95rem] leading-relaxed text-[var(--dim)]">
          Checking that this is a rule about how reality works, and saying it back to you before
          anything is built.
        </p>
      </Panel>
    );
  }

  if (phase.kind === 'generating' || phase.kind === 'waiting') {
    const waiting = phase.kind === 'waiting';
    return (
      // Plain language, not the name of the internal phase. A reader waiting on
      // a picture book should be told a world is being imagined, not that a
      // model is reasoning.
      <Panel>
        <p className="mono mb-3 text-[var(--accent)]">
          {waiting
            ? 'just a moment'
            : phase.mode === 'story'
              ? 'telling your story…'
              : appending
                ? 'changing your world…'
                : 'imagining your world…'}
        </p>
        <p className="display mb-4 text-2xl text-[var(--text)]">{phase.rule}</p>
        {waiting ? (
          <p className="text-[0.95rem] leading-relaxed text-[var(--dim)]">
            Too many worlds at once. Picking back up in {phase.secondsLeft}s.
          </p>
        ) : (
          <>
            <p className="text-[0.95rem] leading-relaxed text-[var(--dim)]">
              {phase.storyKept
                ? 'The story is already written — planning a picture for every page.'
                : phase.mode === 'story'
                  ? 'Writing what happens next, all the way to the end — then planning a picture for every page.'
                  : appending
                    ? 'Writing a new story in the world you already have — then planning a picture for every page.'
                    : 'Writing a story set in this world — then planning a picture for every page.'}{' '}
              This takes a minute or two.
            </p>
            <p className="mono mt-4 text-[var(--dimmer)]">{elapsed}s elapsed</p>
          </>
        )}
      </Panel>
    );
  }

  if (phase.kind === 'interpreted') {
    return (
      <Panel>
        <p className="mono mb-3 text-[var(--dim)]">
          {phase.mode === 'story'
            ? 'read as a story to continue'
            : phase.restated
              ? 'read as a rule'
              : 'interpreted as'}
        </p>
        <p className="display mb-6 text-2xl leading-snug text-[var(--text)]">{phase.rule}</p>
        {phase.mode === 'story' && (
          <p className="mb-5 text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
            This will be told forward as a story — {PAGES.min} to {PAGES.max} pages of what happens
            next — rather than set in a changed world.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => generate(phase.rule, phase.mode)}
            className="mono border border-[var(--hair-bright)] px-4 py-2 text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
          >
            {/* Confirming here draws the plates too, so the cost belongs on this
                button — it is the last point before the neurons are spent. */}
            {appending
              ? `write chapter ${target.chapterNumber}`
              : phase.mode === 'story'
                ? 'tell this story'
                : 'build this world'}{' '}
            · up to {number.format(PAGES.max * NEURONS_PER_PLATE)} neurons
          </button>
          <button type="button" onClick={reset} className="mono px-2 py-2 text-[var(--dimmer)] hover:text-[var(--text)]">
            edit the rule
          </button>
        </div>
      </Panel>
    );
  }

  if (phase.kind === 'rejected' || phase.kind === 'failed') {
    const isRejection = phase.kind === 'rejected';
    return (
      <Panel tone="alert">
        <p className="mono mb-3 text-[#d96a5b]">{isRejection ? 'not a rule' : phase.title}</p>
        <p className="text-[1rem] leading-relaxed text-[var(--dim)]">
          {isRejection ? phase.reason : phase.message}
        </p>
        {isRejection && (
          <p className="mt-4 text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
            A rule changes how reality works, not how the book looks. Try{' '}
            {EXAMPLES.map((example, i) => (
              <span key={example}>
                {i > 0 && ' or '}
                <button
                  type="button"
                  onClick={() => {
                    setInput(example);
                    reset();
                  }}
                  className="text-[var(--text)] underline underline-offset-4"
                >
                  {example}
                </button>
              </span>
            ))}
            .
          </p>
        )}
        {!isRejection && phase.violations && (
          <ul className="mono mt-4 space-y-1 text-[var(--dimmer)]">
            {phase.violations.slice(0, 6).map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        )}
        {!isRejection && phase.retry?.storyKept && (
          <p className="mt-4 text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
            The story itself was written and is kept. Trying again only redoes the picture planning.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {!isRejection && phase.retry && (
            <button
              type="button"
              onClick={() => phase.retry && generate(phase.retry.rule, phase.retry.mode)}
              className="mono border border-[var(--hair-bright)] px-4 py-2 text-[var(--text)] transition-colors hover:bg-[var(--raised)]"
            >
              try again
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            className="mono border border-[var(--hair)] px-4 py-2 text-[var(--dim)] transition-colors hover:border-[var(--hair-bright)] hover:text-[var(--text)]"
          >
            try another rule
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <form onSubmit={check} className={panelClass()}>
      <label htmlFor="rule" className="mono mb-3 block text-[var(--dim)]">
        {appending ? `add rule ${target.chapterNumber} to this world` : 'change one rule of reality'}
      </label>
      <input
        id="rule"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        maxLength={300}
        autoFocus={appending}
        placeholder={appending ? 'gravity behaves normally again' : EXAMPLES[0]}
        className="display w-full border-b border-[var(--hair-bright)] bg-transparent pb-3 text-2xl text-[var(--text)] outline-none placeholder:text-[var(--dimmer)] focus:border-[var(--accent)] sm:text-3xl"
      />
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {/* No disabled/"reading" state needed here any more: `checking` renders
            its own panel in place of this form. */}
        <button
          type="submit"
          disabled={!input.trim()}
          className="mono border border-[var(--hair-bright)] px-4 py-2 text-[var(--text)] transition-colors hover:bg-[var(--raised)] disabled:cursor-not-allowed disabled:border-[var(--hair)] disabled:text-[var(--dimmer)]"
        >
          read the rule
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="mono text-[var(--dimmer)] hover:text-[var(--text)]">
            cancel
          </button>
        )}
        <p className="mono text-[var(--dimmer)]">
          {appending ? 'the world keeps its look and its history' : `one rule · ${PAGES.min}–${PAGES.max} plates`}
        </p>
      </div>
    </form>
  );
}

const panelClass = (tone?: 'alert') =>
  `border px-6 py-8 ${tone === 'alert' ? 'border-[#d96a5b]/40' : 'border-[var(--hair)]'} bg-[var(--rail)]`;

function Panel({ children, tone }: { children: React.ReactNode; tone?: 'alert' }) {
  return <section className={panelClass(tone)}>{children}</section>;
}

function describeFailure(body: Record<string, unknown>): Extract<Phase, { kind: 'failed' }> {
  const titles: Record<string, string> = {
    quota_exhausted: 'daily quota gone',
    rate_limit: 'rate limited',
    blocked: 'declined',
    truncated: 'response cut off',
    malformed: 'bad response',
    invalid_chapter: 'contract not met',
    invalid_story: 'story not usable',
    config: 'not configured',
    overloaded: 'gemini busy',
    upstream: 'upstream error',
    bad_request: 'bad request',
  };
  const error = String(body.error ?? 'upstream');
  return {
    kind: 'failed',
    title: titles[error] ?? 'failed',
    message:
      typeof body.message === 'string'
        ? body.message
        : 'The chapter it built did not satisfy the contract, twice.',
    violations: Array.isArray(body.violations) ? (body.violations as string[]) : undefined,
  };
}
