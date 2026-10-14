import { BASELINE, type ChapterResponse } from '@/lib/types';

/**
 * The checked-in fixture chapter. The entire reader is built against this, so
 * UI iteration costs zero Cloudflare neurons. It passes every validation rule —
 * `npm run check:fixture` proves it.
 *
 * Rewritten for the story-first rework, as the example of what a chapter should
 * now read like: one girl, one want, one storm, an ending that answers the
 * opening. The rule is never explained — the reader learns that falls are
 * harmless and wind is deadly by watching Nell. Thirteen pages, so the reader
 * and the render pool are exercised off the old fixed twelve.
 */
export const FIXTURE_RULE = 'gravity is half as strong';

export const fixtureChapter: ChapterResponse = {
  ruleType: 'additive',
  worldTitle: 'The Long Fall',
  summary:
    'Nell, nine, the youngest on the rope crew, strung the storm net round the top of the Spindle alone when her gran’s knee gave out, and nobody fell wrong.',
  styleBible:
    'Hand-inked 2D picture-book cartoon, flat matte colour, visible brush linework. Palette: chalk white, dust ochre, pale sage, slate blue, rust red. Soft hazy light. Figures rounded and simple, drawn with warmth.',
  diagramHints: {
    palette: ['#f4efe4', '#c9a227', '#7d8c73', '#4a5a6a', '#b4553c'],
    motif: 'hand-inked rope knots in the margins',
  },
  hero: {
    role: 'Nell',
    look: 'a small girl of nine in a rust-red smock and patched blue trousers, short dark hair, a coil of pale rope over one shoulder',
    want: 'to be trusted with a real job on the rope crew',
  },
  arc: [
    { label: 'joining the crew', fromPage: 1, toPage: 3 },
    { label: 'the wind comes in', fromPage: 4, toPage: 6 },
    { label: 'up the Spindle alone', fromPage: 7, toPage: 10 },
    { label: 'after the storm', fromPage: 11, toPage: 13 },
  ],
  chain: [
    {
      id: 'e1',
      order: 1,
      domain: 'society',
      text: 'Falls from any height are survivable; people step off ledges and drift down as ordinary travel.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e2',
      order: 1,
      domain: 'environment',
      text: 'Bodies weigh half as much, so wind pushes people and loose objects twice as hard relative to their weight.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e3',
      order: 1,
      domain: 'technology',
      text: 'Structures carry their own weight far further, so towers are built thin, tall and open.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e4',
      order: 1,
      domain: 'environment',
      text: 'Dust and pollen settle slowly, leaving a permanent pale haze in the lower air.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e5',
      order: 2,
      domain: 'culture',
      text: 'Towers are organised around open drop-shafts and balconies; lifts and stairs fall out of use.',
      derivedFrom: [{ kind: 'effect', id: 'e1' }, { kind: 'effect', id: 'e3' }],
    },
    {
      id: 'e6',
      order: 2,
      domain: 'environment',
      text: 'Wind replaces falling as the main danger: a strong gust can carry an adult off a balcony and miles away.',
      derivedFrom: [{ kind: 'effect', id: 'e2' }],
    },
    {
      id: 'e7',
      order: 2,
      domain: 'society',
      text: 'Rope crews string safety lines along ridges and storm nets around towers whenever high wind is forecast.',
      derivedFrom: [{ kind: 'effect', id: 'e2' }, { kind: 'effect', id: 'e3' }],
    },
    {
      id: 'e8',
      order: 2,
      domain: 'culture',
      text: 'Everything kept outdoors is tied down by habit — washing, carts, chairs, children’s kites.',
      derivedFrom: [{ kind: 'effect', id: 'e2' }],
    },
    {
      id: 'e9',
      order: 3,
      domain: 'economy',
      text: 'Rope work becomes an inherited trade, knots and lines handed down within families.',
      derivedFrom: [{ kind: 'effect', id: 'e7' }],
    },
    {
      id: 'e10',
      order: 3,
      domain: 'technology',
      text: 'Weather radio becomes a town’s alarm system; a wind warning empties balconies within the hour.',
      derivedFrom: [{ kind: 'effect', id: 'e6' }],
    },
    {
      id: 'e11',
      order: 3,
      domain: 'society',
      text: 'A town’s tallest tower is its greatest risk in a storm, because its upper balconies catch the strongest wind.',
      derivedFrom: [{ kind: 'effect', id: 'e5' }, { kind: 'effect', id: 'e6' }],
    },
    {
      id: 'e12',
      order: 3,
      domain: 'culture',
      text: 'Children learn knots before letters; a well-tied knot is the first thing a child is trusted with.',
      derivedFrom: [{ kind: 'effect', id: 'e8' }],
    },
  ],
  pages: [
    {
      index: 1,
      text: 'Nell was nine the summer she joined the rope crew. In Halfweight, people stepped off the towers and floated down like dandelion seeds. Somebody had to make sure they landed in the right place.',
      derivedFrom: 'e1',
      shotType: 'wide',
      heroInScene: true,
      entityRefs: ['The Spindle'],
      imagePrompt:
        'The girl stands on a grassy rise looking up, while far above her several women and men in billowing coats drift slowly down from tower balconies like seeds, arms loose. Bright summer morning, pale hazy sky, warm ochre light, long soft shadows on the grass.',
      altText: 'A girl with a coil of rope watches people float gently down from a tall thin tower.',
    },
    {
      index: 2,
      text: 'Her gran showed her the knots on the kitchen table. “Light things blow away, love. That’s the whole job. Keep the light things tied down.” Nell practised until her fingers hurt.',
      derivedFrom: 'e12',
      shotType: 'medium',
      heroInScene: true,
      entityRefs: [],
      imagePrompt:
        'The girl and her grandmother, a stout old woman in a sage-green coat, sit side by side at a scrubbed wooden kitchen table in the evening, each holding a short pale rope tied in a big simple knot, the grandmother smiling. Warm lamplight, a teacup on the table, flour dust hanging still in the air.',
      altText: 'A girl and her grandmother sit at a kitchen table, each holding a knotted rope.',
    },
    {
      index: 3,
      text: 'Every morning they walked the ridge with rope over their shoulders. Gran tugged each line and listened. Nell tugged too. She had no idea what she was listening for.',
      derivedFrom: 'e7',
      shotType: 'medium',
      heroInScene: true,
      entityRefs: ['The Ridge Line'],
      imagePrompt:
        'The girl and her grandmother, a stout old woman in a sage-green coat, walk single file along a narrow ridge path at dawn, each pulling on a taut rope line, heads tilted as if listening. Cool blue early light, mist in the valley below, slow dust drifting upward.',
      altText: 'A girl and her grandmother tug on a rope line along a misty ridge at dawn.',
    },
    {
      index: 4,
      text: 'Then one afternoon the weather radio crackled. A wind was coming in off the sea. A big one. Gran went very quiet and looked out of the window at the Spindle.',
      derivedFrom: 'e10',
      shotType: 'interior',
      heroInScene: true,
      entityRefs: [],
      imagePrompt:
        'Inside a small cosy kitchen in the afternoon, the girl at the table turns towards an old brass radio on the shelf, while her grandmother stands still at the window looking out at a very tall thin tower in the distance. Grey-green storm light through the glass, curtains starting to lift.',
      altText: 'A girl and her grandmother listen to a radio, the grandmother staring at a distant tower.',
    },
    {
      index: 5,
      text: 'Nell knew the stories. The baker who went over the hill in a gale and came down in the next county. Today there were hundreds of people up the Spindle, pegging out their washing.',
      derivedFrom: 'e11',
      shotType: 'wide',
      heroInScene: false,
      entityRefs: ['The Spindle'],
      imagePrompt:
        'Dozens of women, men and children on the open balconies of a very tall thin tower, pegging white sheets and shirts on long washing lines that already flap sideways, a dark bank of storm cloud rolling in from the sea behind, sunlight still on the near side, gulls tossed about.',
      altText: 'Crowded tower balconies hung with washing as a storm rolls in from the sea.',
    },
    {
      index: 6,
      text: 'So the crew ran. Nell ran with them, rope bouncing on her back, each stride carrying her three metres. They had an hour to get the storm net round the tower.',
      derivedFrom: 'e7',
      shotType: 'medium',
      heroInScene: true,
      entityRefs: ['The Storm Net'],
      imagePrompt:
        'The girl runs in huge floating strides across a cobbled square beside four crew members in orange armbands, all carrying heavy bundles of net over their shoulders, feet high off the ground mid-stride, hair streaming. Late afternoon, sky darkening, leaves whirling past.',
      altText: 'A girl and the rope crew bound across a square carrying a heavy net.',
    },
    {
      index: 7,
      text: 'Halfway up, Gran’s old knee locked. She sat down hard on a landing. “Go on,” she said, and pushed her coil of rope at Nell. “Top rail. You know the knot.”',
      derivedFrom: 'e9',
      shotType: 'medium',
      heroInScene: true,
      entityRefs: [],
      imagePrompt:
        'On a narrow wooden landing inside an open tower shaft, the grandmother sits heavily holding one knee and pushes a coil of rope into the girl’s arms, the girl looking up at the long shaft rising above them. Swinging lanterns, wind-blown dust, stormy grey light from above.',
      altText: 'An old woman sitting on a tower landing hands her coil of rope to a girl.',
    },
    {
      index: 8,
      text: 'Nell climbed. The first gusts came round the tower and her hair streamed sideways. Below her, sheets tore off the lines and went sailing over the rooftops like gulls.',
      derivedFrom: 'e6',
      shotType: 'wide',
      heroInScene: true,
      entityRefs: ['The Spindle'],
      imagePrompt:
        'The girl, tiny against the outside of a very tall thin tower, climbs a rope ladder near the top with her hair and smock whipped sideways, while far below white bed sheets fly off washing lines and sail over the rooftops of a small town. Heavy slate-blue storm clouds.',
      altText: 'A tiny girl climbs near the top of a tower in the wind as sheets fly over the town below.',
    },
    {
      index: 9,
      text: 'At the top rail her hands shook so much the rope slipped twice. She said Gran’s words under her breath. Light things blow away. Keep them tied. The third time, the knot held.',
      derivedFrom: 'e12',
      shotType: 'medium',
      heroInScene: true,
      entityRefs: [],
      imagePrompt:
        'The girl stands alone on a narrow platform at the very top of a tall tower, leaning on a copper rail with a big rope knot tied round it, a heavy net pulled tight beside her, rain blowing sideways, the small town far below. Cold blue storm light, one gleam on the copper.',
      altText: 'A girl stands at the top of a tower by a copper rail with a rope tied round it, in a storm.',
    },
    {
      index: 10,
      text: 'The net went tight just as the big gust hit. The whole Spindle hummed like a plucked string. On the balconies, people grabbed the mesh and hung on, laughing and screaming at once.',
      derivedFrom: 'e11',
      shotType: 'wide',
      heroInScene: false,
      entityRefs: ['The Storm Net'],
      imagePrompt:
        'A great gust bends the trees around a very tall thin tower now wrapped in a taut rope net, women, men and children on every balcony clinging to the mesh with their clothes and hair blown flat, some laughing, washing and leaves whirling past, dramatic storm light breaking through.',
      altText: 'A tower wrapped in a rope net as people cling to it through a huge gust of wind.',
    },
    {
      index: 11,
      text: 'It blew for an hour. Then it stopped, all at once, the way big winds do. The whole town was covered in other people’s washing.',
      derivedFrom: 'e8',
      shotType: 'aerial',
      heroInScene: false,
      entityRefs: [],
      imagePrompt:
        'Looking down on a small hillside town just after a storm, rooftops, chimneys, trees and a church spire all draped with stray white sheets, shirts and socks, a few women and men coming out of doorways to stare, puddles shining, soft golden evening light breaking through.',
      altText: 'A town seen from above, its roofs and trees draped in washing after the storm.',
    },
    {
      index: 12,
      text: 'Nobody fell wrong that day. Nell found Gran still on the landing, rubbing her knee and pretending she hadn’t been worried. “Bit loose, that knot,” Gran said. It wasn’t.',
      derivedFrom: 'e9',
      shotType: 'medium',
      heroInScene: true,
      entityRefs: [],
      imagePrompt:
        'On a wooden landing inside a tower shaft lit by warm lanterns, the girl sits close beside her grandmother, who rubs her knee and gives a sideways look and a small smile, the girl grinning at the floor. Calm evening light, dust drifting slowly up through the lantern glow.',
      altText: 'A girl and her grandmother sit together on a lantern-lit landing after the storm.',
    },
    {
      index: 13,
      text: 'Next morning Nell walked the ridge again, her own coil of rope on her shoulder. She tugged the first line and listened. This time she knew exactly what she was listening for.',
      derivedFrom: 'e7',
      shotType: 'wide',
      heroInScene: true,
      entityRefs: ['The Ridge Line'],
      imagePrompt:
        'The girl walks alone along a narrow ridge path at sunrise, one hand pulling a taut rope line, head tilted, listening, a very tall thin tower standing calm and clear across the valley behind her. Clean washed sky, warm gold light, dust drifting slowly up from the grass.',
      altText: 'A girl alone on a ridge at sunrise tugs a rope line, a tower calm behind her.',
    },
  ],
  worldCanon: {
    baseline: BASELINE,
    activeRules: [{ rule: FIXTURE_RULE, enteredChapter: 1 }],
    visualLaws: [
      'Hair, cloth and dust drift upward, settling slowly in every scene',
      'Towers rise on frames far thinner than their height should allow',
      'People move in long low arcs, feet often well clear of the ground',
    ],
    neverDrawn: [],
    physicsDeltas: [
      'Surface gravity is half its familiar value.',
      'Falls are survivable from any height.',
      'Wind moves people and objects twice as easily relative to their weight.',
      'Suspended particles settle far more slowly, leaving a permanent low haze.',
    ],
    invariants: [
      'Human bodies and biology are otherwise unchanged.',
      'Falling is an ordinary means of travel, not an accident.',
      'High wind is the most feared weather; towns stop for a wind warning.',
      'Rope crews string storm nets around tall towers before a gale.',
      'Buildings are thin, tall and open, organised around drop-shafts.',
    ],
    namedEntities: [
      {
        name: 'The Spindle',
        type: 'place',
        visualDescription:
          'a very tall, very thin white tower of open ribs and balconies strung with washing lines, tapering upward',
      },
      {
        name: 'The Ridge Line',
        type: 'place',
        visualDescription:
          'a grassy ridge path above a valley, lined with weathered wooden posts carrying taut pale safety ropes',
      },
      {
        name: 'The Storm Net',
        type: 'object',
        visualDescription:
          'a vast net of thick pale rope with orange marker rags tied at every tenth knot',
      },
    ],
    liveTensions: [
      'Nell’s gran is too old to climb, and the crew is short of hands.',
      'The Spindle keeps growing taller, and every new floor catches more wind.',
      'Nobody has decided who pays when a gust carries someone into a neighbour’s roof.',
    ],
    supersededRules: [],
  },
};
