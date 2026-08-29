/**
 * Authored plate artwork for the landing page.
 *
 * No real plates are checked in — `public/` holds only scaffold SVGs — so the
 * landing draws its own, to the fixture chapter's declared style bible:
 *
 *   "Hand-inked 2D cartoon, flat matte colour, visible linework. Muted palette:
 *    chalk white, dust ochre, pale sage, slate blue, rust red. Thin-ribbed,
 *    impossibly tall architecture, open shafts, hanging gardens. Low industrial
 *    tech: rope, canvas, copper. Figures small, mid-distance."
 *
 * These are exact flat geometry, not model output, and the page says so where
 * they appear. Every scene obeys the composition clause the real prompts carry:
 * weight in the upper two thirds, the lower third left quiet for the text band.
 * Figures are silhouettes at mid-distance with no faces — the same invariant the
 * chapter contract enforces, for the same reason.
 */

const INK = '#23201a';

const P = {
  chalk: '#f4efe4',
  ochre: '#c9a227',
  sage: '#7d8c73',
  slate: '#4a5a6a',
  rust: '#b4553c',
} as const;

/* ── primitives ─────────────────────────────────────────────────────────── */

/** A thin-ribbed tower: the world's signature architecture. */
function Tower({
  x,
  w,
  top,
  base = 700,
  fill = P.slate,
  ribs = 7,
}: {
  x: number;
  w: number;
  top: number;
  base?: number;
  fill?: string;
  ribs?: number;
}) {
  const h = base - top;
  const lines = Array.from({ length: ribs }, (_, i) => top + ((i + 1) * h) / (ribs + 1));
  return (
    <g>
      <rect x={x} y={top} width={w} height={h} fill={fill} />
      <rect x={x} y={top} width={w * 0.34} height={h} fill="#000" opacity={0.14} />
      {lines.map((y) => (
        <rect
          key={y}
          x={x - w * 0.28}
          y={y}
          width={w * 1.56}
          height={Math.max(3, w * 0.13)}
          fill={P.chalk}
          opacity={0.5}
        />
      ))}
      <rect x={x - w * 0.5} y={top - w * 0.5} width={w * 2} height={w * 0.5} fill={fill} />
      <rect x={x} y={top} width={w} height={h} fill="none" stroke={INK} strokeWidth={3} opacity={0.55} />
    </g>
  );
}

/** A slack line between two points. Rope and canvas are the only tech here. */
function Rope({
  x1,
  y1,
  x2,
  y2,
  sag = 40,
  stroke = INK,
  width = 3,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  sag?: number;
  stroke?: string;
  width?: number;
}) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 + sag;
  return (
    <path
      d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      opacity={0.7}
      strokeLinecap="round"
    />
  );
}

/** A person at mid-distance: two marks, no face. Never more than a silhouette. */
function Fig({
  x,
  y,
  s = 1,
  fill = INK,
  drift = false,
}: {
  x: number;
  y: number;
  s?: number;
  fill?: string;
  drift?: boolean;
}) {
  const h = 26 * s;
  return (
    <g opacity={0.82} transform={`translate(${x} ${y})${drift ? ' rotate(-8)' : ''}`}>
      <circle cx={0} cy={-h} r={h * 0.2} fill={fill} />
      <rect x={-h * 0.17} y={-h * 0.8} width={h * 0.34} height={h * 0.8} rx={h * 0.14} fill={fill} />
    </g>
  );
}

/** Dust that no longer settles — the chapter's first consequence, everywhere. */
function Motes({
  seed,
  count = 26,
  area = [0, 60, 1000, 660],
  r = 4,
}: {
  seed: number;
  count?: number;
  area?: [number, number, number, number];
  r?: number;
}) {
  return (
    <g fill={P.chalk} opacity={0.55}>
      {scatter(seed, count, area, r).map((mote, i) => (
        <circle key={i} cx={mote.cx} cy={mote.cy} r={mote.r} />
      ))}
    </g>
  );
}

/** Deterministic from the seed, so a scene is identical on server and client. */
function scatter(
  seed: number,
  count: number,
  [ax, ay, aw, ah]: [number, number, number, number],
  r: number,
) {
  let a = seed >>> 0;
  const next = () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const motes = [];
  for (let i = 0; i < count; i++) {
    motes.push({ cx: ax + next() * aw, cy: ay + next() * ah, r: r * (0.45 + next()) });
  }
  return motes;
}

