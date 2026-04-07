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
    url: 'https://www.reddit.com/r/technology/top.json?limit=10',
    label: 'Reddit r/technology',
    parser: (text: string) => {
      try {
        const json = JSON.parse(text);
        return json?.data?.children?.map((c: any) => ({
          title: c.data.title,
          score: c.data.score,
          author: c.data.author,
          url: c.data.url,
          comments: c.data.num_comments,
        })) || [];
      } catch {
        return [];
      }
    },
  },
  amazon: {
    url: 'https://www.amazon.com/Best-Sellers/zgbs/electronics/',
    label: 'Amazon Best Sellers',
    parser: (html: string) => {
      // Basic extraction attempt from HTML
      const items: any[] = [];
      const titleRegex = /<span class="zg-bdg-text">([^<]+)<\/span>[\s\S]*?<div class="p13n-sc-truncate[^"]*"[^>]*>([^<]+)<\/div>/g;
      let match;
      let i = 0;
      while ((match = titleRegex.exec(html)) !== null && i < 10) {
        items.push({ rank: match[1], title: match[2].trim() });
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

  console.log('[nativeFetch] Incoming query:', query); // NEW
  console.log('[nativeFetch] Mode:', mode); // NEW

  if (query) {
    if (target === 'reddit') {
      // HTML scrape always returns a JS shell (~8KB) with no parseable content.
      // The JSON API works reliably without auth for public search.
      dynamicUrl = query
        ? `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10`
        : `https://www.reddit.com/r/technology/top.json?limit=10`;
      console.log('[nativeFetch] Reddit: always using JSON API endpoint');
    }

    if (target === 'amazon') {
      dynamicUrl = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`; // NEW
      console.log('[nativeFetch] Using Amazon search URL'); // NEW
    }

    if (target === 'linkedin') {
      dynamicUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(query)}`; // NEW
      console.log('[nativeFetch] Using Amazon search URL'); // NEW
    }
  }

  console.log('[nativeFetch] Final URL:', dynamicUrl); // NEW
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
        'Accept': 'application/json, text/html',
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

    return { status: 'success', data, error: null, duration_ms, raw_status, items_count: data.length };

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
        items_count: 0
      };
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
