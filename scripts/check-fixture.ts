/**
 * Proves the checked-in fixture satisfies the same contract a live chapter
 * must — parse, normalise, every validation rule, prompt assembly inside what
 * Flux actually reads — and that each rule catches the fault it exists for.
 * Also exercises the story parser and the Gemini schema's field order.
 *
 *   npm run check:fixture
 */
import { DIAGRAM, layoutChain } from '../lib/diagram';
import { platesSchemaFor, preflightSchemaForGemini } from '../lib/geminiSchema';
import { assembleImagePrompt } from '../lib/prompt';
import { buildPlatesPrompt, buildStoryPrompt, parseStory } from '../lib/prompts';
import { normaliseChapter } from '../lib/normalise';
import { chapterResponseSchema, PROMPT_LIMITS, wordCount, type ChapterResponse } from '../lib/types';
import { validateChapter, type ValidateOptions } from '../lib/validate';
import { FIXTURE_RULE, fixtureChapter } from '../fixtures/chapter-1';

let failed = false;

function expect(ok: boolean, pass: string, fail: string) {
  if (ok) {
    console.log(`✓ ${pass}`);
  } else {
    failed = true;
    console.error(`✗ ${fail}`);
  }
}

/** Does validating `variant` produce a violation of rule `n`? */
function trips(variant: ChapterResponse, n: number, options: ValidateOptions = { chapterNumber: 1 }) {
  return validateChapter(variant, options).some((x) => x.startsWith(`Rule ${n}:`));
}

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
  console.log(`✓ Passes all validation rules (${chapter.pages.length} pages)`);
}

// ── Image prompt assembly ─────────────────────────────────────────────────
const styleBible = chapter.styleBible ?? '';
console.log(`  styleBible: ${styleBible.length}/${PROMPT_LIMITS.styleBible} chars`);

{
  let longest = 0;
  for (const page of chapter.pages) {
    const { prompt, droppedEntities, sceneTruncated } = assembleImagePrompt(
      styleBible,
      page,
      chapter.worldCanon.namedEntities,
      chapter.worldCanon.visualLaws,
      chapter.hero,
    );
    longest = Math.max(longest, prompt.length);
    if (prompt.length > PROMPT_LIMITS.assembled) {
      failed = true;
      console.error(`✗ page ${page.index} prompt is ${prompt.length} chars, over the ${PROMPT_LIMITS.assembled} budget`);
    }
    // The laws carry the rule to the illustrator. They must reach every plate,
    // and reach it BEFORE the styleBible — the tail is what the encoder clips.
    for (const law of chapter.worldCanon.visualLaws) {
      const at = prompt.indexOf(law);
      if (at === -1 || at > prompt.indexOf(styleBible)) {
        failed = true;
        console.error(`✗ page ${page.index}: visualLaw "${law.slice(0, 30)}…" is missing or after the styleBible`);
      }
    }
    // The hero is drawn from the same words every time they appear.
    const carriesLook = prompt.includes(chapter.hero.look);
    if (carriesLook !== Boolean(page.heroInScene)) {
      failed = true;
      console.error(`✗ page ${page.index}: hero look ${carriesLook ? 'present' : 'absent'} but heroInScene is ${page.heroInScene}`);
    }
    if (!prompt.startsWith(page.imagePrompt)) {
      failed = true;
      console.error(`✗ page ${page.index}: the scene does not lead the prompt`);
    }
    if (droppedEntities.length > 0 || sceneTruncated) {
      console.warn(`  page ${page.index} needed truncation: dropped=[${droppedEntities.join(', ')}] scene=${sceneTruncated}`);
    }
  }
  console.log(`✓ Longest assembled prompt: ${longest}/${PROMPT_LIMITS.assembled} chars; laws before style, hero look on hero pages`);

  // Worst case: every cap filled — a recurring person and a place — and a
  // legacy 320-character styleBible.
  const worst = assembleImagePrompt(
    'x'.repeat(320),
    { ...chapter.pages[0], imagePrompt: 'y'.repeat(PROMPT_LIMITS.imagePrompt), heroInScene: true, entityRefs: ['Sister', 'Place'] },
    [
      { name: 'Sister', type: 'person', visualDescription: 'p'.repeat(PROMPT_LIMITS.entityDescriptionMax) },
      { name: 'Place', type: 'place', visualDescription: 'z'.repeat(PROMPT_LIMITS.entityDescriptionMax) },
    ],
    Array.from({ length: 3 }, () => 'w'.repeat(PROMPT_LIMITS.visualLawMax)),
    { ...chapter.hero, look: 'v'.repeat(PROMPT_LIMITS.heroLook) },
  );
  expect(
    worst.prompt.length <= PROMPT_LIMITS.assembled && !worst.sceneTruncated && worst.droppedEntities.length === 0,
    `Worst case fits untrimmed: ${worst.prompt.length}/${PROMPT_LIMITS.assembled}`,
    `Worst case needed trimming: ${worst.prompt.length} chars`,
  );

  // A recurring person is held like the hero: right after the hero's look,
  // ahead of the laws; a place comes after them.
  const order = assembleImagePrompt(
    'STYLE',
    { ...chapter.pages[0], imagePrompt: 'SCENE', heroInScene: true, entityRefs: ['Place', 'Sister'] },
    [
      { name: 'Sister', type: 'person', visualDescription: 'SISTER' },
      { name: 'Place', type: 'place', visualDescription: 'PLACE' },
    ],
    ['LAW'],
    { ...chapter.hero, look: 'HERO' },
  ).prompt;
  const at = (part: string) => order.indexOf(part);
  expect(
    at('SCENE') < at('HERO') && at('HERO') < at('SISTER') && at('SISTER') < at('LAW') && at('LAW') < at('PLACE') && at('PLACE') < at('STYLE'),
    'Assembly: scene, hero, recurring person, laws, place, style',
    `Assembly order wrong: ${order}`,
  );
}

