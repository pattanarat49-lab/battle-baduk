// Everything players share, behind one handler: accounts, leaderboard and chat (acct.js), online rooms and live games
// (online.js), the weekly tournament (tourney.js). handle(op, body) -> { status, body, changed: [store keys whose
// subscribers need the new value] }. handle.wake() says when the tournament next needs a tick (the Durable Object's alarm).
import { makeAccounts } from "./acct.js";
import { makeOnline } from "./online.js";
import { makeTourney } from "./tourney.js";
export function makeHub(store) {
  const hooks = {}, acct = makeAccounts(store), online = makeOnline(store, acct.userOf, hooks), tour = makeTourney(store, acct, online);
  hooks.onEnd = tour.onEnd;
  const handle = async (op, body) => (await tour(op, body)) || (await online(op, body)) || (await acct(op, body));
  handle.wake = tour.wake;
  return handle;
}
