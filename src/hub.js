// One WebSocket to the Worker (/api/ws) for everything live: chat, online rooms, the lobby and watching games.
// Hub.op(name, body) -> Promise<{status, body}>; Hub.sub(key, cb) -> unsubscribe; cb(value) runs on every change.
// The socket opens on first use and closes 30 s after nothing needs it. The private preview page provides
// window.ACCT_HUB with the same shape (its database instead of a server).
const Hub = window.ACCT_HUB || (() => {
  const BASE = /github\.io$/.test(location.hostname) ? "wss://battle-baduk.battlebaduk.workers.dev" : (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  let ws = null, live = false, re = 0, wait = 1000, retry = 0, idle = 0, skew = 0;
  const pending = new Map(), subs = new Map(), queue = [], states = new Set();
  const say = s => states.forEach(f => { try { f(s); } catch (e) {} });
  function connect() {
    if (ws) return;
    try { ws = new WebSocket(BASE + "/api/ws"); } catch (e) { ws = null; return; }
    ws.onopen = () => {
      live = true; wait = 1000; say("on");
      if (subs.size) ws.send(JSON.stringify({ sub: [...subs.keys()] }));
      while (queue.length) ws.send(queue.shift());
    };
    ws.onmessage = e => {
      let m = null; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (typeof m.now === "number") skew = m.now - Date.now();
      if (m.re && pending.has(m.re)) { const p = pending.get(m.re); pending.delete(m.re); clearTimeout(p.t); p.res({ status: m.status, body: m.body || {} }); }
      else if (m.k && subs.has(m.k)) for (const f of subs.get(m.k)) { try { f(m.v); } catch (x) { console.error(x); } }
    };
    ws.onclose = () => {
      ws = null; live = false; say("off");
      for (const [id, p] of pending) { clearTimeout(p.t); p.res({ status: 0, body: { error: "ขาดการเชื่อมต่อ ลองอีกครั้ง" } }); pending.delete(id); }
      if (subs.size) { clearTimeout(retry); retry = setTimeout(connect, wait); wait = Math.min(wait * 2, 20000); }
    };
  }
  function send(s) { clearTimeout(idle); if (live) ws.send(s); else { queue.push(s); connect(); } }
  function maybeClose() { clearTimeout(idle); if (!subs.size && !pending.size) idle = setTimeout(() => { if (!subs.size && !pending.size && ws) ws.close(); }, 30000); }
  function op(name, body) {
    return new Promise(res => {
      const id = ++re;
      const t = setTimeout(() => { pending.delete(id); res({ status: 0, body: { error: "เซิร์ฟเวอร์ไม่ตอบ ลองอีกครั้ง" } }); maybeClose(); }, 15000);
      pending.set(id, { res: v => { res(v); maybeClose(); }, t });
      send(JSON.stringify({ re: id, op: name, body: body || {} }));
    });
  }
  function sub(key, cb) {
    if (!subs.has(key)) subs.set(key, new Set());
    subs.get(key).add(cb);
    send(JSON.stringify({ sub: [...subs.keys()] }));
    return () => {
      const s = subs.get(key); if (!s) return;
      s.delete(cb); if (!s.size) subs.delete(key);
      if (live) ws.send(JSON.stringify({ sub: [...subs.keys()] }));
      maybeClose();
    };
  }
  return { op, sub, now: () => Date.now() + skew, onState: f => { states.add(f); return () => states.delete(f); }, connected: () => live };
})();