// ── Page count ────────────────────────────────────────────────────────────
{
  const short = {
    ...chapter,
    pages: chapter.pages.slice(0, 11),
    arc: [{ label: 'a', fromPage: 1, toPage: 5 }, { label: 'b', fromPage: 6, toPage: 11 }],
  };
  expect(trips(short, 1), 'Eleven pages are rejected', 'An eleven-page chapter slipped past');

  const extra = (k: number) =>
    Array.from({ length: k }, (_, i) => ({ ...chapter.pages[12], index: chapter.pages.length + i + 1 }));
  const withPages = (k: number) => ({
    ...chapter,
    pages: [...chapter.pages, ...extra(k)],
    arc: [...chapter.arc.slice(0, -1), { ...chapter.arc.at(-1)!, toPage: chapter.pages.length + k }],
  });
  const fifteenProblems = validateChapter(withPages(2), { chapterNumber: 1 });
  expect(fifteenProblems.length === 0, 'Fifteen pages are accepted', `A valid fifteen-page chapter was rejected: ${fifteenProblems[0]}`);
  expect(trips(withPages(3), 1), 'Sixteen pages are rejected', 'A sixteen-page chapter slipped past');
}

// ── What reaches the illustrator ──────────────────────────────────────────
{
  // "a world without men": a single "men" in one scene puts men on that plate.
  const withoutMen = (c: ChapterResponse): ChapterResponse => ({
    ...c,
    worldCanon: { ...c.worldCanon, neverDrawn: ['man', 'men', 'boy', 'boys', 'he', 'him', 'his'] },
  });
  expect(trips(withoutMen(chapter), 23), 'A neverDrawn word in an image prompt is rejected', 'A neverDrawn word reached an image prompt');

  const cleaned = withoutMen({
    ...chapter,
    pages: chapter.pages.map((p) => ({
      ...p,
      imagePrompt: p.imagePrompt.replace(/women, men and children/g, 'women and girls').replace(/women and men/g, 'women'),
    })),
  });
  const cleanedProblems = validateChapter(cleaned, { chapterNumber: 1 });
  expect(cleanedProblems.length === 0, 'Prompts free of neverDrawn words, naming who is there, pass', `A clean chapter was rejected: ${cleanedProblems[0]}`);

  // Rule 24: in a world whose rules change who exists, "commuters" is drawn
  // from today's world.
  const platform = (who: string) =>
    `${who} wait on a station platform at dusk, coats flapping in the wind, a train pulling in under a hazy amber sky, puddles reflecting the lamps along the platform edge.`;
  const withScene = (scene: string, canon = cleaned.worldCanon): ChapterResponse => ({
    ...cleaned,
    worldCanon: canon,
    pages: cleaned.pages.map((p, i) => (i === 4 ? { ...p, imagePrompt: scene } : p)),
  });
  expect(trips(withScene(platform('Commuters')), 24), 'A vague word for people is rejected where the rules change who exists', 'A vague "commuters" slipped past rule 24');
  expect(!trips(withScene(platform('A crowd of women')), 24), '"A crowd of women" passes rule 24', 'Rule 24 fired on a prompt that names who is there');
  expect(
    !trips(withScene(platform('Commuters'), { ...cleaned.worldCanon, neverDrawn: ['dog', 'dogs'] }), 24),
    'Rule 24 stays off when the rules remove no kind of person',
    'Rule 24 fired in a world that only lost dogs',
  );

  const heroless = { ...chapter, pages: chapter.pages.map((p) => ({ ...p, heroInScene: false })) };
  expect(trips(heroless, 25), 'A hero missing from the pictures is rejected', 'A chapter that never draws its hero slipped past');

  const thin = { ...chapter, pages: chapter.pages.map((p, i) => (i === 0 ? { ...p, imagePrompt: 'A girl on a hill.' } : p)) };
  expect(trips(thin, 13), 'A thin scene is rejected', 'A one-line scene slipped past');

  const negated = { ...chapter, worldCanon: { ...chapter.worldCanon, visualLaws: ['no men anywhere in the crowd'] } };
  expect(trips(negated, 14), 'A visual law phrased as an absence is rejected', 'A negated visual law slipped past');

  const crowded = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0 ? { ...p, entityRefs: ['The Spindle', 'The Ridge Line', 'The Storm Net'] } : p,
    ),
  };
  expect(trips(crowded, 9), 'Three entityRefs on one page are rejected', 'Three entityRefs slipped past');

  // Rule 26: anyone drawn by costume has an age.
  const ageless = { ...chapter, hero: { ...chapter.hero, look: 'a tall slender girl in a navy wool coat and a red scarf' } };
  expect(trips(ageless, 26), 'A hero look with no age is rejected', 'An ageless hero look slipped past');
  const agelessSister = {
    ...chapter,
    worldCanon: {
      ...chapter.worldCanon,
      namedEntities: [
        ...chapter.worldCanon.namedEntities,
        { name: 'Bee', type: 'person' as const, visualDescription: 'a small girl in a yellow knit cap and one red mitten' },
      ],
    },
  };
  expect(trips(agelessSister, 26), 'A recurring person with no age is rejected', 'An ageless person slipped past');
  const aged = {
    ...agelessSister,
    worldCanon: {
      ...agelessSister.worldCanon,
      namedEntities: agelessSister.worldCanon.namedEntities.map((e) =>
        e.name === 'Bee' ? { ...e, visualDescription: 'a girl of six in a yellow knit cap and one red mitten' } : e,
      ),
    },
  };
  expect(!trips(aged, 26), '"A girl of six" counts as an age', '"A girl of six" was refused an age');

  // Close-ups of somebody are pulled back; a close-up of a thing alone stays.
  const tight = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? { ...p, shotType: 'close-up' as const, heroInScene: false, imagePrompt: 'The girl reaches forward to push a cream envelope into the dark slot of a red postbox in the snow.' }
        : i === 1
          ? { ...p, shotType: 'detail' as const, heroInScene: false, imagePrompt: 'A cream envelope lies on a wooden floor below a brass letter slot, snow light from the window.' }
          : p,
    ),
  };
  const { chapter: widened, report } = normaliseChapter(tight, FIXTURE_RULE);
  expect(
    widened.pages[0].shotType === 'medium' && widened.pages[1].shotType === 'detail' && report.widenedShots.join() === '1',
    'A close-up with somebody in it becomes medium; an object alone stays tight',
    `Close-up widening wrong: ${widened.pages[0].shotType}, ${widened.pages[1].shotType}`,
  );

  // A recurring person the text names is attached to the picture — ahead of the
  // place — unless nobody is in the picture at all.
  const withMara = {
    ...chapter,
    worldCanon: {
      ...chapter.worldCanon,
      namedEntities: [
        ...chapter.worldCanon.namedEntities,
        { name: 'Mara', type: 'person' as const, visualDescription: 'a woman of forty with red hair and a green apron' },
      ],
    },
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? { ...p, text: '"Are you Mara?" Nell asked at the yellow door.', imagePrompt: 'A woman in a flour-dusted apron opens a yellow door to a girl holding a book, in daylight.', entityRefs: ['The Spindle'] }
        : i === 1
          ? { ...p, shotType: 'detail' as const, heroInScene: false, text: 'On the back page was one name: Mara.', imagePrompt: 'An open brown book on a wool blanket, a name written in pencil on the back page.', entityRefs: [] }
          : p,
    ),
  };
  const { chapter: attached, report: attachReport } = normaliseChapter(withMara, FIXTURE_RULE);
  expect(
    attached.pages[0].entityRefs.join() === 'Mara,The Spindle' &&
      attached.pages[1].entityRefs.length === 0 &&
      attachReport.attachedPeople.length === 1 &&
      !trips(attached, 9),
    'A person named in the text joins the picture; a picture with nobody in it is left alone',
    `Attach wrong: ${JSON.stringify([attached.pages[0].entityRefs, attached.pages[1].entityRefs])}`,
  );

  // Named but absent: "Mia was gone" over a scene of the hero alone. Neither
  // auto-attached nor kept if the model listed her.
  const missing = {
    ...withMara,
    worldCanon: {
      ...withMara.worldCanon,
      namedEntities: [
        ...withMara.worldCanon.namedEntities,
        { name: 'Mia', type: 'person' as const, visualDescription: 'a girl of ten in a yellow dress and blue boots' },
      ],
    },
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? { ...p, heroInScene: true, text: '"Mia," Nell said to the quiet wind. Mia was gone.', imagePrompt: 'The girl stands alone on a grassy hill, looking out at the wind in the long grass under an empty sky.', entityRefs: [] }
        : i === 1
          ? { ...p, heroInScene: true, text: 'Mia had left the code for her.', imagePrompt: 'The girl wipes her eyes beside a red iron water pump on a sunny hill.', entityRefs: ['Mia'] }
          : i === 2
            ? { ...p, heroInScene: true, text: 'Mia waved from the gate.', imagePrompt: 'The girl runs toward her older sister, who waves from a wooden gate in the evening light.', entityRefs: [] }
            : p,
    ),
  };
  const { chapter: absent } = normaliseChapter(missing, FIXTURE_RULE);
  expect(
    absent.pages[0].entityRefs.length === 0 &&
      absent.pages[1].entityRefs.length === 0 &&
      absent.pages[2].entityRefs.includes('Mia'),
    'A person named but not shown stays out of the picture; one the scene shows is attached',
    `Absent-person handling wrong: ${JSON.stringify(absent.pages.slice(0, 3).map((p) => p.entityRefs))}`,
  );
}

