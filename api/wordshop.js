// The Word Shop (Learn...Wow!) — server function (Vercel)
// One endpoint. Actions:
//   report   — a full write-up for one section (lookup, makeover, origins, thennow, idiom, decoder, ask)
//   round    — a guessing round (thennow, slang, opposite)
//   followup — answer a follow-up question about the last result
// Family-friendly, accurate, original wording (never copied from a dictionary).

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.WS_MODEL || 'claude-sonnet-5-5';
const DAILY_LIMIT = parseInt(process.env.WS_DAILY_LIMIT || '150', 10); // API calls per visitor per day
const ALLOWED = (process.env.WS_ALLOWED_HOSTS ||
  'nusparklearnwow.com,nusparkpublishing.com,nusparkmarketing.com,vercel.app,localhost,127.0.0.1')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// ---------- Shared rules ----------
const BASE = [
  'You are Mr. Paul, the friendly shopkeeper of "The Word Shop," a word-learning experience from Learn...Wow! at NuSparkLearnWow.com.',
  'Audience: curious adults first, plus families with kids. Warm, clear, a little playful. Plain English, never stuffy.',
  'RULES:',
  '- Accuracy first. If you are not sure of a fact, date or origin, say so plainly instead of guessing.',
  '- Write every definition in your own words. Never copy wording from Merriam-Webster, Oxford or any other dictionary.',
  '- Family-friendly always. No crude, sexual or hateful content. If someone asks about a crude word or phrase, give a short, polite note that it is not family-friendly and offer a cleaner related word instead.',
  '- Examples should be national and everyday (not tied to one city or local team). No real living private people.',
  '- Be generous with detail: these are "double-length" write-ups, so each paragraph should be full and interesting, not a one-liner.',
  '- If the request is unclear (for example a word with very different meanings, a misspelling, or a phrase you cannot identify), put ONE short clarifying question in "clarify" and still give your best answer for the most likely meaning.',
  '- Origin stories: label how solid they are. "Proven" = documented by language historians. "Likely" = the best-supported explanation. "Legend" = a popular story that is not supported (say what is actually known instead). Many famous word stories are legends; busting them is part of the fun.'
].join('\n');

const REPORT_SHAPE = '{"clarify":"one short clarifying question, or empty string","title":"the word or phrase","tag":"short line under the title (e.g. part of speech and simple pronunciation like PRO-nun-see-AY-shun, or the decade)","badge":"Proven, Likely, Legend, or empty string","sections":[{"h":"heading","p":"one or two full paragraphs (separate paragraphs with \\n\\n)","items":["optional list items"]}],"wow":"one Wow...Who Knew? fact, 1-2 sentences"}';

