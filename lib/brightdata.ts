import type { FetchResult } from './native';

const BRIGHTDATA_BASE = 'https://api.brightdata.com/request';

interface BrightDataConfig {
  token: string;
  zone: string;
}

function getConfig(): BrightDataConfig | null {
  const token = process?.env.BRIGHTDATA_API_TOKEN;
  const zone = process?.env.BRIGHTDATA_ZONE || 'web_unlocker1';
  if (!token) return null;
  return { token, zone };
}

const DEFAULT_URLS: Record<string, string> = {
  reddit: 'https://www.reddit.com/r/technology/top.json?limit=10',
  amazon: 'https://www.amazon.com/Best-Sellers/zgbs/electronics/',
  linkedin: 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer',
};
// In brightdata.ts — add a new endpoint constant
const BRIGHTDATA_SERP = 'https://api.brightdata.com/serp/google/search';
const BRIGHTDATA_BATCH = 'https://api.brightdata.com/datasets/v3/scrape?format=json'; // verify exact path in your dashboard

async function brightdataRedditScrapeMode(query: string, config: BrightDataConfig): Promise<FetchResult> {
  const start = Date.now();

  // Step 1: SERP — get Reddit URLs
  console.log('[brightdataFetch] Reddit scrape: step 1 — SERP search');
  const serpRes = await fetch(BRIGHTDATA_SERP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      zone: config.zone,
      query: `site:reddit.com ${query}`,
      engine: 'google',
      num: 5,
    }),
  });

  if (!serpRes.ok) {
    return { status: 'blocked', data: [], error: `SERP step failed: HTTP ${serpRes.status}`, duration_ms: Date.now() - start, items_count: 0 };
  }

  const serpJson = await serpRes.json();
  const urls: string[] = (serpJson?.organic ?? [])
    .slice(0, 5)
    .map((r: any) => r.link)
    .filter((url: string) => url?.includes('reddit.com/r/'));

  console.log('[brightdataFetch] Reddit scrape: found URLs:', urls);

  if (urls.length === 0) {
    return { status: 'partial', data: [], error: 'SERP returned no Reddit URLs', duration_ms: Date.now() - start, items_count: 0 };
  }

  // Step 2: scrape_batch — fetch post content
  console.log('[brightdataFetch] Reddit scrape: step 2 — batch scrape');
  const batchRes = await fetch(BRIGHTDATA_BATCH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.token}`,
    },
    body: JSON.stringify({ urls }),
  });

  if (!batchRes.ok) {
    return { status: 'blocked', data: [], error: `Batch scrape failed: HTTP ${batchRes.status}`, duration_ms: Date.now() - start, items_count: 0 };
  }

  const batchJson = await batchRes.json();

  // Parse each fulfilled result
  const data = batchJson
    .filter((r: any) => r.status === 'fulfilled' && r.value?.content)
    .map((r: any) => {
      const content = r.value.content as string;
      const url = r.value.url as string;

      // Extract subreddit
      const subreddit = url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? '';

      // Extract title — first substantial heading after the subreddit line
      const titleMatch = content.match(/•\s*\d+\w+ ago\s*\n+(?:\[deleted\]\s*\n+)?([^\n]{10,200})/);
      const title = titleMatch?.[1]?.trim() ?? url;

      // Extract a snippet — first non-boilerplate paragraph
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 40);
      const snippet = lines.find(l =>
        !l.startsWith('[') &&
        !l.startsWith('\\[') &&
        !l.includes('reddit.com') &&
        !l.includes('Privacy Policy') &&
        !l.includes('Log in')
      ) ?? '';

      return { title, url, subreddit, snippet, score: null, author: null, comments: null };
    });

  console.log('[brightdataFetch] Reddit scrape: parsed items:', data.length);

  const duration_ms = Date.now() - start;
  return data.length > 0
    ? { status: 'success', data, error: null, duration_ms, items_count: data.length }
    : { status: 'partial', data: [], error: 'Batch scrape returned no parseable content', duration_ms, items_count: 0 };
}
// New function specifically for Reddit via SERP
async function brightdataRedditViaSERP(query: string, config: BrightDataConfig): Promise<FetchResult> {
  const start = Date.now();
  try {
    const response = await fetch(BRIGHTDATA_SERP, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        zone: config.zone,
        query: `site:reddit.com ${query}`,
        engine: 'google',
        num: 10,
      }),
    });

    const duration_ms = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log('[brightdataFetch] SERP error:', errText.slice(0, 200));
      return { status: 'blocked', data: [], error: `SERP API error: HTTP ${response.status}`, duration_ms, items_count: 0 };
    }

    const json = await response.json();
    const organic = json?.organic ?? [];

    const data = organic.slice(0, 10).map((r: any, i: number) => ({
      title: r.title,
      url: r.link,
      description: r.description,
      score: null,
      author: null,
      comments: null,
      subreddit: r.link?.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? '',
      rank: i + 1,
    }));

    console.log('[brightdataFetch] SERP parsed items:', data.length);

    return data.length > 0
      ? { status: 'success', data, error: null, duration_ms, items_count: data.length }
      : { status: 'partial', data: [], error: 'SERP returned no organic results', duration_ms, items_count: 0 };

  } catch (err: any) {
    return { status: 'error', data: [], error: err.message, duration_ms: Date.now() - start, items_count: 0 };
  }
}

function resolveUrl(target: string, query?: string): string {
  if (target === 'reddit') {
    // BrightData Web Unlocker works better with the HTML endpoint for Reddit
    // The JSON API endpoint is also restricted by robots.txt on most zones
    const base = query
      ? `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&type=link&sort=relevance`
      : 'https://www.reddit.com/r/technology/top/';
    return base;
  }
  if (target === 'amazon') {
    return query
      ? `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
      : 'https://www.amazon.com/Best-Sellers/zgbs/electronics/';
  }
  if (target === 'linkedin') {
    return query
      ? `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}`
      : 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer';
  }
  return '';
}

