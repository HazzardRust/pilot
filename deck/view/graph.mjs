/**
 * The Status panel's git graph as data (rune-deck-ui S13): `graphOf`'s lanes, rows and edges for the rows
 * the Status table shows (`statusView`), as the HTML graph (`renderRunGraph`, `deck/ui/render-strip.mjs`)
 * draws them. The layout is all here, so the window turns lanes and rows into points and computes none.
 * An edge keeps its `lane`, the one it runs down; its `to` is `dots.length` for the end point, on lane 0.
 */
import { graphOf } from '../status.mjs';
import { statusView } from './status.mjs';

/** `query` is `{ run, ticket }`, chosen as the Status panel chooses it. A dot's state is its phase, or ''. */
export function graphView(reads, query = {}) {
  const { lanes, dots, edges } = graphOf(statusView(reads, query).rows);
  return {
    dots: dots.map(({ name, lane, row, phase }) => ({ slice: name, lane, row, state: phase ?? '' })),
    edges: edges.map(({ from, to, lane }) => ({ from, to, lane })),
    lanes,
  };
}

export default ({ reads, query }) => graphView(reads, query);
