/**
 * Proves the checked-in fixture satisfies the same contract a live Gemini
 * response must: parse, normalise, every validation rule, and every assembled
 * prompt inside the 2048-character endpoint limit.
 *
 *   npm run check:fixture
 */
import { DIAGRAM, layoutChain } from '../lib/diagram';
import { assembleImagePrompt } from '../lib/prompt';
import { normaliseChapter } from '../lib/normalise';
import { chapterResponseSchema, DOMAINS, PROMPT_LIMITS, SHORT_SENTENCE_WORDS, sentences, wordCount } from '../lib/types';
import { validateChapter } from '../lib/validate';
import { FIXTURE_RULE, fixtureChapter } from '../fixtures/chapter-1';

let failed = false;

const parsed = chapterResponseSchema.safeParse(fixtureChapter);
if (!parsed.success) {
  console.error('✗ Schema parse failed:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}
console.log('✓ Parses against chapterResponseSchema');

const { chapter, report } = normaliseChapter(parsed.data, FIXTURE_RULE);
if (report.strippedTokens.length > 0) {
  console.log('  normalisation stripped style tokens:', JSON.stringify(report.strippedTokens));
}

const violations = validateChapter(chapter, { chapterNumber: 1 });
if (violations.length > 0) {
  failed = true;
  console.error(`✗ ${violations.length} rule violation(s):`);
  for (const violation of violations) console.error(`  ${violation}`);
} else {
  console.log('✓ Passes all validation rules');
}

const styleBible = chapter.styleBible ?? '';
console.log(`  styleBible: ${styleBible.length}/${PROMPT_LIMITS.styleBible} chars`);

let longest = 0;
const sceneShare: number[] = [];
for (const page of chapter.pages) {
  const { prompt, droppedEntities, sceneTruncated } = assembleImagePrompt(
    styleBible,
    page,
    chapter.worldCanon.namedEntities,
    chapter.worldCanon.visualLaws,
  );
  longest = Math.max(longest, prompt.length);
  if (prompt.length > PROMPT_LIMITS.total) {
    failed = true;
    console.error(`✗ page ${page.index} prompt is ${prompt.length} chars, over the ${PROMPT_LIMITS.total} limit`);
  }
  // The laws are the only thing carrying the rule to the illustrator. If one
  // ever fails to reach a prompt, every plate on that page silently reverts to
  // the present-day world — which is exactly the bug this mechanism exists for.
  for (const law of chapter.worldCanon.visualLaws) {
    if (!prompt.includes(law)) {
      failed = true;
      console.error(`✗ page ${page.index} does not carry visualLaw "${law.slice(0, 30)}…"`);
    }
  }
  // The scene is the only part that differs between plates. When the shared
  // prefix dominates, every image in the chapter looks the same.
  sceneShare.push(page.imagePrompt.length / prompt.length);
  if (droppedEntities.length > 0 || sceneTruncated) {
    console.warn(`  page ${page.index} needed truncation: dropped=[${droppedEntities.join(', ')}] scene=${sceneTruncated}`);
  }
}
console.log(`✓ Longest assembled prompt: ${longest}/${PROMPT_LIMITS.total} chars`);
console.log(`✓ ${chapter.worldCanon.visualLaws.length} visual laws reach every plate`);

{
  const mean = sceneShare.reduce((a, b) => a + b, 0) / sceneShare.length;
  const lowest = Math.min(...sceneShare);
  console.log(`  scene is ${Math.round(mean * 100)}% of the average prompt, ${Math.round(lowest * 100)}% at worst`);
}

// Pages must be chosen from the chain, not printed off it.
{
  const perEffect = new Map<string, number>();
  for (const p of chapter.pages) perEffect.set(p.derivedFrom, (perEffect.get(p.derivedFrom) ?? 0) + 1);
  const unused = chapter.chain.filter((e) => !perEffect.has(e.id)).map((e) => e.id);
  const busiest = Math.max(...perEffect.values());
  console.log(`  pages per effect: busiest ${busiest}, undramatised [${unused.join(', ') || 'none'}]`);

  const bijection = {
    ...chapter,
    pages: chapter.pages.map((p, i) => ({ ...p, derivedFrom: chapter.chain[i].id })),
  };
  if (validateChapter(bijection, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 16'))) {
    console.log('✓ One page per effect in chain order is rejected');
  } else {
    failed = true;
    console.error('✗ A straight one-page-per-effect dump slipped past the validator');
  }

  const hogged = {
    ...chapter,
    pages: chapter.pages.map((p) => ({ ...p, derivedFrom: 'e1' })),
  };
  if (validateChapter(hogged, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 16'))) {
    console.log('✓ A chapter collapsed onto one effect is rejected');
  } else {
    failed = true;
    console.error('✗ A chapter collapsed onto one effect slipped past the validator');
  }
}

// Voice: rhythm and register, on page text only.
{
  const shortPages = chapter.pages.filter((p) =>
    sentences(p.text).some((s) => wordCount(s) <= SHORT_SENTENCE_WORDS),
  ).length;
  console.log(`  pages with a short sentence: ${shortPages}/${chapter.pages.length}`);

  const flat = {
    ...chapter,
    pages: chapter.pages.map((p) => ({
      ...p,
      text: 'The northern grain strips were ploughed between survey markers that nobody had bothered to move, and the barges came over them at the speed of a slow bicycle.',
    })),
  };
  if (validateChapter(flat, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 18'))) {
    console.log('✓ Twelve pages of identical sentence length are rejected');
  } else {
    failed = true;
    console.error('✗ Uniform sentence rhythm slipped past the validator');
  }

  const stiff = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? { ...p, text: 'The subterranean transit systems flooded first. Then the drains gave out.' }
        : p,
    ),
  };
  if (validateChapter(stiff, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 18'))) {
    console.log('✓ Technical register in page text is rejected');
  } else {
    failed = true;
    console.error('✗ Stiff register slipped past the validator');
  }

  // The chain is the reasoning layer and must stay free to be precise.
  const technicalChain = {
    ...chapter,
    chain: chapter.chain.map((e) => ({ ...e, text: 'Progressive structural collapse reduces ecological carrying capacity.' })),
  };
  if (validateChapter(technicalChain, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 18'))) {
    failed = true;
    console.error('✗ Rule 18 wrongly policed the chain, which is allowed to be technical');
  } else {
    console.log('✓ The chain may stay technical');
  }

  // A sentence that runs on is the clearest symptom of page text drifting into
  // literature, and unlike vocabulary it costs nothing to check.
  const sprawling = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? {
            ...p,
            text: 'The sky never clears, and the dust that used to fall now hangs above the valley in a pale drifting sheet that softens the hills and turns the middle of the day into a long bright afternoon.',
          }
        : p,
    ),
  };
  if (validateChapter(sprawling, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 18'))) {
    console.log('✓ A sentence over the length cap is rejected');
  } else {
    failed = true;
    console.error('✗ A sprawling sentence slipped past the validator');
  }

  const semicoloned = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? { ...p, text: 'The sky never clears; the dust simply hangs there. Rain falls slowly. It feels warm.' }
        : p,
    ),
  };
  if (validateChapter(semicoloned, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 18'))) {
    console.log('✓ A semicolon in page text is rejected');
  } else {
    failed = true;
    console.error('✗ A semicolon slipped past the validator');
  }
}

// Story chapters follow one sequence of events through a few lives. Demanding
// they span four domains is what turned a bicycle accident into a chapter with
// an economics beat, so rule 7 relaxes for them — and only for them.
{
  const twoDomains = {
    ...chapter,
    chain: chapter.chain.map((e, i) => ({ ...e, domain: i < 6 ? DOMAINS[0] : DOMAINS[4] })),
  };
  const asRule = validateChapter(twoDomains, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 7'));
  const asStory = validateChapter(twoDomains, { chapterNumber: 1, mode: 'story' }).some((x) =>
    x.startsWith('Rule 7'),
  );
  if (asRule && !asStory) {
    console.log('✓ Domain spread is required of a derived world, relaxed for a story');
  } else {
    failed = true;
    console.error(`✗ Rule 7 did not follow the mode (rule=${asRule}, story=${asStory})`);
  }

  // Relaxed, not abolished: a story whose every beat lands in one domain is
  // happening in a vacuum, and that is still rejected.
  const singleDomain = {
    ...chapter,
    chain: chapter.chain.map((e) => ({ ...e, domain: DOMAINS[0] })),
  };
  if (validateChapter(singleDomain, { chapterNumber: 1, mode: 'story' }).some((x) => x.startsWith('Rule 7'))) {
    console.log('✓ A story confined to one domain is still rejected');
  } else {
    failed = true;
    console.error('✗ A single-domain story slipped past the validator');
  }
}

// Named entities recur; they do not take over.
{
  const everywhere = {
    ...chapter,
    pages: chapter.pages.map((p) => ({ ...p, entityRefs: ['The Spindle'] })),
  };
  if (validateChapter(everywhere, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 17'))) {
    console.log('✓ An entity on every page is rejected');
  } else {
    failed = true;
    console.error('✗ An entity appearing on every page slipped past the validator');
  }
}

// The arc must tile the pages. The validator checks the shape and deliberately
// says nothing about the labels, so these cases probe the tiling only.
{
  const arcCases: [string, { label: string; fromPage: number; toPage: number }[]][] = [
    ['a gap between movements', [{ label: 'a', fromPage: 1, toPage: 4 }, { label: 'b', fromPage: 6, toPage: 12 }]],
    ['an overlap', [{ label: 'a', fromPage: 1, toPage: 7 }, { label: 'b', fromPage: 5, toPage: 12 }]],
    ['short of the last page', [{ label: 'a', fromPage: 1, toPage: 5 }, { label: 'b', fromPage: 6, toPage: 10 }]],
    ['a single movement', [{ label: 'only', fromPage: 1, toPage: 12 }]],
    ['six movements', Array.from({ length: 6 }, (_, i) => ({ label: `m${i}`, fromPage: i * 2 + 1, toPage: i * 2 + 2 }))],
  ];
  for (const [name, arc] of arcCases) {
    const broken = { ...chapter, arc };
    if (validateChapter(broken, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 15'))) {
      console.log(`✓ Arc with ${name} is rejected`);
    } else {
      failed = true;
      console.error(`✗ Arc with ${name} slipped past the validator`);
    }
  }
  // Uneven movement lengths are the point, not a violation.
  const uneven = {
    ...chapter,
    arc: [
      { label: 'a', fromPage: 1, toPage: 1 },
      { label: 'b', fromPage: 2, toPage: 10 },
      { label: 'c', fromPage: 11, toPage: 12 },
    ],
  };
  if (validateChapter(uneven, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 15'))) {
    failed = true;
    console.error('✗ An uneven but valid arc was rejected');
  } else {
    console.log('✓ Movements of different lengths are allowed');
  }
}

// A law phrased as an absence must be rejected: the image model cannot exclude,
// so "no men anywhere" only succeeds in putting men in the prompt.
{
  const negated = {
    ...chapter,
    worldCanon: { ...chapter.worldCanon, visualLaws: ['no men anywhere in the crowd'] },
  };
  const caught = validateChapter(negated, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 14'));
  if (caught) {
    console.log('✓ A visual law phrased as an absence is rejected');
  } else {
    failed = true;
    console.error('✗ A negated visual law slipped past the validator');
  }
}

// The chain must actually chain. A third-order effect reaching straight back to
// the rule — or sideways to another third-order effect — is misfiled. Seen live:
// e12 lost its order-2 parent and the chapter failed twice on it, so the message
// has to name the eligible parents rather than restate the constraint.
{
  const orphaned = {
    ...chapter,
    chain: chapter.chain.map((e) =>
      e.id === 'e12' ? { ...e, derivedFrom: [{ kind: 'rule' as const }] } : e,
    ),
  };
  const messages = validateChapter(orphaned, { chapterNumber: 1 }).filter((x) => x.startsWith('Rule 5'));
  if (messages.length > 0 && /e5|e6|e7|e8/.test(messages[0])) {
    console.log('✓ An order-3 effect skipping its parent is rejected, with candidates named');
  } else {
    failed = true;
    console.error(`✗ Rule 5 did not catch an orphaned order-3 effect usefully: ${messages[0] ?? 'no message'}`);
  }

  // Sideways: e12 pointing at another order-3 effect is equally misfiled.
  const sideways = {
    ...chapter,
    chain: chapter.chain.map((e) =>
      e.id === 'e12' ? { ...e, derivedFrom: [{ kind: 'effect' as const, id: 'e11' }] } : e,
    ),
  };
  if (validateChapter(sideways, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 5'))) {
    console.log('✓ An order-3 effect derived from another order-3 effect is rejected');
  } else {
    failed = true;
    console.error('✗ A sideways order-3 reference slipped past the validator');
  }
}

// The scene must dominate the assembled image prompt, not the shared prefix.
{
  const bloated = {
    ...chapter,
    styleBible:
      chapter.styleBible +
      ' '.repeat(0) +
      'x'.repeat(Math.max(0, PROMPT_LIMITS.styleBible - (chapter.styleBible?.length ?? 0))),
  };
  if (validateChapter(bloated, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 19'))) {
    console.log('✓ A styleBible crowding out the scene is rejected');
  } else {
    failed = true;
    console.error('✗ A bloated styleBible slipped past the validator');
  }
}

// The through-line has to actually recur in page text, not just be declared.
{
  const untethered = {
    ...chapter,
    pages: chapter.pages.map((p) => ({ ...p, text: p.text.replace(new RegExp(chapter.throughLine.headNoun, 'gi'), 'someone') })),
  };
  if (validateChapter(untethered, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 20'))) {
    console.log('✓ A through-line absent from page text is rejected');
  } else {
    failed = true;
    console.error('✗ An untethered through-line slipped past the validator');
  }
}

// The habitual register — "how things generally are" — is the precise cause
// of the infographic-caption feel, separate from stiff vocabulary.
{
  const habitual = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0 ? { ...p, text: 'These days the crew usually checks the line every morning before the light comes up.' } : p,
    ),
  };
  if (validateChapter(habitual, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 21'))) {
    console.log('✓ The habitual register is rejected');
  } else {
    failed = true;
    console.error('✗ Habitual-register page text slipped past the validator');
  }
}

// Twelve pages opening on "The [Name]…" read as an exhibit gazetteer.
{
  const gazetteer = {
    ...chapter,
    pages: chapter.pages.map((p, i) => ({ ...p, text: `The Thing Number ${i} sits where it always has, unbothered.` })),
  };
  if (validateChapter(gazetteer, { chapterNumber: 1 }).some((x) => x.startsWith('Rule 22'))) {
    console.log('✓ Twelve pages opening on a proper noun is rejected');
  } else {
    failed = true;
    console.error('✗ A gazetteer-rhythm chapter slipped past the validator');
  }
}

const wordStats = chapter.pages.map((p) => wordCount(p.text));
console.log(`  page word counts: ${Math.min(...wordStats)}–${Math.max(...wordStats)}`);

// ── Page 0 layout ─────────────────────────────────────────────────────────
// The layout is deterministic, so it is testable. Overlapping or NaN nodes are
// the failure mode that LLM-authored SVG would have shipped silently.
const layout = layoutChain({
  rule: 'gravity is half as strong',
  chain: chapter.chain,
  pageByEffect: new Map(chapter.pages.map((p) => [p.derivedFrom, p.index])),
});

const finite = (n: number) => Number.isFinite(n);
for (const node of layout.nodes) {
  if (![node.x, node.y, node.width, node.height].every(finite)) {
    failed = true;
    console.error(`✗ node ${node.id} has a non-finite box`);
  }
  for (const line of node.lines) {
    if (line.length > DIAGRAM.charsPerLine) {
      failed = true;
      console.error(`✗ node ${node.id} has a ${line.length}-char line, wrap is ${DIAGRAM.charsPerLine}`);
    }
  }
}

const byColumn = new Map<number, typeof layout.nodes>();
for (const node of layout.nodes) {
  const column = byColumn.get(node.x) ?? [];
  column.push(node);
  byColumn.set(node.x, column);
}
for (const [x, column] of byColumn) {
  const sorted = [...column].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].y < sorted[i - 1].y + sorted[i - 1].height) {
      failed = true;
      console.error(`✗ nodes ${sorted[i - 1].id} and ${sorted[i].id} overlap in column x=${x}`);
    }
  }
}

const nodeIds = new Set(layout.nodes.map((n) => n.id));
for (const edge of layout.edges) {
  if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
    failed = true;
    console.error(`✗ edge ${edge.id} references a missing node`);
  }
}

const illustrated = layout.nodes.filter((n) => n.pageIndex !== undefined).length;
console.log(`✓ Page 0 layout: ${layout.nodes.length} nodes, ${layout.edges.length} edges, no overlaps`);
console.log(`  ${illustrated} of ${chapter.chain.length} effects reach a plate · canvas ${layout.width}×${Math.round(layout.height)}`);

process.exit(failed ? 1 : 0);
