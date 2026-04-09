export interface FetchResult {
  status: 'success' | 'blocked' | 'partial' | 'error';
  data: any[];
  error: string | null;
  duration_ms: number;
  raw_status?: number;
  items_count: number;
}

const TARGETS: Record<string, { url: string; label: string; parser: (html: string) => any[] }> = {
  reddit: {
    // IMPORTANT:
    // Keep native Reddit on HTML, not JSON API.
    // This makes the comparison fairer against Bright Data.
    url: 'https://www.reddit.com/search/?q=technology&type=link',
    label: 'Reddit Search HTML',
    parser: (text: string) => {
      const items: any[] = [];

      // Native HTML on Reddit is intentionally brittle.
      // We do NOT want the native side to use the JSON API anymore.
      // We only try a few shallow HTML patterns.

      // Path 1: shredder/shreddit attributes
      const postMatches = text.matchAll(
        /<shreddit-post[^>]*post-title="([^"]+)"[^>]*permalink="([^"]+)"[^>]*score="([^"]*)"[^>]*author="([^"]*)"[^>]*comment-count="([^"]*)"/g
      );

      for (const m of postMatches) {
        items.push({
          title: m[1],
          url: m[2]?.startsWith('http') ? m[2] : `https://www.reddit.com${m[2]}`,
          score: parseInt(m[3]) || 0,
          author: m[4] || null,
          comments: parseInt(m[5]) || 0,
          subreddit: null,
        });
        if (items.length >= 10) break;
      }

      if (items.length > 0) return items;

      // Path 2: fallback anchor scrape
      const anchorMatches = text.matchAll(
        /<a[^>]+href="(\/r\/[^"]+\/comments\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      );

      for (const m of anchorMatches) {
        const cleanTitle = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (cleanTitle.length < 12) continue;

        items.push({
          title: cleanTitle,
          url: `https://www.reddit.com${m[1]}`,
          score: null,
          author: null,
          comments: null,
          subreddit: m[1].match(/^\/r\/([^/]+)/)?.[1] ?? null,
        });

        if (items.length >= 10) break;
      }

      return items;
    },
  },

  amazon: {
    url: 'https://www.amazon.com/Best-Sellers/zgbs/electronics/',
    label: 'Amazon Best Sellers',
    parser: (html: string) => {
      // Keep native basic and brittle.
      // This is realistic for raw HTML scraping without an unlocker.
      const items: any[] = [];

      const titleRegex = /<span class="zg-bdg-text">([^<]+)<\/span>[\s\S]*?<div class="p13n-sc-truncate[^"]*"[^>]*>([^<]+)<\/div>/g;
      let match;
      let i = 0;

      while ((match = titleRegex.exec(html)) !== null && i < 10) {
        items.push({
          rank: match[1],
          title: match[2].trim(),
          source: 'amazon',
        });
        i++;
      }

      return items;
    },
  },

  linkedin: {
    url: 'https://www.linkedin.com/jobs/search/?keywords=software%20engineer',
    label: 'LinkedIn Jobs',
    parser: (html: string) => {
      const items: any[] = [];

      const regex = /<a[^>]*class="[^"]*base-card__full-link[^"]*"[^>]*href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/g;

      let match;
      let i = 0;

      while ((match = regex.exec(html)) !== null && i < 10) {
        items.push({
          title: match[2].trim(),
          url: match[1],
          source: 'linkedin',
        });
        i++;
      }

      return items;
    },
  },
};

export async function nativeFetch(target: string, query?: string, mode?: string): Promise<FetchResult> {
  console.log('[nativeFetch] Incoming target:', target);

  const t = TARGETS[target];
  if (!t) {
    console.log('[nativeFetch] Unknown target');
    return { status: 'error', data: [], error: 'Unknown target', duration_ms: 0, items_count: 0 };
  }

  // NEW: Dynamic URL override using query + mode
  let dynamicUrl = t.url;

  console.log('[nativeFetch] Incoming query:', query);
  console.log('[nativeFetch] Mode:', mode);

  if (query) {
    if (target === 'reddit') {
      // IMPORTANT:
      // Stop using Reddit JSON here.
      // Native Reddit should remain an HTML scrape so the comparison is fair.
      dynamicUrl = `https://www.reddit.com/search/?q=${encodeURIComponent(query)}&type=link&sort=relevance`;
      console.log('[nativeFetch] Reddit: using HTML search endpoint only');
    }

    if (target === 'amazon') {
      dynamicUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
      console.log('[nativeFetch] Using Amazon search URL');
    }

    if (target === 'linkedin') {
      dynamicUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}`;
      console.log('[nativeFetch] Using LinkedIn jobs search URL');
    }
  }

  console.log('[nativeFetch] Final URL:', dynamicUrl);
  console.log('[nativeFetch] Target config:', t.label, t.url);

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('[nativeFetch] Timeout triggered (10s)');
      controller.abort();
    }, 10000);

    console.log('[nativeFetch] Sending request...');

    const response = await fetch(dynamicUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; demo-bot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeout);

    const duration_ms = Date.now() - start;
    const raw_status = response.status;

    console.log('[nativeFetch] Response received');
    console.log('[nativeFetch] Status:', raw_status, response.statusText);
    console.log('[nativeFetch] Duration (ms):', duration_ms);

    if (!response.ok) {
      console.log('[nativeFetch] Non-OK response → marking as blocked');
      return {
        status: 'blocked',
        data: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
        duration_ms,
        raw_status,
        items_count: 0,
      };
    }

    const text = await response.text();

    console.log('[nativeFetch] Raw response length:', text.length);
    console.log('[nativeFetch] Raw preview:', text.slice(0, 300));

    const data = t.parser(text);

    console.log('[nativeFetch] Parsed items count:', data.length);
    console.log('[nativeFetch] Parsed sample:', data.slice(0, 2));

    if (data.length === 0) {
      console.log('[nativeFetch] No data extracted → partial response');
      return {
        status: 'partial',
        data: [],
        error: 'Response received but no structured data could be extracted (bot protection likely active)',
        duration_ms,
        raw_status,
        items_count: 0,
      };
    }

    console.log('[nativeFetch] Success path');

    return {
      status: 'success',
      data,
      error: null,
      duration_ms,
      raw_status,
      items_count: data.length,
    };
  } catch (err: any) {
    const duration_ms = Date.now() - start;

    console.log('[nativeFetch] Error caught');
    console.log('[nativeFetch] Error name:', err.name);
    console.log('[nativeFetch] Error message:', err.message);

    if (err.name === 'AbortError') {
      console.log('[nativeFetch] Classified as BLOCKED due to timeout');
      return {
        status: 'blocked',
        data: [],
        error: 'Request timed out (10s) — likely blocked',
        duration_ms,
        items_count: 0,
      };
    }

    return {
      status: 'error',
      data: [],
      error: err.message || 'Unknown error',
      duration_ms,
      items_count: 0,
    };
  }
}