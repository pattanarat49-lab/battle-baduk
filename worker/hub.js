// Everything players share, behind one handler: accounts, leaderboard and chat (acct.js), online rooms and live games
// (online.js). handle(op, body) -> { status, body, changed: [store keys whose subscribers need the new value] }
import { makeAccounts } from "./acct.js";
import { makeOnline } from "./online.js";
export function makeHub(store) {
  const acct = makeAccounts(store), online = makeOnline(store, acct.userOf);
  return async (op, body) => (await online(op, body)) || (await acct(op, body));
}
