const https = require("https");

const SPORT_KEY = "soccer_fifa_world_cup";
const REGIONS   = "us";
const MARKETS   = "h2h,totals,spreads";

exports.handler = async function () {
  const API_KEY = process.env.ODDS_API_KEY;

  if (!API_KEY) {
    return respond({ live: false, reason: "no_key",
      message: "No ODDS_API_KEY found. Add it in Netlify environment variables.", matches: [] });
  }

  const path =
    `/v4/sports/${SPORT_KEY}/odds/` +
    `?apiKey=${API_KEY}` +
    `&regions=${REGIONS}` +
    `&markets=${MARKETS}` +
    `&oddsFormat=decimal` +
    `&dateFormat=iso`;

  try {
    const { body, headers, status } = await get("api.the-odds-api.com", path);

    if (status !== 200) {
      return respond({ live: false, reason: "api_error", status,
        message: body.slice(0, 300), matches: [] });
    }

    const raw = JSON.parse(body);
    const matches = raw.map(normalizeMatch).filter(Boolean);

    return respond({
      live: true,
      fetchedAt: new Date().toISOString(),
      creditsRemaining: headers["x-requests-remaining"] || null,
      creditsUsed:      headers["x-requests-used"]      || null,
      matches,
    });
  } catch (err) {
    return respond({ live: false, reason: "fetch_failed",
      message: String(err).slice(0, 300), matches: [] });
  }
};

function get(host, path) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host, path, headers: { "Accept": "application/json" } }, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end",  () => resolve({ body, headers: res.headers, status: res.statusCode }));
    });
    req.on("error", reject);
    req.setTimeout(8000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function normalizeMatch(game) {
  if (!game || !game.bookmakers) return null;
  const best = { h2h: {}, totals: {}, spreads: {} };
  for (const bk of game.bookmakers) {
    for (const m of bk.markets || []) {
      for (const o of m.outcomes || []) {
        if (m.key === "h2h") {
          if (!best.h2h[o.name] || o.price > best.h2h[o.name]) best.h2h[o.name] = o.price;
        } else if (m.key === "totals") {
          const label = `${o.name} ${o.point}`;
          if (!best.totals[label] || o.price > best.totals[label].price)
            best.totals[label] = { price: o.price, point: o.point, side: o.name };
        } else if (m.key === "spreads") {
          if (!best.spreads[o.name] || o.price > best.spreads[o.name].price)
            best.spreads[o.name] = { price: o.price, point: o.point };
        }
      }
    }
  }
  return {
    id: game.id, home: game.home_team, away: game.away_team,
    commence: game.commence_time,
    isLive: new Date(game.commence_time).getTime() <= Date.now(),
    bookmakerCount: game.bookmakers.length,
    odds: best,
  };
}

function respond(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=30" },
    body: JSON.stringify(body),
  };
}
