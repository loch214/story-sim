import { BASELINE, type ChapterResponse } from '@/lib/types';

/**
 * The checked-in fixture chapter. The entire reader is built against this, so
 * UI iteration costs zero Cloudflare neurons. It passes every validation rule —
 * `npm run check:fixture` proves it.
 */
export const FIXTURE_RULE = 'gravity is half as strong';

export const fixtureChapter: ChapterResponse = {
  ruleType: 'additive',
  worldTitle: 'The Long Fall',
  styleBible:
    'Hand-inked 2D cartoon, flat matte colour, visible linework. Muted palette: chalk white, dust ochre, pale sage, slate blue, rust red. Thin-ribbed, impossibly tall architecture, open shafts, hanging gardens. Low industrial tech: rope, canvas, copper. Figures small, mid-distance. Soft hazed daylight.',
  diagramHints: {
    palette: ['#f4efe4', '#c9a227', '#7d8c73', '#4a5a6a', '#b4553c'],
    motif: 'hand-inked botanical margins',
  },
  throughLine: {
    role: 'the rope crew',
    headNoun: 'crew',
    want: 'keep every line strung and every landing marked so nobody falls wrong',
  },
  // A permanent physical change, so the arc spreads across generations rather
  // than compressing. Movement lengths are uneven on purpose — the middle is
  // where the interesting part of this premise lives.
  arc: [
    { label: 'the year the weight went', fromPage: 1, toPage: 3 },
    { label: 'building for the new lightness', fromPage: 4, toPage: 8 },
    { label: 'children of the light years', fromPage: 9, toPage: 12 },
  ],
  chain: [
    {
      id: 'e1',
      order: 1,
      domain: 'environment',
      text: 'Dust and pollen no longer settle. The lower atmosphere holds a permanent pale haze, and rain falls slowly enough to feel warm.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e2',
      order: 1,
      domain: 'science',
      text: 'Escape velocity roughly halves. Reaching orbit stops being a national project and becomes an ordinary freight problem.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e3',
      order: 1,
      domain: 'society',
      text: 'A fall from any height is survivable, and an adult can jump twice as high as before.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e4',
      order: 1,
      domain: 'technology',
      text: 'Structures carry their own weight far further. Water climbs higher in pipes and xylem, so buildings and trees both grow thinner and taller.',
      derivedFrom: [{ kind: 'rule' }],
    },
    {
      id: 'e5',
      order: 2,
      domain: 'economy',
      text: 'Orbital freight undercuts shipping on long routes. Deepwater ports lose their traffic within a generation.',
      derivedFrom: [{ kind: 'effect', id: 'e2' }],
    },
    {
      id: 'e6',
      order: 2,
      domain: 'culture',
      text: 'Cities reorganise around vertical movement. Open stair-shafts replace lifts, and the street becomes something you drop through.',
      derivedFrom: [{ kind: 'effect', id: 'e3' }, { kind: 'effect', id: 'e4' }],
    },
    {
      id: 'e7',
      order: 2,
      domain: 'environment',
      text: 'The permanent haze cools the surface by a degree. Growing seasons shorten at the equator and lengthen toward the poles.',
      derivedFrom: [{ kind: 'effect', id: 'e1' }],
    },
    {
      id: 'e8',
      order: 2,
      domain: 'politics',
      text: 'Building codes invert. Height becomes cheap to permit, and ground-level footprint becomes the scarce, contested thing.',
      derivedFrom: [{ kind: 'effect', id: 'e4' }],
    },
    {
      id: 'e9',
      order: 3,
      domain: 'conflict',
      text: 'Launch corridors become chokepoints. States that once guarded straits now station their fleets around empty fields.',
      derivedFrom: [{ kind: 'effect', id: 'e5' }],
    },
    {
      id: 'e10',
      order: 3,
      domain: 'politics',
      text: 'Ground becomes the elite address. The wealthy buy walled gardens at street level while towers above fill with tenancies.',
      derivedFrom: [{ kind: 'effect', id: 'e8' }],
    },
    {
      id: 'e11',
      order: 3,
      domain: 'society',
      text: 'A generation grows up without fear of heights. Vertigo becomes a rare diagnosis treated in specialist wards.',
      derivedFrom: [{ kind: 'effect', id: 'e6' }],
    },
    {
      id: 'e12',
      order: 3,
      domain: 'economy',
      text: 'Agriculture migrates poleward under the haze, and grain moves by low sky-barge rather than by road or rail.',
      derivedFrom: [{ kind: 'effect', id: 'e7' }],
    },
  ],
  pages: [
    {
      index: 1,
      text: "Dust doesn't fall anymore. It just hangs there, soft and pale, so the whole valley looks half-underwater in low light. The rope crew still walks the ridge line after every storm, just to be sure.",
      derivedFrom: 'e1',
      shotType: 'wide',
      imagePrompt:
        'A wide valley at first light under a pale hazy sky, distant hills flattened almost to silhouette by suspended dust, two small figures with coiled rope over their shoulders walking a narrow ridge path, slow fat raindrops caught mid-fall around them, tall thin grasses bending upward instead of down, warm ochre light low on the horizon catching the dust in the air, a thin dirt track curving away below, mist pooling in the hollow between the hills',
      entityRefs: [],
      altText: 'Two figures walking a ridge above a hazy, dust-filled valley at dawn.',
    },
    {
      index: 2,
      text: 'In the market, people step off the ledges like it costs nothing. Arms loose, feet first, down they drift. The crew is already below, waving the little ones clear of the fruit stalls.',
      derivedFrom: 'e3',
      shotType: 'crowd',
      entityRefs: [],
      imagePrompt:
        'A busy market street at midday seen from mid-distance, dozens of small figures stepping off low ledges and drifting down slowly with arms loose and cloth billowing upward, striped awnings and stacked wooden crates lining the street below, two crew members in orange armbands waving the smallest children clear of a fruit stall, baskets of pale fruit spilling slightly, backs turned to the viewer, warm dusty sunlight cutting long shadows across the cobbles',
      altText: 'Crowds stepping off ledges into a market street and drifting slowly down.',
    },
    {
      index: 3,
      text: "Up close the rib is thinner than it has any right to be, thin as a lamp post and two kilometres tall. A rigger from the crew taps it twice, listens, and grins. Still singing true.",
      derivedFrom: 'e4',
      shotType: 'detail',
      entityRefs: ['The Spindle'],
      imagePrompt:
        'Close detail at dusk of a slender white structural rib joined by riveted copper plates, a small figure in worn canvas overalls with one hand pressed flat against the cold metal and head tilted, listening, hanging garden planters bolted along the rib with trailing vines catching the last light, a coil of rope slung across the figure\'s back and a brass tool hanging from a belt loop, deep violet sky beyond fading to indigo, a faint sense of enormous height above and below the frame, a single bird crossing far in the distance',
      altText: 'A crew member listening to a thin white structural rib by touch.',
    },
    {
      index: 4,
      text: "This morning Halfweight Port sends its ninth rocket up before lunch, small enough to ride out on a flatbed truck. The ground crew waves it off. Then they go back to their tea.",
      derivedFrom: 'e2',
      shotType: 'aerial',
      entityRefs: ['Halfweight Port'],
      imagePrompt:
        'Aerial view at bright noon of a modest launch field of pale concrete rings set in yellow grass, one slim rocket lifting off trailing a thin white plume, small figures with mugs of tea watching from a wire fence line, a flatbed truck parked with its ramp still down, a windsock hanging limp on a pole, service trucks on worn dirt tracks between the rings, short crisp shadows underfoot, a stray dog asleep in the shade of the fence post, a hand-painted sign reading LAUNCH DAYS leaning against a post',
      altText: 'A small rocket lifting from a launch field while ground crew watch with tea.',
    },
    {
      index: 5,
      text: "Inside the Spindle, a woman steps into the open shaft and lets go. She drifts past laundry lines and a neighbour doing the same. The crew rigged these landings years back, and they still hold.",
      derivedFrom: 'e6',
      shotType: 'interior',
      entityRefs: ['The Spindle'],
      imagePrompt:
        'Interior of a vast open vertical shaft inside a tower at golden hour, a single figure mid-descent with skirt and loose hair both lifted upward, ringed by wooden landings strung with laundry lines and hanging paper lanterns, warm lamplight pooling on each landing and catching drifting dust motes, potted plants crowding the landing rails, a folded newspaper tucked under one railing, a child\'s toy left on a bench, another figure waving up from a landing several storeys below',
      altText: 'A woman drifting slowly down an open shaft ringed by lantern-lit landings.',
    },
    {
      index: 6,
      text: 'The old shipping docks went quiet fast. Rust has the cranes now, and gulls have the water. Someone has hung washing where a warehouse door used to open, and doesn\'t think twice about it.',
      derivedFrom: 'e5',
      shotType: 'wide',
      entityRefs: [],
      imagePrompt:
        'A disused container port at dusk, rusting cranes silhouetted black over a silted basin gone quiet, one warehouse window lit warm gold with washing strung across the frame, a second window dark and boarded, gulls perched in a line along a corroded rail, weeds pushing through cracked concrete underfoot, an abandoned shipping container repurposed as a shed, cool blue shadows spreading long from the crane legs across the yard',
      altText: 'A disused port with rusting cranes and one lit warehouse window at dusk.',
    },
    {
      index: 7,
      text: "Somebody pinned the new building code to a single sheet of paper. Height, it says, is nearly free. Ground is not. That one page now hangs behind glass in every planning office in the country.",
      derivedFrom: 'e8',
      shotType: 'diagram',
      entityRefs: [],
      imagePrompt:
        'A hand-drawn architectural code diagram pinned behind glass, lit by a single brass desk lamp at night, tall thin building silhouettes with generous open vertical annotation in fading ink, dense cramped hatching and measurement marks crowding the ground line at the bottom of the sheet, a magnifying glass resting on one corner catching the lamplight, faint ochre wash across the aged cream paper, dust on the frame',
      altText: 'A hand-drawn building code diagram lit by a desk lamp, tall silhouettes and cramped ground notes.',
    },
    {
      index: 8,
      text: 'A Ground Court is forty paces across and costs more than a whole floor of the Spindle. Its entire value is that nothing stands above it, and that the gate stays shut.',
      derivedFrom: 'e10',
      shotType: 'incidental-figures',
      entityRefs: ['Ground Court'],
      imagePrompt:
        'A small walled garden at street level in soft overcast light, raked pale gravel circling one bare twisted tree, a heavy closed iron gate catching a thin cold gleam, towers rising out of frame far above and vanishing into haze, two figures at the gate seen from behind in dark heavy coats, faint mist pooling at ground level around the base of the wall, moss along the lower stones, a small brass plaque beside the gate too worn to read, a single dry leaf on the gravel, an old iron bench under the tree',
      altText: 'A walled ground-level garden with raked gravel and a closed gate under towers.',
    },
    {
      index: 9,
      text: "The crew brought a boy to the Vertigo Ward last spring, certain the ground was rushing up at him. Eleven beds. Only one was taken that week. Nobody under forty really understands the fear.",
      derivedFrom: 'e11',
      shotType: 'interior',
      entityRefs: ['Vertigo Ward'],
      imagePrompt:
        'A quiet clinic ward of pale green tile and tall arched windows at midmorning, soft grey daylight falling flat across the floor, several empty made beds in a neat row with folded blankets, one young patient sitting up in bed and turned toward the window, a nurse adjusting a clipboard hung beside the door, potted ferns crowding the deep windowsill, a wheeled trolley parked against the far wall, a paper kite propped in the corner unused, a half-finished glass of water on the nightstand',
      altText: 'A quiet green-tiled clinic ward with empty beds and one seated young patient.',
    },
    {
      index: 10,
      text: 'Under the haze the equator cooled and the north warmed. Grain grows now where the old maps still say tundra, in long strips ploughed between survey markers nobody has moved.',
      derivedFrom: 'e12',
      shotType: 'aerial',
      // Pages 10 and 11 both dramatise e12 — the fields, then the barge that
      // serves them — so one moment gets room across consecutive pages and e7
      // goes undramatised. Rule 16: pages are chosen from the chain, not a
      // printout of it.
      entityRefs: [],
      imagePrompt:
        'Aerial view under a low hazed sun of long narrow grain strips ploughed across a cold northern plain, weathered wooden survey posts casting long thin shadows across the furrows, patches of old scrub still holding on stubbornly between the strips, one small tractor trailing a thin plume of dust at the far edge of the field, pale sage and ochre colours across the land, a distant line of low hills at the horizon',
      altText: 'Aerial view of long grain strips ploughed across a northern plain under haze.',
    },
    {
      index: 11,
      text: 'The crew loads forty tonnes onto four canvas fans and a length of rope net, and that is the whole barge. It moves at the speed of a bicycle, and kids run underneath it the entire way.',
      derivedFrom: 'e12',
      shotType: 'detail',
      entityRefs: ['Grain Barge'],
      imagePrompt:
        'Close view at late afternoon of a broad flat-bottomed sky barge drifting low over a field, four canvas-shrouded lift fans straining gently against a worn painted hull, thick rope netting cinched tight over stacked grain sacks, two crew members walking along the ground below adjusting the net with practiced hands, three children running underneath it laughing with arms outstretched, a dog chasing alongside barking, warm low sun catching the dust kicked up behind them',
      altText: 'A low-flying sky barge carrying grain sacks while children run beneath it.',
    },
    {
      index: 12,
      text: "Nobody guards the straits anymore. The fleets just sit around empty fields inland now, waiting. A launch corridor decides more than any coastline ever did. The crew still walks the ridge line, though. Someone should.",
      derivedFrom: 'e9',
      shotType: 'wide',
      entityRefs: ['Halfweight Port'],
      imagePrompt:
        'A wide flat inland plain at dusk ringed by parked military vehicles and dark watchtowers, a pale concrete launch ring glowing faintly at the centre under the fading light, floodlights just switching on one by one along the perimeter, two small figures with coiled rope over their shoulders walking a distant ridge in silhouette, wire fencing catching the last orange light, a lone dog trotting along the fence line, a faded flag hanging still on a pole near the gate',
      altText: 'A guarded inland launch field at dusk with two figures walking a distant ridge.',
    },
  ],
  worldCanon: {
    baseline: BASELINE,
    activeRules: [{ rule: FIXTURE_RULE, enteredChapter: 1 }],
    physicsDeltas: [
      'Surface gravity is half its familiar value.',
      'Terminal velocity is low enough that falls are survivable from any height.',
      'Escape velocity is roughly halved.',
      'Suspended particles settle far more slowly, leaving a permanent low haze.',
      'Capillary action carries water much higher in pipes and plant tissue.',
    ],
    invariants: [
      'Human bodies and biology are otherwise unchanged.',
      'The atmosphere retains a permanent pale haze at low altitude.',
      'Orbital freight is cheaper than long-distance shipping.',
      'Ground-level land is the scarcest and most expensive category of property.',
      'Buildings are built thin, tall and flexible, with open vertical shafts instead of lifts.',
      'Falling is an ordinary means of travel, not an accident.',
    ],
    namedEntities: [
      {
        name: 'The Spindle',
        type: 'place',
        visualDescription:
          'A two-kilometre tower of thin white ribs and open stair-shafts, wrapped in hanging gardens, tapering upward',
      },
      {
        name: 'Halfweight Port',
        type: 'place',
        visualDescription:
          'A low launch field of pale concrete rings in yellow grass, slim rockets standing like fence posts',
      },
      {
        name: 'Ground Court',
        type: 'place',
        visualDescription:
          'A small walled garden at street level, raked gravel, one bare tree, a heavy closed gate, towers rising above',
      },
      {
        name: 'Vertigo Ward',
        type: 'institution',
        visualDescription:
          'A quiet clinic wing of pale green tile and tall windows, made beds in a row, plants on the sills',
      },
      {
        name: 'Grain Barge',
        type: 'object',
        visualDescription:
          'A broad flat-bottomed sky barge with four canvas lift fans and rope netting over stacked grain sacks',
      },
    ],
    visualLaws: [
      'Hair, cloth and dust drift upward, settling slowly in every scene',
      'Structures rise on ribs far thinner than their height should allow',
      'People move in long low arcs, feet often well clear of the ground',
    ],
    liveTensions: [
      'Ground-level landowners and tower tenancies are drifting into open class conflict.',
      'Launch corridors are militarised but no treaty governs them.',
      'Equatorial agriculture is failing faster than northern land can be brought into use.',
      'Nobody has established who is liable when a falling person lands on property.',
    ],
    supersededRules: [],
  },
};
