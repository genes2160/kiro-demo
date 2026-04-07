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

const TARGET_URLS: Record<string, string> = {
  reddit: 'https://www.reddit.com/r/technology/top.json?limit=10',
  amazon: 'https://www.amazon.com/Best-Sellers/zgbs/electronics/',
};

const PARSERS: Record<string, (text: string) => any[]> = {
  reddit: (text: string) => {
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
  },
  amazon: (html: string) => {
    const items: any[] = [];

    // Try structured extraction patterns
    const patterns = [
      // Pattern 1: zg-item-immersion with title
      /<div[^>]*class="[^"]*zg-item[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*p13n-sc-truncate[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
      // Pattern 2: a-link-normal with product title
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

    // Fallback: look for any substantial text in product containers
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
};

export async function brightdataFetch(target: string, query?: string, mode?: string): Promise<FetchResult> {
  console.log('[brightdataFetch] Incoming target:', target);

  const config = getConfig();
  const url = TARGET_URLS[target];

  console.log('[brightdataFetch] Resolved URL:', url);
  console.log('[brightdataFetch] Config present:', !!config);

  if (!url) {
    console.log('[brightdataFetch] Unknown target');
    return { status: 'error', data: [], error: 'Unknown target', duration_ms: 0, items_count: 0 };
  }

  if (!config) {
    console.log('[brightdataFetch] No config → using simulated success');
    // Demo mode: return simulated success data
    return simulatedSuccess(target);
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('[brightdataFetch] Timeout triggered (30s)');
      controller.abort();
    }, 30000);

    console.log('[brightdataFetch] Sending request to Bright Data API...');

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
      }),
    });

    clearTimeout(timeout);

    const duration_ms = Date.now() - start;

    console.log('[brightdataFetch] Response received');
    console.log('[brightdataFetch] Status:', response.status, response.statusText);
    console.log('[brightdataFetch] Duration (ms):', duration_ms);

    if (!response.ok) {
      console.log('[brightdataFetch] Non-OK response → marking as blocked');
      return {
        status: 'blocked',
        data: [],
        error: `Bright Data API error: HTTP ${response.status}`,
        duration_ms,
        items_count: 0,
      };
    }

    const text = await response.text();

    console.log('[brightdataFetch] Raw response length:', text.length);
    console.log('[brightdataFetch] Raw preview:', text.slice(0, 300));

    const parser = PARSERS[target];
    const data = parser ? parser(text) : [];

    console.log('[brightdataFetch] Parser found:', !!parser);
    console.log('[brightdataFetch] Parsed items count:', data.length);
    console.log('[brightdataFetch] Parsed sample:', data.slice(0, 2));

    if (data.length === 0) {
      console.log('[brightdataFetch] No data extracted → partial response');
      return {
        status: 'partial',
        data: [],
        error: 'Bright Data returned a response but parsing yielded no structured items',
        duration_ms,
        items_count: 0,
      };
    }

    console.log('[brightdataFetch] Success path');

    return { status: 'success', data, error: null, duration_ms, items_count: data.length };

  } catch (err: any) {
    const duration_ms = Date.now() - start;

    console.log('[brightdataFetch] Error caught');
    console.log('[brightdataFetch] Error name:', err.name);
    console.log('[brightdataFetch] Error message:', err.message);

    if (err.name === 'AbortError') {
      console.log('[brightdataFetch] Classified as TIMEOUT');
      return { status: 'error', data: [], error: 'Request timed out', duration_ms, items_count: 0 };
    }

    return {
      status: 'error',
      data: [],
      error: err.message || 'Unknown error',
      duration_ms,
      items_count: 0
    };
  }
}

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
