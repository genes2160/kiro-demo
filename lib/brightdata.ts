import type { FetchResult } from './native';

const BRIGHTDATA_BASE = 'https://api.brightdata.com/request';
const BRIGHTDATA_SERP = 'https://api.brightdata.com/serp/google/search';

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
  reddit: 'https://www.reddit.com/search/?q=technology&type=link',
  amazon: 'https://www.amazon.com/Best-Sellers/zgbs/electronics/',
  linkedin: 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer',
};

function resolveUrl(target: string, query?: string): string {
  if (target === 'reddit') {
    // Bright Data should hit Reddit HTML, not JSON.
    const base = query
      ? `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&type=link&sort=relevance`
      : 'https://www.reddit.com/search/?q=technology&type=link&sort=relevance';
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
    const items: any[] = [];

    // Path 1: raw JSON response, if Bright Data ever returns it
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
        // continue to HTML paths
      }
    }

    // Path 2: embedded script JSON
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
          url: p.url?.startsWith('http') ? p.url : `https://www.reddit.com${p.permalink ?? ''}`,
          comments: p.numComments ?? p.commentCount ?? 0,
          subreddit: p.subreddit ?? p.subredditName ?? '',
        }));
      }
    } catch {}

    // Path 3: shreddit component attributes
    const ogMatches = text.matchAll(
      /<shreddit-post[^>]*post-title="([^"]+)"[^>]*permalink="([^"]+)"[^>]*score="([^"]*)"[^>]*author="([^"]*)"[^>]*comment-count="([^"]*)"/g
    );

    for (const m of ogMatches) {
      items.push({
        title: m[1],
        url: m[2]?.startsWith('http') ? m[2] : `https://www.reddit.com${m[2]}`,
        score: parseInt(m[3]) || 0,
        author: m[4] || null,
        comments: parseInt(m[5]) || 0,
        subreddit: m[2].match(/\/r\/([^/]+)/)?.[1] ?? '',
      });
      if (items.length >= 10) break;
    }

    return items;
  },

  amazon: (html: string) => {
    const items: any[] = [];

    // Stronger parser for Bright Data side
    const patterns = [
      /data-asin="([^"]+)"[\s\S]*?<h2[\s\S]*?<span>([^<]{10,250})<\/span>/g,
      /<div[^>]*data-asin="([^"]+)"[\s\S]*?<span[^>]*class="a-size-base-plus a-color-base a-text-normal"[^>]*>([^<]{10,250})<\/span>/g,
      /<div[^>]*class="[^"]*zg-item[^"]*"[^>]*>[\s\S]*?<span[^>]*class="[^"]*p13n-sc-truncate[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
      /<a[^>]*class="[^"]*a-link-normal[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]{10,200}?)<\/span>/g,
    ];

    for (const pattern of patterns) {
      let match;
      let i = 0;

      while ((match = pattern.exec(html)) !== null && i < 10) {
        const titleRaw = match[2] || match[1];
        const title = titleRaw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

        if (title.length > 5) {
          items.push({
            rank: i + 1,
            title,
            asin: match[1] && match[2] ? match[1] : undefined,
            source: 'amazon',
          });
          i++;
        }
      }

      if (items.length > 0) break;
    }

    return items;
  },

  linkedin: (html: string) => {
    const items: any[] = [];

    const regexes = [
      /<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g,
      /<a[^>]*href="([^"]*\/jobs\/view\/[^"]+)"[^>]*>[\s\S]*?<span[^>]*aria-hidden="true"[^>]*>([^<]+)<\/span>/g,
    ];

    for (const regex of regexes) {
      let match;
      let i = 0;

      while ((match = regex.exec(html)) !== null && i < 10) {
        const title = match[2].trim();
        if (title.length > 5) {
          items.push({
            title,
            url: match[1],
            source: 'linkedin',
          });
          i++;
        }
      }

      if (items.length > 0) break;
    }

    return items;
  },
};

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    console.log(`[brightdataFetch] Timeout triggered (${timeoutMs}ms) for ${label}`);
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  label: string,
  retries = 2,
  timeoutMs = 15000
): Promise<Response> {
  let lastErr: any = null;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      console.log(`[brightdataFetch] ${label}: attempt ${attempt}/${retries + 1}`);
      return await fetchWithTimeout(url, options, timeoutMs, label);
    } catch (err: any) {
      lastErr = err;
      console.log(`[brightdataFetch] ${label}: attempt ${attempt} failed ->`, err?.message || err);

      if (attempt <= retries) {
        console.log(`[brightdataFetch] ${label}: retrying...`);
      }
    }
  }

  throw lastErr;
}