/** Sky, haze and ground. The haze is a stated fact of this world, not a mood. */
function Ground({ horizon = 700, ground = P.sage, id }: { horizon?: number; ground?: string; id: string }) {
  return (
    <>
      <rect width={1000} height={1000} fill={`url(#sky-${id})`} />
      <rect y={horizon - 130} width={1000} height={130} fill={P.chalk} opacity={0.32} />
      <rect y={horizon} width={1000} height={1000 - horizon} fill={ground} />
      <rect y={horizon} width={1000} height={4} fill={INK} opacity={0.5} />
    </>
  );
}

function Scene({
  id,
  children,
  skyTop = '#e9e4d6',
  skyBottom = '#f4efe4',
}: {
  id: string;
  children: React.ReactNode;
  skyTop?: string;
  skyBottom?: string;
}) {
  return (
    <svg
      viewBox="0 0 1000 1000"
      className="h-full w-full"
      role="presentation"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTop} />
          <stop offset="100%" stopColor={skyBottom} />
        </linearGradient>
      </defs>
      {children}
      <rect x={0} y={0} width={1000} height={1000} fill="none" stroke={INK} strokeWidth={7} opacity={0.28} />
    </svg>
  );
}

/* ── the twelve scenes ──────────────────────────────────────────────────── */

/** 01 — the valley half-underwater in hanging dust; the crew walks the ridge. */
function P01() {
  return (
    <Scene id="p1" skyTop="#dfdac9">
      <Ground id="p1" horizon={720} ground={P.sage} />
      <circle cx={735} cy={170} r={62} fill={P.ochre} opacity={0.8} />
      <path
        d="M0 640 L170 520 L330 592 L470 468 L640 596 L820 512 L1000 604 L1000 720 L0 720 Z"
        fill={P.slate}
        opacity={0.55}
      />
      <path
        d="M0 640 L170 520 L330 592 L470 468 L640 596 L820 512 L1000 604"
        fill="none"
        stroke={INK}
        strokeWidth={4}
        opacity={0.5}
      />
      <path d="M0 700 L250 636 L520 690 L760 624 L1000 682 L1000 720 L0 720 Z" fill={P.slate} opacity={0.85} />
      <Fig x={452} y={482} s={0.9} />
      <Fig x={492} y={492} s={0.85} />
      <Rope x1={452} y1={470} x2={492} y2={480} sag={12} />
      <Motes seed={11} count={44} area={[0, 200, 1000, 520]} r={5} />
      <rect y={720} width={1000} height={280} fill={P.sage} />
      <rect y={720} width={1000} height={280} fill="#000" opacity={0.12} />
    </Scene>
  );
}

/** 02 — the market: people step off the ledges and drift down. */
function P02() {
  return (
    <Scene id="p2" skyTop="#e4dfd0">
      <Ground id="p2" horizon={760} ground={P.chalk} />
      <Tower x={90} w={70} top={60} base={760} fill={P.slate} ribs={9} />
      <Tower x={790} w={84} top={30} base={760} fill="#3f4d5c" ribs={10} />
      {[210, 330, 450, 570].map((y, i) => (
        <g key={y}>
          <rect x={160} y={y} width={200 + i * 40} height={16} fill={P.rust} opacity={0.85} />
          <rect
            x={160}
            y={y}
            width={200 + i * 40}
            height={16}
            fill="none"
            stroke={INK}
            strokeWidth={3}
            opacity={0.5}
          />
        </g>
      ))}
      <Fig x={330} y={210} s={0.8} drift />
      <Fig x={392} y={318} s={0.8} drift />
      <Fig x={446} y={430} s={0.8} drift />
      <Fig x={500} y={556} s={0.85} drift />
      <rect x={300} y={690} width={150} height={70} fill={P.ochre} />
      <rect x={470} y={702} width={130} height={58} fill={P.rust} opacity={0.9} />
      <rect x={300} y={690} width={150} height={70} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
      <rect x={470} y={702} width={130} height={58} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
      <Fig x={640} y={760} s={1} />
      <Fig x={676} y={760} s={0.9} />
      <Motes seed={22} count={30} area={[0, 80, 1000, 600]} />
      <rect y={760} width={1000} height={240} fill={P.chalk} />
      <rect y={760} width={1000} height={240} fill={P.slate} opacity={0.18} />
    </Scene>
  );
}