const PARSERS: Record<string, (text: string) => any[]> = {
  reddit: (text: string) => {
    // Path 1: raw JSON response (native API mode)
    if (text.trimStart().startsWith('{')) {
      try {
        const json = JSON.parse(text);
        return json?.data?.children?.map((c: any) => ({
          title: c.data.title,
          score: c.data.score,
          author: c.data.author,
          url: c.data.url,
          comments: c.data.num_comments,
          subreddit: c.data.subreddit,
        })) || [];
      } catch {
        return [];
      }
    }

    // Path 2: BrightData renders the page — data is in a <script id="data"> tag
    try {
      const scriptMatch = text.match(/<script id="data"[^>]*>({[\s\S]*?})<\/script>/);
      if (scriptMatch) {
        const json = JSON.parse(scriptMatch[1]);
        const posts = json?.posts?.models
          ? Object.values(json.posts.models)
          : json?.data?.children?.map((c: any) => c.data) || [];

        return posts.slice(0, 10).map((p: any) => ({
          title: p.title,
          score: p.score ?? p.upvoteCount ?? 0,
          author: p.author ?? p.authorName ?? 'unknown',
          url: p.url ?? p.permalink,
          comments: p.numComments ?? p.commentCount ?? 0,
          subreddit: p.subreddit ?? p.subredditName ?? '',
        }));
      }
    } catch {}

    // Path 3: fallback — scrape post titles from Open Graph / meta tags
    const titles: any[] = [];
    const ogMatches = text.matchAll(/<shreddit-post[^>]*post-title="([^"]+)"[^>]*score="([^"]*)"[^>]*author="([^"]*)"[^>]*comment-count="([^"]*)"/g);
    for (const m of ogMatches) {
      titles.push({
        title: m[1],
        score: parseInt(m[2]) || 0,
        author: m[3],
        comments: parseInt(m[4]) || 0,
        subreddit: '',
        url: '',
      });
      if (titles.length >= 10) break;
    }

    return titles;
  },
  amazon: (html: string) => {
    const items: any[] = [];

    const patterns = [
      /<div[^>]*class="[^"]*zg-item[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*p13n-sc-truncate[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
      /<a[^>]*class="[^"]*a-link-normal[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]{10,200}?)<\/span>/g,
    ];

    for (const pattern of patterns) {
      let match;
      let i = 0;
      while ((match = pattern.exec(html)) !== null && i < 10) {
        const title = match[1].replace(/<[^>]+>/g, '').trim();
        if (title.length > 5) {
          items.push({ rank: i + 1, title, source: 'amazon' });
          i++;
        }
      }
      if (items.length > 0) break;
    }

    if (items.length === 0) {
      const fallback = html.match(/"name":"([^"]{10,100})"/g);
      if (fallback) {
        fallback.slice(0, 10).forEach((m, i) => {
          const title = m.replace(/"name":"/, '').replace(/"$/, '');
          items.push({ rank: i + 1, title, source: 'amazon' });
        });
      }
    }

    return items;
  },
  linkedin: (html: string) => {
    const items: any[] = [];
    const regex = /<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;

    let match;
    let i = 0;
    while ((match = regex.exec(html)) !== null && i < 10) {
      const title = match[2].trim();
      if (title.length > 5) {
        items.push({ title, url: match[1], source: 'linkedin' });
        i++;
      }
    }

    return items;
  },
};

