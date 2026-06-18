const { getStore } = require("@netlify/blobs");

const STORE_NAME = "wc2026";
const PLAYERS_KEY = "players";
const WAGERS_KEY  = "wagers";

exports.handler = async function(event) {
  const method = event.httpMethod;

  try {
    const store = getStore(STORE_NAME);

    if (method === "GET") {
      const [playersRaw, wagersRaw] = await Promise.all([
        store.get(PLAYERS_KEY).catch(() => null),
        store.get(WAGERS_KEY).catch(() => null)
      ]);
      return ok({
        players: playersRaw ? JSON.parse(playersRaw) : [],
        wagers:  wagersRaw  ? JSON.parse(wagersRaw)  : []
      });
    }

    if (method === "POST") {
      const body = JSON.parse(event.body || "{}");
      const ops = [];
      if (body.players !== undefined) ops.push(store.set(PLAYERS_KEY, JSON.stringify(body.players)));
      if (body.wagers  !== undefined) ops.push(store.set(WAGERS_KEY,  JSON.stringify(body.wagers)));
      await Promise.all(ops);
      return ok({ saved: true });
    }

    return err(405, "Method not allowed");

  } catch(e) {
    if (String(e).includes("blob") || String(e).includes("getStore") || String(e).includes("Blobs")) {
      const method2 = event.httpMethod;
      if (method2 === "GET") return ok({ players: [], wagers: [], blobsNotEnabled: true });
      return ok({ saved: false, blobsNotEnabled: true });
    }
    return err(500, String(e).slice(0, 300));
  }
};

function ok(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function err(code, msg) {
  return {
    statusCode: code,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ error: msg })
  };
}