/** 03 — the rib: thin as a lamp post, two kilometres tall. */
function P03() {
  return (
    <Scene id="p3" skyTop="#d9d5c6" skyBottom="#eee9db">
      <Ground id="p3" horizon={780} ground={P.sage} />
      <Tower x={90} w={40} top={300} base={780} fill="#3f4d5c" ribs={6} />
      <Tower x={856} w={46} top={168} base={780} fill={P.slate} ribs={7} />
      <Rope x1={506} y1={300} x2={880} y2={200} sag={90} />
      <Rope x1={476} y1={420} x2={120} y2={330} sag={80} />
      <rect x={476} y={0} width={30} height={780} fill={P.chalk} />
      <rect x={476} y={0} width={11} height={780} fill="#000" opacity={0.16} />
      <rect x={476} y={0} width={30} height={780} fill="none" stroke={INK} strokeWidth={4} opacity={0.6} />
      {Array.from({ length: 13 }, (_, i) => 70 + i * 54).map((y) => (
        <rect key={y} x={452} y={y} width={78} height={5} fill={P.ochre} opacity={0.8} />
      ))}
      <Fig x={540} y={780} s={1.1} />
      <Motes seed={33} count={22} area={[0, 40, 1000, 700]} r={3.5} />
      <rect y={780} width={1000} height={220} fill={P.sage} />
      <rect y={780} width={1000} height={220} fill="#000" opacity={0.14} />
    </Scene>
  );
}

/** 04 — Halfweight Port: the ninth rocket before lunch, on a flatbed. */
function P04() {
  return (
    <Scene id="p4" skyTop="#dcd8ca">
      <Ground id="p4" horizon={740} ground="#cfc8b2" />
      {[
        [180, 120],
        [420, 240],
        [700, 90],
      ].map(([x, y], i) => (
        <g key={i} opacity={0.7}>
          <path d={`M${x} ${y} q10 60 0 120 q-10 -60 0 -120`} fill={P.chalk} />
          <rect x={x - 3} y={y + 120} width={6} height={190 - i * 40} fill={P.chalk} opacity={0.55} />
        </g>
      ))}
      <rect x={300} y={330} width={54} height={300} fill={P.chalk} />
      <path d="M300 330 L327 250 L354 330 Z" fill={P.rust} />
      <rect x={286} y={560} width={20} height={70} fill={P.rust} />
      <rect x={348} y={560} width={20} height={70} fill={P.rust} />
      <rect x={300} y={330} width={54} height={300} fill="none" stroke={INK} strokeWidth={4} opacity={0.6} />
      <rect x={252} y={630} width={150} height={44} fill={P.slate} />
      <rect x={402} y={646} width={170} height={28} fill={P.slate} opacity={0.8} />
      <circle cx={286} cy={686} r={26} fill={INK} opacity={0.85} />
      <circle cx={372} cy={686} r={26} fill={INK} opacity={0.85} />
      <Fig x={660} y={740} s={1} />
      <Fig x={694} y={742} s={0.95} />
      <Fig x={726} y={738} s={0.9} />
      <rect x={820} y={660} width={140} height={80} fill={P.ochre} opacity={0.9} />
      <rect x={820} y={660} width={140} height={80} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
      <Motes seed={44} count={18} area={[0, 60, 1000, 620]} r={3} />
      <rect y={740} width={1000} height={260} fill="#cfc8b2" />
      <rect y={740} width={1000} height={260} fill={P.slate} opacity={0.2} />
    </Scene>
  );
}