// ── Arc tiling ────────────────────────────────────────────────────────────
{
  const last = chapter.pages.length;
  const arcCases: [string, { label: string; fromPage: number; toPage: number }[]][] = [
    ['a gap between movements', [{ label: 'a', fromPage: 1, toPage: 4 }, { label: 'b', fromPage: 6, toPage: last }]],
    ['an overlap', [{ label: 'a', fromPage: 1, toPage: 7 }, { label: 'b', fromPage: 5, toPage: last }]],
    ['short of the last page', [{ label: 'a', fromPage: 1, toPage: 5 }, { label: 'b', fromPage: 6, toPage: last - 1 }]],
    ['a single movement', [{ label: 'only', fromPage: 1, toPage: last }]],
  ];
  for (const [name, arc] of arcCases) {
    expect(trips({ ...chapter, arc }, 15), `Arc with ${name} is rejected`, `Arc with ${name} slipped past`);
  }
}

// ── The chain must chain ──────────────────────────────────────────────────
{
  const orphaned = {
    ...chapter,
    chain: chapter.chain.map((e) => (e.id === 'e12' ? { ...e, derivedFrom: [{ kind: 'rule' as const }] } : e)),
  };
  const messages = validateChapter(orphaned, { chapterNumber: 1 }).filter((x) => x.startsWith('Rule 5'));
  expect(
    messages.length > 0 && /e5|e6|e7|e8/.test(messages[0]),
    'An order-3 entry skipping its parent is rejected, with candidates named',
    `Rule 5 did not catch an orphan usefully: ${messages[0] ?? 'no message'}`,
  );

  const sideways = {
    ...chapter,
    chain: chapter.chain.map((e) => (e.id === 'e12' ? { ...e, derivedFrom: [{ kind: 'effect' as const, id: 'e11' }] } : e)),
  };
  expect(trips(sideways, 5), 'An order-3 entry derived from another order-3 entry is rejected', 'A sideways order-3 reference slipped past');
}

