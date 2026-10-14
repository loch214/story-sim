import type { Metadata } from 'next';
import { Fraunces, IBM_Plex_Mono, Newsreader } from 'next/font/google';
import './globals.css';

// Three faces, three jobs: naming, prose, taxonomy.
const display = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  axes: ['SOFT', 'WONK'],
});

const body = Newsreader({
  variable: '--font-body',
  subsets: ['latin'],
  style: ['normal', 'italic'],
});

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://story-sim.vercel.app'),
  title: {
    default: 'Story-sim — change one rule of reality',
    template: '%s · Story-sim',
  },
  description:
    'Change one rule of reality and read the world that results: an illustrated story of twelve to fifteen pages, written and drawn. Add a second rule and the world compounds.',
  openGraph: {
    title: 'Story-sim — change one rule of reality',
    description:
      'One rule in. An illustrated twelve-to-fifteen-page story of the resulting world out, read with arrow keys.',
    type: 'website',
  },
};

/**
 * The direction contract as a literal HTML comment, first child of body. A JSX
 * comment (`{/* ... *\/}`) is a JavaScript comment stripped at compile time and
 * never reaches the DOM — `dangerouslySetInnerHTML` is what actually survives
 * into the emitted markup, which is the only place `grep` after a production
 * build can find it. See PRODUCT.md for product truth this contract assumes.
 */
const CONTRACT_TEXT = `
  DIRECTION CONTRACT -- surface round befd8407, form "The Turning Book" (index 5 of 7).
  THESIS: derivation is the product, so the site is read the way the product is read - leaf
  by leaf. It refuses the stacked-section marketing page whose scroll means nothing.
  OWN-WORLD: the app's own instrument chrome inherited whole - near-black #0d1214 ground,
  vellum #ebe5d7 leaf backs, world tint #c9a227 gold and #b4553c rust; Fraunces naming,
  Newsreader prose, Plex Mono taxonomy; hairline rules, no cards, artwork the only warm thing.
  STORY: one line of yours becomes a derived chain, twelve plates held by a frozen style
  bible, and a book with an arc - then you open the atlas or read The Long Fall for free.
  FIRST VIEWPORT: one large leaf, centred, tilted toward the reader on the spine at left; the
  leaf reads across, not down - "Story-sim" in Fraunces with the rule strip and the two actions
  down its left half, plate 01 a full-height square on its right, six sheets of edge-stack at
  the fore-edge, and the leading corner already lifted.
  FORM: The Turning Book - scroll rotates each leaf about the left spine; seed key befd8407.
  FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review,
  the verdict, DESIGN.md, and every shipping raster carrying its provenance.
`;

/** A literal `<!-- -->` node — HTML comments cannot contain "--", so the
 * contract above is ASCII-hyphen safe by construction. */
function DirectionContract() {
  return <div style={{ display: 'none' }} dangerouslySetInnerHTML={{ __html: `<!--${CONTRACT_TEXT}-->` }} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        <DirectionContract />
        {children}
      </body>
    </html>
  );
}