/** 05 — inside the Spindle: an open shaft, laundry lines, someone letting go. */
function P05() {
  return (
    <Scene id="p5" skyTop="#2f3a42" skyBottom="#6f7a72">
      <rect width={1000} height={1000} fill="#3d4a50" />
      <rect x={210} y={0} width={580} height={1000} fill="url(#sky-p5)" opacity={0.9} />
      <rect x={0} y={0} width={210} height={1000} fill="#2a353b" />
      <rect x={790} y={0} width={210} height={1000} fill="#2a353b" />
      {Array.from({ length: 7 }, (_, i) => 90 + i * 130).map((y, i) => (
        <g key={y}>
          <rect x={130} y={y} width={110} height={12} fill={P.rust} opacity={0.9} />
          <rect x={760} y={y + 40} width={110} height={12} fill={P.rust} opacity={0.9} />
          <Rope x1={240} y1={y + 20} x2={760} y2={y + 40} sag={54} stroke={P.chalk} width={3} />
          {i % 2 === 0 && (
            <>
              <rect x={380} y={y + 46} width={44} height={62} fill={P.chalk} opacity={0.85} />
              <rect x={470} y={y + 52} width={38} height={54} fill={P.ochre} opacity={0.8} />
            </>
          )}
        </g>
      ))}
      <Fig x={560} y={330} s={1.15} drift />
      <Fig x={430} y={640} s={1} drift />
      <Motes seed={55} count={20} area={[220, 60, 560, 800]} r={3.5} />
      <rect y={720} width={1000} height={280} fill="#222c31" opacity={0.55} />
    </Scene>
  );
}

/** 06 — the dead docks: rust has the cranes, gulls have the water. */
function P06() {
  return (
    <Scene id="p6" skyTop="#dbd7c9" skyBottom="#e8e3d3">
      <Ground id="p6" horizon={640} ground="#5f6f76" />
      {[
        [130, 250],
        [370, 300],
        [640, 230],
      ].map(([x, top], i) => (
        <g key={i}>
          <rect x={x} y={top} width={18} height={640 - top} fill={P.rust} />
          <rect x={x - 90} y={top} width={230} height={16} fill={P.rust} />
          <Rope x1={x + 130} y1={top + 16} x2={x + 130} y2={top + 150} sag={0} stroke={INK} width={3} />
          <rect x={x + 116} y={top + 150} width={28} height={26} fill={INK} opacity={0.7} />
        </g>
      ))}
      <rect x={0} y={640} width={1000} height={360} fill="#5f6f76" />
      {[690, 740, 800, 870].map((y, i) => (
        <rect key={y} x={40 + i * 90} y={y} width={340 - i * 40} height={5} fill={P.chalk} opacity={0.35} />
      ))}
      <rect x={720} y={556} width={250} height={86} fill="#4a5a6a" />
      <rect x={720} y={556} width={250} height={86} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
      <Rope x1={742} y1={556} x2={946} y2={556} sag={30} stroke={P.chalk} width={3} />
      <rect x={790} y={566} width={34} height={44} fill={P.ochre} opacity={0.85} />
      <rect x={856} y={568} width={30} height={40} fill={P.chalk} opacity={0.8} />
      {[
        [250, 200],
        [316, 168],
        [880, 300],
      ].map(([x, y], i) => (
        <path
          key={i}
          d={`M${x} ${y} q14 -12 26 0 q12 -12 26 0`}
          fill="none"
          stroke={INK}
          strokeWidth={4}
          opacity={0.5}
        />
      ))}
    </Scene>
  );
}

/** 07 — the new building code, one sheet, behind glass in a planning office. */
function P07() {
  return (
    <Scene id="p7" skyTop="#c9c3b1" skyBottom="#ddd7c6">
      <rect width={1000} height={1000} fill="#3a4148" />
      <rect x={0} y={0} width={1000} height={660} fill="#48525a" />
      <rect x={250} y={110} width={500} height={620} fill={INK} opacity={0.35} />
      <rect x={266} y={126} width={468} height={588} fill={P.chalk} />
      {[
        [330, 210, 330],
        [330, 246, 260],
        [330, 300, 300],
        [330, 336, 200],
        [330, 390, 340],
        [330, 426, 150],
        [330, 480, 290],
        [330, 516, 240],
      ].map(([x, y, w], i) => (
        <rect key={i} x={x} y={y} width={w} height={12} fill={INK} opacity={i < 2 ? 0.8 : 0.34} />
      ))}
      <rect x={330} y={580} width={180} height={26} fill={P.rust} opacity={0.9} />
      <rect x={266} y={126} width={468} height={588} fill="#bcd0d6" opacity={0.14} />
      <path d="M266 126 L520 126 L266 420 Z" fill={P.chalk} opacity={0.16} />
      <rect x={266} y={126} width={468} height={588} fill="none" stroke={INK} strokeWidth={5} opacity={0.6} />
      <Fig x={820} y={720} s={1.5} fill="#1b2226" />
      <rect y={660} width={1000} height={340} fill="#2f363c" />
      <rect y={660} width={1000} height={6} fill={INK} opacity={0.6} />
    </Scene>
  );
}