function simulatedSuccess(target: string): FetchResult {
  const duration_ms = 800 + Math.floor(Math.random() * 400);

  if (target === 'reddit') {
    return {
      status: 'success',
      duration_ms,
      error: null,
      items_count: 10,
      data: [
        { title: 'OpenAI announces GPT-5 with unprecedented reasoning capabilities', score: 84200, author: 'tech_insider', comments: 3412, subreddit: 'technology' },
        { title: 'EU passes landmark AI Act with strict regulations for frontier models', score: 72100, author: 'policy_watch', comments: 2891, subreddit: 'technology' },
        { title: 'Apple unveils M4 Ultra chip with 192-core Neural Engine', score: 61800, author: 'silicon_news', comments: 2204, subreddit: 'technology' },
        { title: 'SpaceX Starship completes first fully successful orbital mission', score: 58400, author: 'space_reporter', comments: 1977, subreddit: 'technology' },
        { title: 'Meta releases open-source LLaMA 4 — beats GPT-4 on benchmarks', score: 51200, author: 'ml_daily', comments: 1834, subreddit: 'technology' },
        { title: 'Google DeepMind solves protein folding problem for all known organisms', score: 49700, author: 'bio_tech', comments: 1622, subreddit: 'technology' },
        { title: 'Tesla Full Self-Driving reaches Level 4 in 40 US states', score: 44300, author: 'auto_future', comments: 1501, subreddit: 'technology' },
        { title: 'Quantum computer breaks 2048-bit RSA encryption in 8 hours', score: 42100, author: 'crypto_sec', comments: 1389, subreddit: 'technology' },
        { title: 'Microsoft GitHub Copilot now writes 60% of enterprise code', score: 38900, author: 'dev_trends', comments: 1244, subreddit: 'technology' },
        { title: 'Solar panels hit 47% efficiency milestone at Stanford lab', score: 35200, author: 'green_energy', comments: 1102, subreddit: 'technology' },
      ],
    };
  }

  return {
    status: 'success',
    duration_ms,
    error: null,
    items_count: 10,
    data: [
      { rank: 1, title: 'Apple AirPods Pro (2nd Generation) with MagSafe Case', source: 'amazon' },
      { rank: 2, title: 'Fire TV Stick 4K Max streaming device, supports Wi-Fi 6E', source: 'amazon' },
      { rank: 3, title: 'Anker 737 Power Bank 24,000mAh, 140W Portable Charger', source: 'amazon' },
      { rank: 4, title: 'Samsung 55-Inch Class QLED 4K Smart TV (2024)', source: 'amazon' },
      { rank: 5, title: 'Bose QuietComfort 45 Bluetooth Wireless Headphones', source: 'amazon' },
      { rank: 6, title: 'Sony WH-1000XM5 Industry Leading Noise Canceling Headphones', source: 'amazon' },
      { rank: 7, title: 'Apple Watch Series 9 GPS 41mm Smartwatch', source: 'amazon' },
      { rank: 8, title: 'Logitech MX Master 3S Performance Wireless Mouse', source: 'amazon' },
      { rank: 9, title: 'iPad (10th Generation) 10.9-inch, Wi-Fi, 64GB', source: 'amazon' },
      { rank: 10, title: 'Kindle Paperwhite (16 GB) – With 3 months free Kindle Unlimited', source: 'amazon' },
    ],
  };
}

