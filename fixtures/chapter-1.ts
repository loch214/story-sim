import { BASELINE, type ChapterResponse } from '@/lib/types';

/**
 * The checked-in fixture chapter. The entire reader is built against this, so
 * UI iteration costs zero Cloudflare neurons. It passes all thirteen rules —
 * `npm run check:fixture` proves it.
 */
export const FIXTURE_RULE = 'gravity is half as strong';

export const fixtureChapter: ChapterResponse = {
  ruleType: 'additive',
  worldTitle: 'The Long Fall',
  styleBible:
    'Hand-inked 2D cartoon illustration, flat matte colour, visible ink linework and light cross-hatching. Muted palette: chalk white, dust ochre, pale sage, slate blue, rust red. Architecture is thin-ribbed and impossibly tall, white bone-like struts, open shafts, hanging gardens. Technology is low industrial: canvas, rope, copper mesh, riveted plate. Figures small and mid-distance, faces incidental. Soft hazed daylight, no harsh shadows, gentle paper grain.',
  diagramHints: {
    palette: ['#f4efe4', '#c9a227', '#7d8c73', '#4a5a6a', '#b4553c'],
    motif: 'hand-inked botanical margins',
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
      text: 'The sky never fully clears. Dust and pollen, too light now to settle, hang in a pale permanent haze that softens every horizon and turns midday into something closer to a long bright afternoon.',
      derivedFrom: 'e1',
      shotType: 'wide',
      imagePrompt:
        'A wide valley under a pale hazy sky, distant hills flattened by suspended dust, slow fat raindrops falling, tall thin grasses bending upward, a single dirt road crossing the frame',
      entityRefs: [],
      altText: 'A hazy valley under suspended dust, with slow rain falling.',
    },
    {
      index: 2,
      text: 'Children are taught to fall before they are taught to walk. A step from a second-storey ledge lands soft as a hop, and the city has quietly stopped building handrails altogether.',
      derivedFrom: 'e3',
      shotType: 'crowd',
      entityRefs: [],
      imagePrompt:
        'A busy market street seen from mid-distance, dozens of small figures stepping off low ledges and drifting down, arms loose, market awnings and crates, no handrails anywhere, backs turned to the viewer',
      altText: 'Crowds stepping off ledges in a market street and drifting slowly down.',
    },
    {
      index: 3,
      text: 'The Spindle rises two kilometres on ribs no thicker than a lamp post. Under the old weight it would have folded before the tenth floor; here it merely sways, and the gardens sway with it.',
      derivedFrom: 'e4',
      shotType: 'detail',
      entityRefs: ['The Spindle'],
      imagePrompt:
        'Close detail of a slender white structural rib joined by riveted copper plates, hanging garden planters bolted along its length, trailing vines, pale sky beyond, sense of enormous height above and below',
      altText: 'A close view of a thin white structural rib with hanging garden planters.',
    },
    {
      index: 4,
      text: 'Halfweight Port launches nine times a day. The rockets are small enough to be trucked in on flatbeds, and the whole field is fenced with wire rather than walls, like a rural airstrip.',
      derivedFrom: 'e2',
      shotType: 'aerial',
      entityRefs: ['Halfweight Port'],
      imagePrompt:
        'Aerial view of a modest launch field of pale concrete rings set in yellow grass, small slim rockets standing like fence posts, service trucks on dirt tracks, wire fencing, long shadows',
      altText: 'An aerial view of a small launch field with slim rockets among grass.',
    },
    {
      index: 5,
      text: 'Inside the Spindle there are no lifts. Residents step into the open shaft and descend at the pace of a falling leaf, passing landings, laundry lines and one another on the way down.',
      derivedFrom: 'e6',
      shotType: 'interior',
      entityRefs: ['The Spindle'],
      imagePrompt:
        'Interior of a vast open vertical shaft inside a tower, ringed by wooden landings and laundry lines, small figures descending slowly through the middle of the space, warm lamplight, dust in the air',
      altText: 'People descending slowly through an open shaft ringed by landings.',
    },
    {
      index: 6,
      text: 'The deepwater ports emptied inside thirty years. Cranes stand over silted basins, and the warehouses have been let out as cheap ground-floor housing to families who cannot afford the towers.',
      derivedFrom: 'e5',
      shotType: 'wide',
      entityRefs: [],
      imagePrompt:
        'A disused container port at dusk, rusting cranes over a silted basin, warehouse windows lit with domestic lamps and hung washing, weeds through the concrete, a few small figures walking',
      altText: 'A disused port with rusting cranes and warehouses converted to housing.',
    },
    {
      index: 7,
      text: 'The revised building code fits on one sheet. Height is granted almost freely; every square metre of ground is argued over for years. The diagram is pinned in every planning office in the country.',
      derivedFrom: 'e8',
      shotType: 'diagram',
      entityRefs: [],
      imagePrompt:
        'A hand-drawn architectural code diagram on aged paper, tall thin building silhouettes with generous vertical annotation, dense cramped hatching and measurement marks at ground level, ink and ochre wash',
      altText: 'A hand-drawn building code diagram with tall silhouettes and dense ground-level notation.',
    },
    {
      index: 8,
      text: 'A Ground Court is forty paces across and costs more than a floor of the Spindle. Its whole value is that nothing stands above it, and that the gate is closed.',
      derivedFrom: 'e10',
      shotType: 'incidental-figures',
      entityRefs: ['Ground Court'],
      imagePrompt:
        'A small walled garden at street level, raked gravel in circles, one bare tree, a heavy closed gate, towers rising out of frame above, two distant figures at the gate seen from behind',
      altText: 'A walled ground-level garden with raked gravel and a closed gate.',
    },
    {
      index: 9,
      text: 'The Vertigo Ward keeps eleven beds and is rarely full. Its patients describe a fear no one under forty can quite picture: the conviction that the ground is coming up fast.',
      derivedFrom: 'e11',
      shotType: 'interior',
      entityRefs: ['Vertigo Ward'],
      imagePrompt:
        'A quiet clinic ward of pale green tile and tall windows, several empty made beds, one seated patient turned toward the window, soft daylight, clipboards on hooks, plants on the sill',
      altText: 'A quiet green-tiled clinic ward with empty beds and one seated patient.',
    },
    {
      index: 10,
      text: 'Under the haze the equator cooled and the north warmed. Grain now grows where the maps still say tundra, in long strips ploughed between old survey markers nobody has bothered to move.',
      derivedFrom: 'e7',
      shotType: 'aerial',
      entityRefs: [],
      imagePrompt:
        'Aerial view of long narrow grain strips ploughed across a cold northern plain, patches of old scrub between them, weathered survey posts, low hazed sun, pale sage and ochre fields',
      altText: 'Aerial view of long grain strips across a northern plain under haze.',
    },
    {
      index: 11,
      text: 'A grain barge carries forty tonnes on four fans and a rope net. It travels at the speed of a bicycle, low enough that children run underneath it, and it never needs a road.',
      derivedFrom: 'e12',
      shotType: 'detail',
      entityRefs: ['Grain Barge'],
      imagePrompt:
        'Close view of a broad flat-bottomed sky barge drifting low over a field, four canvas-shrouded lift fans, rope netting over stacked grain sacks, worn painted hull, small figures running below',
      altText: 'A low-flying sky barge carrying grain sacks under rope netting.',
    },
    {
      index: 12,
      text: 'Nobody guards the straits any more. The fleets sit instead around flat empty fields in the interior, because a launch corridor is now the only geography that decides anything.',
      derivedFrom: 'e9',
      shotType: 'wide',
      entityRefs: ['Halfweight Port'],
      imagePrompt:
        'A wide flat inland plain at dusk ringed by military vehicles and watchtowers, a pale concrete launch ring at the centre, floodlights, wire fencing, small sentry figures in silhouette',
      altText: 'A guarded inland launch field ringed by vehicles and watchtowers at dusk.',
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
          'A two-kilometre residential tower of thin white ribs and open stair-shafts, wrapped in hanging gardens, tapering to a needle',
      },
      {
        name: 'Halfweight Port',
        type: 'place',
        visualDescription:
          'A low launch field of pale concrete rings in yellow grass, slim rockets standing like fence posts, wire fencing and dirt service tracks',
      },
      {
        name: 'Ground Court',
        type: 'place',
        visualDescription:
          'A small walled garden at street level, gravel raked in circles, one bare tree, a heavy closed gate, towers rising above',
      },
      {
        name: 'Vertigo Ward',
        type: 'institution',
        visualDescription:
          'A quiet clinic wing of pale green tile and tall windows, eleven made beds, plants on the sills, clipboards on hooks',
      },
      {
        name: 'Grain Barge',
        type: 'object',
        visualDescription:
          'A broad flat-bottomed sky barge with four canvas-shrouded lift fans and rope netting over stacked grain sacks, worn painted hull',
      },
    ],
    visualLaws: [
      'Hair, loose cloth and dust drift upward and settle slowly in every scene',
      'Structures rise on ribs far thinner than their height would normally allow',
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