/** 08 — a Ground Court: forty paces across, and the gate stays shut. */
function P08() {
  return (
    <Scene id="p8" skyTop="#ded9c9">
      <Ground id="p8" horizon={560} ground="#8b9a7c" />
      <Tower x={60} w={54} top={0} base={560} fill="#414f5d" ribs={6} />
      <Tower x={180} w={40} top={70} base={560} fill={P.slate} ribs={5} />
      <Tower x={820} w={60} top={0} base={560} fill="#3b4855" ribs={7} />
      <Tower x={920} w={44} top={110} base={560} fill={P.slate} ribs={5} />
      <rect x={280} y={560} width={440} height={300} fill={P.sage} />
      {[
        [350, 640],
        [470, 700],
        [600, 630],
        [520, 790],
        [660, 760],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={30 - i * 2} fill={P.ochre} opacity={0.7} />
          <circle cx={cx} cy={cy} r={30 - i * 2} fill="none" stroke={INK} strokeWidth={3} opacity={0.45} />
        </g>
      ))}
      <rect x={280} y={560} width={440} height={300} fill="none" stroke={INK} strokeWidth={8} opacity={0.55} />
      <rect x={468} y={840} width={64} height={20} fill={P.rust} />
      <rect x={468} y={840} width={64} height={20} fill="none" stroke={INK} strokeWidth={3} opacity={0.6} />
      <rect x={0} y={860} width={1000} height={140} fill="#6d7b66" />
      <Motes seed={88} count={16} area={[0, 60, 1000, 480]} r={3} />
    </Scene>
  );
}

/** 09 — the Vertigo Ward: eleven beds, one taken. */
function P09() {
  return (
    <Scene id="p9" skyTop="#cfd8d6" skyBottom="#e2e6df">
      <rect width={1000} height={1000} fill="#dfe3dc" />
      <rect y={0} width={1000} height={330} fill="#cbd4d2" />
      {[120, 400, 680].map((x) => (
        <rect
          key={x}
          x={x}
          y={60}
          width={200}
          height={210}
          fill={P.chalk}
          stroke={INK}
          strokeWidth={5}
          strokeOpacity={0.4}
        />
      ))}
      <rect y={330} width={1000} height={8} fill={INK} opacity={0.35} />
      {Array.from({ length: 6 }, (_, i) => 60 + i * 155).map((x, i) => (
        <g key={x}>
          <rect x={x} y={420} width={120} height={54} fill={i === 2 ? P.ochre : P.chalk} />
          <rect x={x} y={420} width={120} height={54} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
          <rect x={x} y={474} width={10} height={40} fill={P.slate} />
          <rect x={x + 110} y={474} width={10} height={40} fill={P.slate} />
          {i === 2 && <rect x={x + 16} y={404} width={88} height={18} fill={P.rust} opacity={0.9} />}
        </g>
      ))}
      {Array.from({ length: 5 }, (_, i) => 138 + i * 155).map((x) => (
        <g key={x}>
          <rect x={x} y={610} width={120} height={54} fill={P.chalk} />
          <rect x={x} y={610} width={120} height={54} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
          <rect x={x} y={664} width={10} height={40} fill={P.slate} />
          <rect x={x + 110} y={664} width={10} height={40} fill={P.slate} />
        </g>
      ))}
      <rect y={740} width={1000} height={260} fill="#c9d0cb" />
      <rect y={740} width={1000} height={5} fill={INK} opacity={0.25} />
    </Scene>
  );
}