// ── Bookkeeping is repaired, not sent back ────────────────────────────────
// A finished book was thrown away twice over e9 citing e4 — a wrong arrow in
// a diagram the reader rarely opens. Normalisation now fixes such faults; the
// validator above still names them for anything that skips normalisation.
{
  const broken: ChapterResponse = {
    ...chapter,
    chain: chapter.chain.map((e) =>
      e.id === 'e9'
        ? { ...e, derivedFrom: [{ kind: 'effect' as const, id: 'e4' }] }
        : e.id === 'e2'
          ? { ...e, derivedFrom: [{ kind: 'effect' as const, id: 'e7' }] }
          : e.id === 'e12'
            ? { ...e, derivedFrom: [{ kind: 'effect' as const, id: 'e11' }], text: Array(40).fill('word').join(' ') }
            : e,
    ),
    pages: chapter.pages.map((p, i) =>
      i === 0 ? { ...p, derivedFrom: 'e99', entityRefs: ['Nowhere', ...p.entityRefs] } : p,
    ),
    arc: [
      { label: 'One two three four five six seven eight nine ten eleven twelve', fromPage: 1, toPage: 4 },
      { label: 'b', fromPage: 6, toPage: 9 },
      { label: 'c', fromPage: 9, toPage: 11 },
    ],
    worldCanon: { ...chapter.worldCanon, invariants: Array.from({ length: 12 }, (_, i) => `fact ${i}`) },
  };
  expect(trips(broken, 5) && trips(broken, 3) && trips(broken, 15) && trips(broken, 10), 'The broken variant trips rules 3, 5, 10 and 15 raw', 'The broken variant did not trip as built');
  const { chapter: mended, report: mendReport } = normaliseChapter(broken, FIXTURE_RULE, { chapterNumber: 1 });
  const left = validateChapter(mended, { chapterNumber: 1 });
  const e9 = mended.chain.find((e) => e.id === 'e9')!;
  expect(
    left.length === 0 &&
      e9.derivedFrom.some((r) => r.kind === 'effect' && ['e5', 'e6', 'e7', 'e8'].includes(r.id)) &&
      mended.arc.at(-1)!.toPage === mended.pages.length &&
      mendReport.repairs.length > 0,
    `Bookkeeping faults are repaired before validation (${mendReport.repairs.length} repairs)`,
    `Repair left: ${left.join(' | ')}`,
  );

  // Chapter 2: its own styleBible is dropped, and a chain that never touches
  // the existing world is tied to it.
  const prior = { ...chapter.worldCanon, liveTensions: ['the rope may not hold'] };
  const second: ChapterResponse = {
    ...chapter,
    worldTitle: undefined,
    chain: chapter.chain.map((e) => ({ ...e, derivedFrom: e.derivedFrom.filter((r) => r.kind === 'rule' || r.kind === 'effect') })),
  };
  const { chapter: mended2 } = normaliseChapter(second, FIXTURE_RULE, { chapterNumber: 2, priorCanon: prior });
  const left2 = validateChapter(mended2, { chapterNumber: 2, priorCanon: prior, worldStyleBible: chapter.styleBible });
  expect(
    !left2.some((x) => /Rule (5|6|11)/.test(x)),
    'Chapter 2 bookkeeping (own styleBible, untouched world) is repaired',
    `Chapter 2 repair left: ${left2.join(' | ')}`,
  );
}

