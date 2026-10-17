// Vercel serverless function: GET /api/leetcode
// Returns public LeetCode stats for one user. LeetCode has no official API, so this calls its
// public GraphQL endpoint from the server (which avoids the browser CORS block).
const USERNAME = process.env.LEETCODE_USERNAME || 'vishnuvinod03';

const QUERY = `
  query userStats($username: String!) {
    matchedUser(username: $username) {
      submitStatsGlobal { acSubmissionNum { difficulty count } }
      userCalendar { streak totalActiveDays }
    }
  }`;

module.exports = async (req, res) => {
  try {
    const r = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com', 'User-Agent': 'Mozilla/5.0 (portfolio stats)' },
      body: JSON.stringify({ query: QUERY, variables: { username: USERNAME } }),
    });
    if (!r.ok) throw new Error('upstream ' + r.status);
    const user = ((await r.json()).data || {}).matchedUser;
    if (!user) throw new Error('user not found');
    const by = {};
    for (const x of user.submitStatsGlobal.acSubmissionNum) by[x.difficulty] = x.count;
    const cal = user.userCalendar || {};
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({
      total: by.All || 0, easy: by.Easy || 0, medium: by.Medium || 0, hard: by.Hard || 0,
      streak: cal.streak ?? null, activeDays: cal.totalActiveDays ?? null,
    });
  } catch (e) {
    res.status(502).json({ error: 'leetcode unavailable' });
  }
};