/** 10 — grain where the old maps still say tundra. */
function P10() {
  return (
    <Scene id="p10" skyTop="#d4cfbf" skyBottom="#eae4d3">
      <Ground id="p10" horizon={470} ground={P.ochre} />
      <circle cx={240} cy={150} r={54} fill={P.chalk} opacity={0.85} />
      <rect y={470} width={1000} height={530} fill={P.ochre} opacity={0.9} />
      {Array.from({ length: 11 }, (_, i) => i).map((i) => (
        <path
          key={i}
          d={`M${-260 + i * 150} 1000 L${140 + i * 78} 470 L${196 + i * 78} 470 L${-140 + i * 150} 1000 Z`}
          fill={i % 2 === 0 ? P.sage : '#b8942a'}
          opacity={0.75}
        />
      ))}
      <rect y={470} width={1000} height={5} fill={INK} opacity={0.5} />
      {[210, 420, 690, 900].map((x, i) => (
        <g key={x}>
          <rect x={x} y={520 + i * 60} width={7} height={70 + i * 24} fill={INK} opacity={0.7} />
          <rect x={x - 14} y={520 + i * 60} width={35} height={20} fill={P.rust} />
        </g>
      ))}
      <Motes seed={100} count={30} area={[0, 60, 1000, 400]} r={4} />
    </Scene>
  );
}

/** 11 — the sky-barge: forty tonnes on four canvas fans and a rope net. */
function P11() {
  return (
    <Scene id="p11" skyTop="#dbd6c6">
      <Ground id="p11" horizon={820} ground={P.sage} />
      {[
        [240, 210],
        [420, 170],
        [600, 190],
        [770, 230],
      ].map(([x, y], i) => (
        <g key={i}>
          <path d={`M${x - 82} ${y} q82 -96 164 0 z`} fill={P.chalk} />
          <path d={`M${x - 82} ${y} q82 -96 164 0 z`} fill="none" stroke={INK} strokeWidth={4} opacity={0.55} />
          <path d={`M${x} ${y - 68} L${x} ${y}`} stroke={INK} strokeWidth={3} opacity={0.4} />
          <Rope x1={x - 60} y1={y} x2={x + 40} y2={330} sag={16} width={2.5} />
          <Rope x1={x + 60} y1={y} x2={x + 90} y2={330} sag={16} width={2.5} />
        </g>
      ))}
      <rect x={210} y={330} width={620} height={40} fill={P.rust} />
      <rect x={210} y={330} width={620} height={40} fill="none" stroke={INK} strokeWidth={4} opacity={0.55} />
      {Array.from({ length: 9 }, (_, i) => 240 + i * 68).map((x) => (
        <rect
          key={x}
          x={x}
          y={370}
          width={52}
          height={52}
          fill={P.ochre}
          opacity={0.9}
          stroke={INK}
          strokeWidth={3}
          strokeOpacity={0.45}
        />
      ))}
      {Array.from({ length: 12 }, (_, i) => 216 + i * 52).map((x) => (
        <path key={x} d={`M${x} 370 L${x + 40} 440 M${x + 40} 370 L${x} 440`} stroke={INK} strokeWidth={2.5} opacity={0.4} />
      ))}
      <Fig x={300} y={820} s={0.8} />
      <Fig x={340} y={824} s={0.7} />
      <Fig x={600} y={822} s={0.75} />
      <Motes seed={111} count={20} area={[0, 60, 1000, 700]} r={3} />
      <rect y={820} width={1000} height={180} fill={P.sage} />
      <rect y={820} width={1000} height={180} fill="#000" opacity={0.12} />
    </Scene>
  );
}

/** 12 — the fleets, sat around empty fields inland. */
function P12() {
  return (
    <Scene id="p12" skyTop="#c8c2b0" skyBottom="#e4dece">
      <Ground id="p12" horizon={600} ground="#94a184" />
      <circle cx={190} cy={150} r={70} fill={P.ochre} opacity={0.65} />
      <rect y={600} width={1000} height={400} fill="#94a184" />
      {[
        [300, 640],
        [560, 622],
        [820, 648],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={110} height={7} fill={INK} opacity={0.28} />
      ))}
      {[
        [140, 700, 1],
        [420, 760, 1.25],
        [740, 690, 0.95],
        [880, 830, 1.4],
      ].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <rect x={-90} y={-16} width={180} height={32} fill={P.slate} />
          <rect x={-40} y={-40} width={80} height={26} fill="#3d4a58" />
          <rect x={-90} y={-16} width={180} height={32} fill="none" stroke={INK} strokeWidth={4} opacity={0.5} />
          <rect x={-4} y={-78} width={8} height={40} fill={INK} opacity={0.7} />
        </g>
      ))}
      <Fig x={490} y={600} s={0.8} />
      <Fig x={520} y={602} s={0.75} />
      <Motes seed={122} count={24} area={[0, 60, 1000, 520]} r={3.5} />
    </Scene>
  );
}