const REPORTS = {
  lookup: {
    need: 'word',
    brief: 'WORD LOOKUP for the word below. Sections in this order: "What It Means" (plain-English meaning; if it has several common meanings, cover the main ones), "Used in a Sentence" (items: exactly 3 sentences labeled "Casual: ...", "Professional: ...", "Fun: ..."), "Word Family" (items: its other forms, e.g. noun, verb, adjective, adverb versions, each with a tiny example), "Stronger and Fancier Words" (items: a ladder of 4-6 similar words from everyday to formal, each with a 2-4 word note on when to use it), "Opposites" (items: 2-4 opposite words), "Watch Out For" (a common mix-up, misspelling or misuse, if any; otherwise a usage tip). badge: empty.'
  },
  makeover: {
    need: 'sentence',
    brief: 'WORD MAKEOVER. Rewrite the visitor\'s sentence in the requested direction. Keep the original meaning. Sections in this order: "Your Makeover" (p: the rewritten sentence, then a second, even bolder version as a bonus), "What Changed" (items: each swapped or added word, written as "old → new: why it works"), "Why It Lands Differently" (how the new vocabulary changes the feeling, tone or picture in the reader\'s mind), "Try These Too" (items: 3 more one-sentence versions in the other directions: exciting, professional, descriptive, funny — skip the one already chosen and label each). badge: empty. title: "Word Makeover". tag: the direction chosen.'
  },
  origins: {
    need: 'word',
    brief: 'WORD ORIGINS for the word below. Tell it as a short, lively story. Sections in this order: "The Story" (where the word came from and how it traveled into English), "The Journey" (items: 3-6 stops along the way, e.g. "Latin: ... → Old French: ... → English, 1300s"), "Then and Now" (how its meaning shifted, if it did), "Word Cousins" (items: 3-5 related English words from the same root, each with a few words of explanation). badge: how solid the origin story is (Proven, Likely, or Legend).'
  },
  thennow: {
    need: 'word',
    brief: 'THEN vs. NOW for the word below: a word whose meaning changed over time. Sections in this order: "What It Meant Then" (the older meaning, with roughly when), "What It Means Now", "How It Changed" (the steps and reasons the meaning drifted), "Then in a Sentence vs. Now in a Sentence" (items: one sentence using the old meaning, one using the modern meaning, labeled "Then:" and "Now:"). If the word has NOT really changed meaning, say so kindly and suggest 3 words that did. badge: how solid the history is.'
  },
  idiom: {
    need: 'phrase',
    brief: 'IDIOMS EXPLAINED for the phrase below. Sections in this order: "What It Means", "Where It Came From" (the origin story; if the popular story is a legend, say so and explain what is actually known), "Use It Like This" (items: 3 example sentences: everyday, at work, and a fun one), "Similar Sayings" (items: 3-5 related idioms with short meanings). badge: how solid the origin is (Proven, Likely, or Legend).'
  },
  decoder: {
    need: 'phrase',
    brief: 'TODAY\'S SLANG DECODER. A parent or grandparent typed something they heard kids or young adults say. Sections in this order: "In Plain English" (what it means), "How They Use It" (items: 2-3 example sentences the way young people say it, each followed by a plain-English translation in parentheses), "Where It Came From" (origin, if known; slang often starts in music, gaming, social media or specific communities — say so respectfully), "Should You Use It?" (a friendly, honest take on how it lands when adults use it). Slang changes fast: if the term is newer than you know well, or could mean different things, say that clearly. If it is crude or not family-friendly, keep it general and polite. tag: e.g. "Slang, 2020s". badge: empty.'
  },
  slanglookup: {
    need: 'phrase',
    brief: 'SLANG THROUGH THE DECADES lookup for the slang term below. Sections in this order: "What It Meant" (meaning and the decade it was popular), "Who Said It" (the crowd, music, movies or TV that made it popular, described in general terms), "In a Sentence" (items: 2 example sentences as people said it back then), "Does Anyone Still Say It?" (today\'s status, and any modern replacement). tag: the decade. badge: empty.'
  },
  ask: {
    need: 'question',
    brief: 'OPEN WORD QUESTION. The visitor asked Mr. Paul their own question about words, meanings, spelling, pronunciation, origins, idioms, slang or usage. Answer it fully and accurately. Choose 3-5 sections with headings that fit the question (for example "Short Answer", "The Details", "Examples", "Memory Trick", "Fun Extra"). Start with a "Short Answer" section. If the question is not about language at all, answer briefly and kindly, then steer them back to words with a related word fact. title: a short version of their question. badge: Proven/Likely/Legend only if the question is about an origin, otherwise empty.'
  }
};

const ROUNDS = {
  thennow: 'Create ONE "Then vs. Now" guessing round: an English word whose meaning changed a lot over time (examples of the kind: nice, awful, silly, girl, meat, clue, nervous, bully, naughty, egregious; pick family-friendly ones). The visitor sees the word and three possible OLD meanings and guesses the real one. Shape: {"word":"...","question":"What did this word once mean?","options":["three plausible old meanings, similar length; one is true"],"answer":0,"then":"the real older meaning and roughly when","now":"the modern meaning","story":"2-3 sentences on how the meaning drifted","badge":"Proven or Likely"}. answer is the index (0, 1 or 2) of the true option.',
  slang: 'Create ONE "Slang Through the Decades" guessing round: a real, family-friendly American slang term clearly tied to one decade. The visitor guesses the decade and the meaning. Shape: {"term":"...","decades":["1950s","1960s","1970s","1980s","1990s","2000s","2010s","2020s"],"decade":"the correct decade, exactly one of those","options":["three possible meanings, similar length; one is true"],"answer":0,"explain":"2-3 sentences: what it meant, who said it (music, movies, TV, general crowd) and whether anyone still says it","example":"one sentence using it the way people did back then"}. answer is the index of the true meaning.',
  opposite: 'Create ONE "Words That Mean Their Own Opposite" round (contronyms), family-friendly. Examples of the kind: sanction, dust, cleave, left, oversight, seed, screen, fast, bolt, weather, clip, trim, bound, overlook, rent. The visitor sees a sentence and picks which of the two meanings it uses. Shape: {"word":"...","a":"meaning A, short","b":"meaning B (the opposite), short","sentence":"one sentence that clearly uses ONE of the meanings","answer":"a or b","explain":"2-3 sentences on why this word ended up with opposite meanings","exampleA":"a sentence using meaning A","exampleB":"a sentence using meaning B"}.'
};