async function brightdataRedditViaSERP(query: string, config: BrightDataConfig): Promise<FetchResult> {
  const start = Date.now();

  try {
    console.log('[brightdataFetch] Reddit: SERP via Web Unlocker');

    const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(
      `site:reddit.com/r ${query}`
    )}&num=10`;

    console.log('[brightdataFetch] Google URL:', googleUrl);

    const response = await fetchWithRetry(
      BRIGHTDATA_BASE,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.token}`,
        },
        body: JSON.stringify({
          zone: config.zone,
          url: googleUrl,
          format: 'raw',
          country: 'us',
        }),
      },
      'reddit-google-unlocker',
      2,
      15000
    );

    const duration_ms = Date.now() - start;

    console.log('[brightdataFetch] Status:', response.status);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.log('[brightdataFetch] Google SERP error:', errText.slice(0, 200));
      return {
        status: 'blocked',
        data: [],
        error: `Google SERP failed: HTTP ${response.status}`,
        duration_ms,
        items_count: 0,
      };
    }

    const html = await response.text();

    console.log('[brightdataFetch] SERP length:', html.length);

    const items: any[] = [];

    // Try multiple Google result patterns.
    // Keep this intentionally tolerant because SERP markup shifts often.

    const patterns = [
      /<a[^>]+href="\/url\?q=(https:\/\/www\.reddit\.com\/r\/[^"&]+)[^"]*"[\s\S]*?<h3[^>]*>(.*?)<\/h3>/g,
      /<a[^>]+href="(https:\/\/www\.reddit\.com\/r\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>(.*?)<\/h3>/g,
      /<a[^>]+href="\/url\?q=(https:\/\/www\.reddit\.com\/r\/[^"&]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g,
    ];

    for (const pattern of patterns) {
      let match;
      let i = 0;

      while ((match = pattern.exec(html)) !== null && i < 10) {
        const rawUrl = match[1];
        const rawTitle = match[2];

        const url = decodeURIComponent(rawUrl);
        const title = rawTitle
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();

        if (!url.includes('reddit.com/r/')) continue;
        if (title.length < 8) continue;

        const exists = items.some((x) => x.url === url);
        if (exists) continue;

        items.push({
          title,
          url,
          subreddit: url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? '',
          rank: items.length + 1,
          score: null,
          author: null,
          comments: null,
          source: 'reddit',
        });

        i++;
      }

      if (items.length > 0) break;
    }
    
    if (items.length === 0) {
      const urlOnlyMatches = html.matchAll(/https:\/\/www\.reddit\.com\/r\/[^"&<\s]+/g);

      for (const m of urlOnlyMatches) {
        const url = decodeURIComponent(m[0]);
        if (items.some((x) => x.url === url)) continue;

        items.push({
          title: url,
          url,
          subreddit: url.match(/reddit\.com\/r\/([^/]+)/)?.[1] ?? '',
          rank: items.length + 1,
          score: null,
          author: null,
          comments: null,
          source: 'reddit',
        });

        if (items.length >= 5) break;
      }
    }
    console.log('[brightdataFetch] Parsed Reddit SERP items:', items.length);
    console.log('[brightdataFetch] Sample:', items.slice(0, 2));
    console.log('[brightdataFetch] Reddit SERP preview:', html.slice(0, 1200));

    return items.length > 0
      ? {
          status: 'success',
          data: items,
          error: null,
          duration_ms,
          items_count: items.length,
        }
      : {
          status: 'partial',
          data: [],
          error: 'No Reddit links found in SERP',
          duration_ms,
          items_count: 0,
        };

  } catch (err: any) {
    console.log('[brightdataFetch] Reddit SERP exception:', err?.message);
    return {
      status: 'error',
      data: [],
      error: err.message || 'Unknown error',
      duration_ms: Date.now() - start,
      items_count: 0,
    };
  }
}

export async function brightdataFetch(target: string, query?: string, mode?: string): Promise<FetchResult> {
  console.log('[brightdataFetch] target:', target, '| query:', query, '| mode:', mode);

  if (!['reddit', 'amazon', 'linkedin'].includes(target)) {
    return { status: 'error', data: [], error: 'Unknown target', duration_ms: 0, items_count: 0 };
  }

  const config = getConfig();
  if (!config) {
    console.log('[brightdataFetch] Missing Bright Data config');
    return {
      status: 'error',
      data: [],
      error: 'Missing Bright Data config',
      duration_ms: 0,
      items_count: 0,
    };
  }

  // Reddit: use SERP-based route.
  // This avoids the current timeout-heavy SERP+batch path and removes fake success.
  if (target === 'reddit') {
    console.log('[brightdataFetch] Reddit: using SERP route');
    return brightdataRedditViaSERP(query ?? 'technology', config);
  }

  const url = resolveUrl(target, query);
  console.log('[brightdataFetch] Resolved URL:', url);

  const start = Date.now();

  try {
    const response = await fetchWithRetry(
      BRIGHTDATA_BASE,
      {
        method: 'POST',
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
      },
      `${target}-unlocker`,
      2,
      15000
    );

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

    // Detect zone-level robots or policy issues
    if (text.includes('bad_endpoint') && text.includes('robots.txt')) {
      console.log('[brightdataFetch] Zone robots.txt restriction detected');
      return {
        status: 'blocked',
        data: [],
        error: 'Zone restriction detected for this target',
        duration_ms,
        items_count: 0,
      };
    }

    const parser = PARSERS[target];
    const data = parser ? parser(text) : [];

    console.log('[brightdataFetch] Parsed items:', data.length);
    console.log('[brightdataFetch] Parsed sample:', data.slice(0, 2));

    if (data.length === 0) {
      return {
        status: 'partial',
        data: [],
        error: 'Response received but parsing yielded no structured items',
        duration_ms,
        items_count: 0,
      };
    }

    console.log('[brightdataFetch] Success path');

    return {
      status: 'success',
      data,
      error: null,
      duration_ms,
      items_count: data.length,
    };
  } catch (err: any) {
    const duration_ms = Date.now() - start;

    console.log('[brightdataFetch] Error:', err?.name, err?.message);

    if (err?.name === 'AbortError') {
      return {
        status: 'blocked',
        data: [],
        error: 'Bright Data request timed out',
        duration_ms,
        items_count: 0,
      };
    }

    return {
      status: 'error',
      data: [],
      error: err?.message || 'Unknown error',
      duration_ms,
      items_count: 0,
    };
  }
}