/* ── the chapter, in order ──────────────────────────────────────────────── */

export interface LandingPlate {
  index: number;
  Scene: () => React.JSX.Element;
  /** Verbatim from fixtures/chapter-1.ts — this is real product output. */
  text: string;
  alt: string;
}

export const PLATES: LandingPlate[] = [
  {
    index: 1,
    Scene: P01,
    alt: 'A hazed valley under hanging dust, two figures on a high ridge line.',
    text: 'Dust doesn’t fall anymore. It just hangs there, soft and pale, so the whole valley looks half-underwater in low light. The rope crew still walks the ridge line after every storm, just to be sure.',
  },
  {
    index: 2,
    Scene: P02,
    alt: 'Market ledges stacked up a tower shaft, figures drifting down past fruit stalls.',
    text: 'In the market, people step off the ledges like it costs nothing. Arms loose, feet first, down they drift. The crew is already below, waving the little ones clear of the fruit stalls.',
  },
  {
    index: 3,
    Scene: P03,
    alt: 'A single impossibly thin rib rising out of frame, guyed by long ropes.',
    text: 'Up close the rib is thinner than it has any right to be, thin as a lamp post and two kilometres tall. A rigger from the crew taps it twice, listens, and grins. Still singing true.',
  },
  {
    index: 4,
    Scene: P04,
    alt: 'A small rocket on a flatbed truck at a low-rise launch field.',
    text: 'This morning Halfweight Port sends its ninth rocket up before lunch, small enough to ride out on a flatbed truck. The ground crew waves it off. Then they go back to their tea.',
  },
  {
    index: 5,
    Scene: P05,
    alt: 'An open residential shaft crossed by laundry lines, a figure falling gently through it.',
    text: 'Inside the Spindle, a woman steps into the open shaft and lets go. She drifts past laundry lines and a neighbour doing the same. The crew rigged these landings years back, and they still hold.',
  },
  {
    index: 6,
    Scene: P06,
    alt: 'Rusted harbour cranes over still water, washing hung where a warehouse door was.',
    text: 'The old shipping docks went quiet fast. Rust has the cranes now, and gulls have the water. Someone has hung washing where a warehouse door used to open, and doesn’t think twice about it.',
  },
  {
    index: 7,
    Scene: P07,
    alt: 'A single printed sheet framed behind glass on a dim office wall.',
    text: 'Somebody pinned the new building code to a single sheet of paper. Height, it says, is nearly free. Ground is not. That one page now hangs behind glass in every planning office in the country.',
  },
  {
    index: 8,
    Scene: P08,
    alt: 'A small walled garden at street level, hemmed in by tall thin towers.',
    text: 'A Ground Court is forty paces across and costs more than a whole floor of the Spindle. Its entire value is that nothing stands above it, and that the gate stays shut.',
  },
  {
    index: 9,
    Scene: P09,
    alt: 'A pale hospital ward of eleven beds, one of them made up and occupied.',
    text: 'The crew brought a boy to the Vertigo Ward last spring, certain the ground was rushing up at him. Eleven beds. Only one was taken that week. Nobody under forty really understands the fear.',
  },
  {
    index: 10,
    Scene: P10,
    alt: 'Long ploughed strips running to a hazed horizon between survey markers.',
    text: 'Under the haze the equator cooled and the north warmed. Grain grows now where the old maps still say tundra, in long strips ploughed between survey markers nobody has moved.',
  },
  {
    index: 11,
    Scene: P11,
    alt: 'A cargo raft slung beneath four canvas fans, drifting low over fields.',
    text: 'The crew loads forty tonnes onto four canvas fans and a length of rope net, and that is the whole barge. It moves at the speed of a bicycle, and kids run underneath it the entire way.',
  },
  {
    index: 12,
    Scene: P12,
    alt: 'Warships parked on grass in an empty inland field.',
    text: 'Nobody guards the straits anymore. The fleets just sit around empty fields inland now, waiting. A launch corridor decides more than any coastline ever did. The crew still walks the ridge line, though. Someone should.',
  },
];

export { P, INK };
