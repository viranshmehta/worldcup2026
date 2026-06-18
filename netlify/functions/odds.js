const https = require("https");

const SPORT_KEY = "soccer_fifa_world_cup";
const REGIONS   = "us";
const MARKETS   = "h2h,totals,spreads";

exports.handler = async function () {
  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    return respond({ live:false, reason:"no_key", message:"No ODDS_API_KEY set.", matches:[], scores:[] });
  }

  try {
    const [oddsRes, scoresRes] = await Promise.all([
      get("api.the-odds-api.com",
        `/v4/sports/${SPORT_KEY}/odds/?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=decimal&dateFormat=iso`),
      get("api.the-odds-api.com",
        `/v4/sports/${SPORT_KEY}/scores/?apiKey=${API_KEY}&daysFrom=3&dateFormat=iso`)
    ]);

    if (oddsRes.status !== 200) {
      return respond({ live:false, reason:"api_error", status:oddsRes.status,
        message:oddsRes.body.slice(0,300), matches:[], scores:[] });
    }

    const rawOdds   = JSON.parse(oddsRes.body);
    const rawScores = scoresRes.status === 200 ? JSON.parse(scoresRes.body) : [];

    const matches = rawOdds.map(normalizeMatch).filter(Boolean);

    const scores = {};
    rawScores.forEach(function(g) {
      if (!g || !g.scores) return;
      var hs = g.scores.find(function(s){ return s.name === g.home_team; });
      var as = g.scores.find(function(s){ return s.name === g.away_team; });
      scores[g.id] = {
        home: g.home_team,
        away: g.away_team,
        homeScore: hs ? parseInt(hs.score, 10) : null,
        awayScore: as ? parseInt(as.score, 10) : null,
        completed: g.completed === true
      };
    });

    return respond({
      live: true,
      fetchedAt: new Date().toISOString(),
      creditsRemaining: oddsRes.headers["x-requests-remaining"] || null,
      matches,
      scores
    });

  } catch(err) {
    return respond({ live:false, reason:"fetch_failed",
      message:String(err).slice(0,300), matches:[], scores:{} });
  }
};

function get(host, path) {
  return new Promise(function(resolve, reject) {
    var req = https.get({ host:host, path:path, headers:{"Accept":"application/json"} }, function(res) {
      var body = "";
      res.on("data", function(c){ body += c; });
      res.on("end",  function(){ resolve({ body:body, headers:res.headers, status:res.statusCode }); });
    });
    req.on("error", reject);
    req.setTimeout(8000, function(){ req.destroy(); reject(new Error("timeout")); });
  });
}

function normalizeMatch(game) {
  if (!game || !game.bookmakers) return null;
  var best = { h2h:{}, totals:{}, spreads:{} };
  game.bookmakers.forEach(function(bk) {
    (bk.markets||[]).forEach(function(m) {
      (m.outcomes||[]).forEach(function(o) {
        if (m.key === "h2h") {
          if (!best.h2h[o.name] || o.price > best.h2h[o.name]) best.h2h[o.name] = o.price;
        } else if (m.key === "totals") {
          var label = o.name+" "+o.point;
          if (!best.totals[label] || o.price > best.totals[label].price)
            best.totals[label] = { price:o.price, point:o.point, side:o.name };
        } else if (m.key === "spreads") {
          if (!best.spreads[o.name] || o.price > best.spreads[o.name].price)
            best.spreads[o.name] = { price:o.price, point:o.point };
        }
      });
    });
  });
  return {
    id: game.id, home: game.home_team, away: game.away_team,
    commence: game.commence_time,
    isLive: new Date(game.commence_time).getTime() <= Date.now(),
    bookmakerCount: game.bookmakers.length,
    odds: best
  };
}

function respond(body) {
  return {
    statusCode: 200,
    headers: { "Content-Type":"application/json", "Cache-Control":"public, max-age=30" },
    body: JSON.stringify(body)
  };
}