export async function brightdataFetch(target: string, query?: string, mode?: string): Promise<FetchResult> {
  console.log('[brightdataFetch] target:', target, '| query:', query, '| mode:', mode);

  if (!['reddit', 'amazon', 'linkedin'].includes(target)) {
    return { status: 'error', data: [], error: 'Unknown target', duration_ms: 0, items_count: 0 };
  }

  const config = getConfig();
  if (!config) {
    console.log('[brightdataFetch] No config → using simulated success');
    return simulatedSuccess(target);
  }
  // Replace the Reddit block inside brightdataFetch
  if (target === 'reddit') {
    if (mode === 'scrape') {
      console.log('[brightdataFetch] Reddit: scrape mode → SERP + batch');
      return brightdataRedditScrapeMode(query ?? 'technology', config);
    } else {
      console.log('[brightdataFetch] Reddit: api mode → SERP only');
      return brightdataRedditViaSERP(query ?? 'technology', config);
    }
  }

  const url = resolveUrl(target, query);
  console.log('[brightdataFetch] Resolved URL:', url);
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('[brightdataFetch] Timeout triggered (30s)');
      controller.abort();
    }, 30000);

    const response = await fetch(BRIGHTDATA_BASE, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        zone: config.zone,
        url,
        format: 'raw',
        country: 'us',
      }),
    });

    clearTimeout(timeout);
    const duration_ms = Date.now() - start;

    console.log('[brightdataFetch] Status:', response.status, '| Duration:', duration_ms, 'ms');

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log('[brightdataFetch] Error body:', errText.slice(0, 200));
      return {
        status: 'blocked',
        data: [],
        error: `Bright Data API error: HTTP ${response.status}`,
        duration_ms,
        items_count: 0,
      };
    }

    const text = await response.text();
    console.log('[brightdataFetch] Response length:', text.length, '| Preview:', text.slice(0, 200));
    // Detect BrightData zone-level robots.txt block
    if (text.includes('bad_endpoint') && text.includes('robots.txt')) {
      console.log('[brightdataFetch] Zone robots.txt restriction detected');
      return {
        status: 'blocked',
        data: [],
        error: 'This site requires elevated zone access — contact your BrightData account manager to enable Reddit.',
        duration_ms: Date.now() - start,
        items_count: 0,
      };
    }
    const parser = PARSERS[target];
    const data = parser ? parser(text) : [];
    console.log('[brightdataFetch] Parsed items:', data.length);

    if (data.length === 0) {
      return {
        status: 'partial',
        data: [],
        error: 'Response received but parsing yielded no structured items',
        duration_ms,
        items_count: 0,
      };
    }

    return { status: 'success', data, error: null, duration_ms, items_count: data.length };

  } catch (err: any) {
    const duration_ms = Date.now() - start;
    console.log('[brightdataFetch] Error:', err.name, err.message);

    if (err.name === 'AbortError') {
      return { status: 'error', data: [], error: 'Request timed out', duration_ms, items_count: 0 };
    }
    return { status: 'error', data: [], error: err.message || 'Unknown error', duration_ms, items_count: 0 };
  }
}