// ---------- Helpers ----------
function clip(s, n) { return String(s == null ? '' : s).slice(0, n); }
function parseJSON(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('No JSON in reply');
  return JSON.parse(text.slice(s, e + 1));
}

async function callClaude(payload) {
  if (!API_KEY) throw new Error('Missing ANTHROPIC_API_KEY');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(Object.assign({ model: MODEL }, payload))
  });
  const j = await r.json();
  if (!r.ok) throw new Error((j.error && j.error.message) || 'AI service error');
  return j;
}

// Structured reply via a tool call, so the answer is always clean JSON
async function claudeJSON(system, user, maxTokens) {
  const j = await callClaude({
    max_tokens: maxTokens + 6000,
    system: system + '\n\nIMPORTANT: Always answer by calling the respond tool. Do not reply with plain text.',
    tools: [{ name: 'respond', description: 'Return your answer as a JSON object in the exact shape described.', input_schema: { type: 'object', additionalProperties: true } }],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }]
  });
  const blocks = j.content || [];
  const tool = blocks.find(b => b.type === 'tool_use');
  if (tool && tool.input && typeof tool.input === 'object') return tool.input;
  return parseJSON(blocks.map(b => b.text || '').join(''));
}

async function claudeText(system, messages, maxTokens) {
  const j = await callClaude({ max_tokens: maxTokens + 6000, system, messages });
  return (j.content || []).map(c => c.text || '').join('').trim();
}

function hostAllowed(req) {
  const src = req.headers.origin || req.headers.referer || '';
  if (!src) return false;
  let host = '';
  try { host = new URL(src).hostname.toLowerCase(); } catch (e) { return false; }
  return ALLOWED.some(a => host === a || host.endsWith('.' + a));
}

async function underLimit(req) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return true; // no database connected = no per-visitor cap (Anthropic spend limit still applies)
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = 'ws:' + new Date().toISOString().slice(0, 10) + ':' + ip;
  try {
    const r = await fetch(url + '/pipeline', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 90000]])
    });
    const j = await r.json();
    const count = j && j[0] && j[0].result;
    return !(count > DAILY_LIMIT);
  } catch (e) { return true; }
}

function cleanReport(d) {
  const sections = (Array.isArray(d.sections) ? d.sections : []).slice(0, 8).map(s => ({
    h: clip(s && s.h, 120),
    p: clip(s && s.p, 2400),
    items: (Array.isArray(s && s.items) ? s.items : []).slice(0, 10).map(x => clip(x, 400))
  })).filter(s => s.h || s.p || s.items.length);
  const badge = ['Proven', 'Likely', 'Legend'].includes(d.badge) ? d.badge : '';
  return { clarify: clip(d.clarify, 300), title: clip(d.title, 140), tag: clip(d.tag, 160), badge, sections, wow: clip(d.wow, 500) };
}

// ---------- Actions ----------
async function report(body) {
  const def = REPORTS[body.section];
  if (!def) throw new Error('Unknown section');
  const input = clip(body.input, 400).trim();
  const surprise = !input && body.surprise;
  if (!input && !surprise) throw new Error('Type something first');
  const seen = (Array.isArray(body.seen) ? body.seen : []).slice(-25).map(s => clip(s, 60));

  let user;
  if (surprise) {
    user = 'Surprise the visitor: pick an interesting, family-friendly ' + def.need + ' that makes people say "Wow...Who Knew?" and write it up.' +
      (seen.length ? ' Do NOT use any of these (already shown): ' + seen.join(', ') + '.' : '');
  } else if (body.section === 'makeover') {
    const dir = ['exciting', 'professional', 'descriptive', 'funny'].includes(body.direction) ? body.direction : 'exciting';
    user = 'Direction: make it more ' + dir + '.\nVisitor\'s sentence: ' + input;
  } else {
    user = 'Visitor\'s ' + def.need + ': ' + input;
  }
  const system = BASE + '\n\nTASK: ' + def.brief + '\n\nCall the respond tool with an object in this exact shape:\n' + REPORT_SHAPE;
  const d = await claudeJSON(system, user, 3000);
  return cleanReport(d);
}