// ── Prose is no longer policed ────────────────────────────────────────────
// The retired voice rules rejected semicolons, long sentences and "usually".
// None of them could make a plot. A page is now written however the story needs.
{
  const free = {
    ...chapter,
    pages: chapter.pages.map((p, i) =>
      i === 0
        ? {
            ...p,
            text: 'The sky never clears; these days the dust usually just hangs above the valley in a pale drifting sheet that softens every hill and turns noon into a long bright afternoon.',
          }
        : p,
    ),
  };
  const freeProblems = validateChapter(free, { chapterNumber: 1 });
  expect(freeProblems.length === 0, 'Page prose is not style-policed', `A stylistic choice was rejected: ${freeProblems[0]}`);
}

// ── The story parser ──────────────────────────────────────────────────────
{
  const pagesText = (k: number, dress = (i: number) => `PAGE ${i}`) =>
    Array.from(
      { length: k },
      (_, i) => `${dress(i + 1)}\nSomething happened on page ${i + 1}, and so the girl did something about it.`,
    ).join('\n\n');

  const planned = parseStory(
    `PLAN\nTROUBLE: the tower sways\nWANT: to keep the rope\n\nTITLE: The Long Fall\nSUMMARY: A girl saves a tower.\nHERO: Nell, a girl of nine\n\n${pagesText(13)}`,
    { first: true },
  );
  expect(
    planned.ok &&
      planned.story.plan === 'TROUBLE: the tower sways\nWANT: to keep the rope' &&
      planned.story.title === 'The Long Fall' &&
      planned.story.pages.length === 13,
    'The PLAN block is kept apart from the story',
    `PLAN parse wrong: ${JSON.stringify(planned)}`,
  );

  const good = parseStory(`TITLE: The Long Fall\nSUMMARY: A girl saves a tower.\nHERO: Nell\n\n${pagesText(13)}`, { first: true });
  expect(
    good.ok && good.story.pages.length === 13 && good.story.title === 'The Long Fall' && good.story.heroRole === 'Nell',
    'A plain story parses',
    `A plain story failed to parse: ${JSON.stringify(good)}`,
  );

  const dressed = parseStory(
    `**TITLE:** The Long Fall\n**SUMMARY:** A girl saves a tower.\n**HERO:** Nell\n\n${pagesText(12, (i) => `## Page ${i}:`)}`,
    { first: true },
  );
  expect(
    dressed.ok && dressed.story.pages.length === 12 && dressed.story.summary === 'A girl saves a tower.',
    'Markdown-dressed headings parse',
    `Markdown dressing broke the parser: ${JSON.stringify(dressed)}`,
  );

  const emphasised = parseStory(
    `SUMMARY: s\nHERO: Nell\n\n${pagesText(12, (i) => `PAGE ${i}`).replace('PAGE 1\n', 'PAGE 1\n*Ping. Ping.* The drops fell, **thump**, and *on. ')}`,
    { first: false },
  );
  expect(
    emphasised.ok && !emphasised.story.pages[0].includes('*') && emphasised.story.pages[0].startsWith('Ping. Ping. The drops fell, thump, and on.'),
    'Markdown emphasis is stripped from page text, closed or not',
    `Asterisks reached the page: ${emphasised.ok ? emphasised.story.pages[0] : JSON.stringify(emphasised)}`,
  );

  const tooShort = parseStory(`SUMMARY: x\nHERO: y\n\n${pagesText(11)}`, { first: false });
  expect(!tooShort.ok && tooShort.problems.some((p) => p.includes('11 pages')), 'An eleven-page story is sent back', 'An eleven-page story was accepted');

  const tooLong = parseStory(`SUMMARY: x\nHERO: y\n\n${pagesText(16)}`, { first: false });
  expect(!tooLong.ok, 'A sixteen-page story is sent back', 'A sixteen-page story was accepted');

  const noHero = parseStory(`SUMMARY: x\n\n${pagesText(12)}`, { first: false });
  expect(!noHero.ok && noHero.problems.some((p) => p.includes('HERO')), 'A missing HERO line is sent back', 'A story without a HERO line was accepted');

  const skipped = parseStory(`SUMMARY: x\nHERO: y\n\n${pagesText(12).replace('PAGE 7\n', 'PAGE 8\n')}`, { first: false });
  expect(!skipped.ok && skipped.problems.some((p) => p.includes('numbered')), 'Out-of-sequence page numbers are sent back', 'Out-of-sequence numbering was accepted');
}

