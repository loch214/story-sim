'use client';

import { useEffect, useRef, useState } from 'react';
import { persistNewWorld, persistNextChapter } from '@/lib/persist';
import { BOOKS_PER_DAY } from '@/lib/quota';
import {
  chapterResponseSchema,
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
      /** What happened and what to do, in words for a reader. */
      title: string;
      help: string;
      /** The server's own words, shown folded away as technical detail. */
      message: string;
      violations?: string[];
      /** Set when the same request could succeed if sent again. */
      retry?: { rule: string; mode: PreflightMode; storyKept: boolean };
    };

/** Failures that sending the same chapter again will not fix today. */
const FINAL_ERRORS = new Set(['quota_exhausted', 'blocked', 'config', 'bad_request']);

const EXAMPLES = [
  'gravity is half as strong',
  'nobody can tell a lie',
  'plants grow at night instead of day',
];

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
        title: 'Couldn’t connect',
        help: 'Story-sim couldn’t be reached. Check your internet connection and try again.',
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
        title: 'Your book couldn’t be saved',
        help: 'Something went wrong while finishing your book. Try again in a moment.',
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
        <Status>Reading your idea…</Status>
        <p className="display mb-3 text-2xl text-[var(--text)]">{input.trim()}</p>
        <p className="text-[1rem] leading-relaxed text-[var(--dim)]">
          This takes a few seconds. Nothing is made until you say yes.
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
        <Status>
          {waiting
            ? 'Just a moment'
            : phase.mode === 'story'
              ? 'Telling your story…'
              : appending
                ? 'Writing the next chapter…'
                : 'Writing your book…'}
        </Status>
        <p className="display mb-4 text-2xl text-[var(--text)]">{phase.rule}</p>
        {waiting ? (
          <p className="text-[1rem] leading-relaxed text-[var(--dim)]">
            Lots of people are making books right now. Trying again in {phase.secondsLeft} seconds.
          </p>
        ) : (
          <>
            <p className="max-w-xl text-[1rem] leading-relaxed text-[var(--dim)]">
              {phase.storyKept
                ? 'The story is already written. Now planning a picture for every page.'
                : 'First the story is written, then a picture is planned for every page.'}{' '}
              This usually takes one to two minutes, so keep this tab open. The pictures start
              drawing as soon as it is done.
            </p>
            <p className="mt-4 text-[0.95rem] tabular-nums text-[var(--dimmer)]">
              {formatElapsed(elapsed)}
            </p>
          </>
        )}
      </Panel>
    );
  }

  if (phase.kind === 'interpreted') {
    return (
      <Panel>
        <p className="label mb-2">
          {phase.mode === 'story' ? 'We’ll carry on this story:' : 'We understood your idea as:'}
        </p>
        <p className="display mb-4 text-2xl leading-snug text-[var(--text)] sm:text-3xl">
          {phase.rule}
        </p>
        <p className="mb-6 max-w-xl text-[1rem] leading-relaxed text-[var(--dim)]">
          {phase.mode === 'story'
            ? `You’ll get a ${PAGES.min}–${PAGES.max} page picture book of what happens next.`
            : appending
              ? `You’ll get chapter ${target.chapterNumber}: a new ${PAGES.min}–${PAGES.max} page story in this same world, drawn in the same style.`
              : `You’ll get a ${PAGES.min}–${PAGES.max} page picture book set in a world where this is true.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => generate(phase.rule, phase.mode)} className="btn-primary">
            {appending ? `Yes, write chapter ${target.chapterNumber}` : 'Yes, make my book'}
          </button>
          <button type="button" onClick={reset} className="btn">
            Change it
          </button>
        </div>
        {/* Confirming here draws the pictures too, so the cost is stated here —
            it is the last point before the day's shared allowance is spent. */}
        <p className="mt-5 max-w-xl text-[0.95rem] leading-relaxed text-[var(--dimmer)]">
          Free to make. The pictures come from a shared daily allowance of about {BOOKS_PER_DAY}{' '}
          books for everyone, and this uses one of today’s.
        </p>
      </Panel>
    );
  }

  if (phase.kind === 'rejected' || phase.kind === 'failed') {
    const isRejection = phase.kind === 'rejected';
    const canRetry = !isRejection && phase.retry !== undefined;
    return (
      <Panel tone="alert">
        <p className="display mb-3 text-2xl text-[var(--text)]">
          {isRejection ? 'That doesn’t work as a “what if” yet' : phase.title}
        </p>
        <p className="max-w-xl text-[1rem] leading-relaxed text-[var(--dim)]">
          {isRejection ? phase.reason : phase.help}
        </p>
        {isRejection && (
          <div className="mt-5">
            <p className="label mb-2">Try one of these instead:</p>
            <div className="flex flex-wrap gap-2">
              <Examples
                onPick={(example) => {
                  setInput(example);
                  reset();
                }}
              />
            </div>
          </div>
        )}
        {!isRejection && phase.retry?.storyKept && (
          <p className="mt-4 max-w-xl text-[1rem] leading-relaxed text-[var(--dim)]">
            Good news: your story was written and is saved. Trying again only redoes the picture plan.
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {canRetry && (
            <button
              type="button"
              onClick={() => phase.retry && generate(phase.retry.rule, phase.retry.mode)}
              className="btn-primary"
            >
              Try again
            </button>
          )}
          <button type="button" onClick={reset} className={canRetry ? 'btn' : 'btn-primary'}>
            {isRejection ? 'Write a different idea' : 'Start over'}
          </button>
        </div>
        {/* The server's own words and the validator's list are for whoever is
            debugging, not for the reader — kept, but folded away. */}
        {!isRejection && (phase.message || phase.violations?.length) ? (
          <details className="mt-6 text-[var(--dimmer)]">
            <summary className="cursor-pointer text-[0.95rem] hover:text-[var(--dim)]">
              Technical details
            </summary>
            <div className="mt-3 space-y-2 text-[0.9rem] leading-relaxed">
              {phase.message && <p>{phase.message}</p>}
              {phase.violations && (
                <ul className="list-disc space-y-1 pl-5">
                  {phase.violations.slice(0, 6).map((violation) => (
                    <li key={violation}>{violation}</li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        ) : null}
      </Panel>
    );
  }

  return (
    <form onSubmit={check} className={panelClass()}>
      <label htmlFor="rule" className="display mb-1 block text-2xl text-[var(--text)] sm:text-3xl">
        {appending ? 'What changes next in this world?' : 'What if…'}
      </label>
      <p className="mb-5 max-w-xl text-[1rem] leading-relaxed text-[var(--dim)]">
        {appending
          ? 'Add one more change. The new chapter keeps everything that has happened so far, and the same drawing style.'
          : 'Change one thing about how the world works, and get an illustrated picture book about life there.'}
      </p>
      <input
        id="rule"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        maxLength={300}
        autoFocus={appending}
        placeholder={appending ? 'Type the next change here' : 'Type your idea here'}
        className="display w-full rounded-xl border border-[var(--hair-bright)] bg-[var(--ink)] px-4 py-3.5 text-xl text-[var(--text)] outline-none transition-colors placeholder:text-[var(--dimmer)] focus:border-[var(--accent)] sm:text-2xl"
      />
      {!appending && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[0.95rem] text-[var(--dimmer)]">Or try:</span>
          <Examples onPick={setInput} />
        </div>
      )}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* No disabled/"reading" state needed here any more: `checking` renders
            its own panel in place of this form. */}
        <button type="submit" disabled={!input.trim()} className="btn-primary">
          Continue
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn">
            Cancel
          </button>
        )}
        <p className="text-[0.95rem] text-[var(--dimmer)]">
          You’ll see what we understood before anything is made.
        </p>
      </div>
    </form>
  );
}

function Examples({ onPick }: { onPick: (example: string) => void }) {
  return (
    <>
      {EXAMPLES.map((example) => (
        <button
          key={example}
          type="button"
          onClick={() => onPick(example)}
          className="rounded-full border border-[var(--hair)] px-3 py-1 text-[0.95rem] text-[var(--dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)]"
        >
          {example}
        </button>
      ))}
    </>
  );
}

function Status({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-2.5 text-[1rem] text-[var(--accent)]" role="status">
      <span aria-hidden className="block h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
      {children}
    </p>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds so far`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s so far`;
}

const panelClass = (tone?: 'alert') =>
  `rounded-2xl border px-6 py-7 sm:px-8 sm:py-8 ${tone === 'alert' ? 'border-[#d96a5b]/40' : 'border-[var(--hair)]'} bg-[var(--rail)]`;

function Panel({ children, tone }: { children: React.ReactNode; tone?: 'alert' }) {
  return <section className={panelClass(tone)}>{children}</section>;
}

/**
 * What went wrong, said for a reader rather than a developer. The server's
 * message is kept for the "technical details" fold — it names models and
 * quotas, which is right for debugging and wrong as the headline.
 */
function describeFailure(body: Record<string, unknown>): Extract<Phase, { kind: 'failed' }> {
  const plain: Record<string, { title: string; help: string }> = {
    quota_exhausted: {
      title: 'No more free books today',
      help: 'Today’s shared free allowance has been used up. It refills every day, so please come back tomorrow.',
    },
    rate_limit: {
      title: 'Too many requests at once',
      help: 'Lots of people are using Story-sim right now. Wait a minute, then try again.',
    },
    overloaded: {
      title: 'The writing service is busy',
      help: 'The service that writes the stories is overloaded right now. Wait a minute, then try again.',
    },
    blocked: {
      title: 'This idea couldn’t be written',
      help: 'The writing service declined this idea. Try wording it differently.',
    },
    config: {
      title: 'Story-sim isn’t set up yet',
      help: 'The app is missing its settings, so it can’t make books right now. Whoever runs it needs to fix this.',
    },
    bad_request: {
      title: 'Something went wrong on our side',
      help: 'Trying the same thing again won’t help. Please start over.',
    },
  };
  const error = String(body.error ?? 'upstream');
  const known = plain[error] ?? {
    title: 'Something went wrong',
    help: 'Your book couldn’t be finished this time. This is usually temporary, so try again.',
  };
  return {
    kind: 'failed',
    ...known,
    message: typeof body.message === 'string' ? body.message : '',
    violations: Array.isArray(body.violations) ? (body.violations as string[]) : undefined,
  };
}