async function round(body) {
  const brief = ROUNDS[body.kind];
  if (!brief) throw new Error('Unknown round');
  const seen = (Array.isArray(body.seen) ? body.seen : []).slice(-30).map(s => clip(s, 60));
  let extra = '';
  if (body.kind === 'slang' && /^(19[5-9]0s|20[0-2]0s)$/.test(String(body.decade || ''))) extra = ' Use a term from the ' + body.decade + '.';
  const user = 'Make a new round.' + extra + (seen.length ? ' Do NOT use any of these (already played): ' + seen.join(', ') + '.' : '');
  const system = BASE + '\n\nTASK: ' + brief + '\nCall the respond tool with that exact shape.';
  let d, tries = 0;
  while (tries < 2) {
    tries++;
    try {
      d = await claudeJSON(system, user, 1200);
      if (Array.isArray(d.options) && d.options.length >= 2 || (body.kind === 'opposite' && d.word && d.sentence)) break;
    } catch (e) { if (tries >= 2) throw e; }
  }
  if (!d || (body.kind !== 'opposite' && !(Array.isArray(d.options) && d.options.length >= 2))) throw new Error('No round');
  const out = { kind: body.kind };
  if (body.kind === 'thennow') {
    out.word = clip(d.word, 60); out.question = clip(d.question || 'What did this word once mean?', 160);
    out.options = d.options.slice(0, 3).map(o => clip(o, 200));
    out.answer = Math.max(0, Math.min(out.options.length - 1, parseInt(d.answer, 10) || 0));
    out.then = clip(d.then, 400); out.now = clip(d.now, 400); out.story = clip(d.story, 900);
    out.badge = ['Proven', 'Likely', 'Legend'].includes(d.badge) ? d.badge : 'Likely';
  } else if (body.kind === 'slang') {
    out.term = clip(d.term, 60);
    out.decades = ['1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'];
    out.decade = out.decades.includes(d.decade) ? d.decade : (body.decade || '1980s');
    out.options = d.options.slice(0, 3).map(o => clip(o, 200));
    out.answer = Math.max(0, Math.min(out.options.length - 1, parseInt(d.answer, 10) || 0));
    out.explain = clip(d.explain, 900); out.example = clip(d.example, 300);
  } else {
    out.word = clip(d.word, 60); out.a = clip(d.a, 200); out.b = clip(d.b, 200);
    out.sentence = clip(d.sentence, 300); out.answer = String(d.answer).toLowerCase() === 'b' ? 'b' : 'a';
    out.explain = clip(d.explain, 900); out.exampleA = clip(d.exampleA, 300); out.exampleB = clip(d.exampleB, 300);
  }
  return out;
}

async function followup(body) {
  const q = clip(body.question, 800).trim();
  if (!q) throw new Error('Type a question first');
  const context = clip(body.context, 6000);
  const history = (Array.isArray(body.history) ? body.history : []).slice(-8)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clip(m.content, 2500) }))
    .filter(m => m.content);
  const system = BASE + '\n\nTASK: The visitor is asking a follow-up question about something they just saw in The Word Shop. Answer conversationally in plain text (no markdown symbols like # or **). Be complete but readable: usually 2-4 short paragraphs, with examples where they help. If you need more information to answer correctly, ask one short clarifying question.\n\nWHAT THE VISITOR WAS LOOKING AT:\n' + context;
  const messages = history.concat([{ role: 'user', content: q }]);
  // The conversation must start with a user turn
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return { answer: clip(await claudeText(system, messages, 1200), 5000) };
}

// ---------- Handler ----------
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!hostAllowed(req)) return res.status(403).json({ error: 'This tool only runs on NuSpark sites.' });
  if (!(await require('./_lwgate')(req, res, 'word-shop'))) return;
  if (!(await underLimit(req))) return res.status(429).json({ error: "You've reached today's limit. Come back tomorrow!" });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  try {
    let out;
    if (body.action === 'report') out = await report(body);
    else if (body.action === 'round') out = await round(body);
    else if (body.action === 'followup') out = await followup(body);
    else return res.status(400).json({ error: 'Unknown action' });
    return res.status(200).json(out);
  } catch (e) {
    console.error('word-shop error:', e.message);
    const friendly = /Type something|Type a question/.test(e.message) ? e.message : 'Something went wrong. Please try again.';
    return res.status(500).json({ error: friendly });
  }
};

module.exports._test = { REPORTS, ROUNDS, cleanReport };