// ── Prompts and schema ────────────────────────────────────────────────────
{
  const story = { title: 'The Long Fall', summary: chapter.summary ?? '', heroRole: 'Nell', pages: chapter.pages.map((p) => p.text) };
  const platesPrompt = buildPlatesPrompt({ rule: FIXTURE_RULE, chapterNumber: 1, story });
  expect(chapter.pages.every((p) => platesPrompt.includes(p.text)), 'Step 2 sees every page of the story verbatim', 'Step 2 prompt is missing story text');

  const storyPrompt = buildStoryPrompt({ rule: FIXTURE_RULE, chapterNumber: 1 });
  expect(!/json/i.test(storyPrompt) && storyPrompt.includes('PAGE 1'), 'Step 1 asks for plain prose in the page format', 'Step 1 prompt mentions JSON or lacks the format');

  // Without propertyOrdering the API writes fields alphabetically — `pages`
  // before `worldCanon` — so every image prompt was written before its laws.
  type Node = { type?: string; properties?: Record<string, Node>; propertyOrdering?: string[]; items?: Node; anyOf?: Node[] };
  const unordered: string[] = [];
  const bounded: string[] = [];
  const walk = (node: Node, path: string) => {
    if ('minItems' in node || 'maxItems' in node) bounded.push(path);
    if (node.type === 'OBJECT') {
      const keys = Object.keys(node.properties ?? {});
      if (JSON.stringify(node.propertyOrdering) !== JSON.stringify(keys)) unordered.push(path);
      for (const [k, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.${k}`);
    }
    if (node.items) walk(node.items, `${path}[]`);
    for (const option of node.anyOf ?? []) walk(option, `${path}|`);
  };
  walk(platesSchemaFor(1) as Node, 'plates(1)');
  walk(platesSchemaFor(2) as Node, 'plates(2)');
  walk(preflightSchemaForGemini as Node, 'preflight');
  expect(unordered.length === 0, 'Every Gemini schema object fixes its field order', `Objects without propertyOrdering: ${unordered.join(', ')}`);
  expect(bounded.length === 0, 'No minItems/maxItems in any Gemini schema', `Array bounds Gemini rejects: ${bounded.join(', ')}`);

  const order = platesSchemaFor(1).propertyOrdering;
  expect(
    ['styleBible', 'worldCanon', 'hero'].every((field) => order.indexOf(field) < order.indexOf('pages')),
    'styleBible, worldCanon and hero are written before the pages',
    `Field order puts pages too early: ${order.join(', ')}`,
  );
}

const wordStats = chapter.pages.map((p) => wordCount(p.text));
console.log(`  page word counts: ${Math.min(...wordStats)}–${Math.max(...wordStats)}`);

// ── Page 0 layout ─────────────────────────────────────────────────────────
// The layout is deterministic, so it is testable. Overlapping or NaN nodes are
// the failure mode that LLM-authored SVG would have shipped silently.
const layout = layoutChain({
  rule: FIXTURE_RULE,
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
