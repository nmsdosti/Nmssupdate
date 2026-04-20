import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MonitoredLink {
  id: string;
  name: string;
  url: string;
  threshold: number;
  is_active: boolean;
  last_item_count: number | null;
}

// Convert any SHEIN page URL into the JSON API endpoint that returns totalResults.
// Supports: /c/<code>, /s/<code>, or already-built /api/category/<code> URLs.
function convertToApiUrl(pageUrl: string): string {
  if (pageUrl.includes('/api/category/')) return pageUrl;

  // Match /c/<code> or /s/<code> (e.g. sverse-5939-37961, footwear-206291)
  const match =
    pageUrl.match(/\/[cs]\/([a-z0-9-]+)/i) ||
    pageUrl.match(/\/([a-z]+-\d+(?:-\d+)?)(?:[/?#]|$)/i);

  if (match) {
    const code = match[1];
    return `https://www.sheinindia.in/api/category/${code}?fields=SITE&currentPage=0&pageSize=45&format=json&query=%3Anewest&sort=9&gridColumns=2&includeUnratedProducts=false&advfilter=true&platform=Desktop&displayRatings=true&store=shein`;
  }
  return pageUrl;
}

async function directFetch(pageUrl: string): Promise<{ success: boolean; itemCount?: number; error?: string; status?: number }> {
  const apiUrl = convertToApiUrl(pageUrl);
  const cacheBusted = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;

  try {
    const response = await fetch(cacheBusted, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': pageUrl,
        'Origin': 'https://www.sheinindia.in',
      },
    });

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, status: response.status };
    }

    const data = await response.json();
    const totalResults = typeof data?.totalResults === 'number' ? data.totalResults : 0;
    return { success: true, itemCount: totalResults };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Firecrawl fallback — scrapes the page and extracts the totalResults / item count.
async function firecrawlFetch(
  pageUrl: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ success: boolean; itemCount?: number; error?: string }> {
  // Load active keys, least-recently-used first, errored keys last
  const { data: keys } = await supabase
    .from('firecrawl_api_keys')
    .select('id, api_key, last_error, last_used_at')
    .eq('is_active', true)
    .order('last_used_at', { ascending: true, nullsFirst: true });

  if (!keys || keys.length === 0) {
    return { success: false, error: 'No Firecrawl API keys configured' };
  }

  // Sort: keys without errors first, errored keys (likely out of credits) last
  const sorted = [...keys].sort((a: any, b: any) => {
    const aErr = a.last_error ? 1 : 0;
    const bErr = b.last_error ? 1 : 0;
    return aErr - bErr;
  });

  const apiUrl = convertToApiUrl(pageUrl);
  let lastError = 'All Firecrawl keys failed';

  for (const key of sorted as any[]) {
    try {
      const resp = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${key.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: apiUrl,
          formats: ['rawHtml'],
          onlyMainContent: false,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data?.success === false) {
        const errMsg = data?.error || `HTTP ${resp.status}`;
        await supabase
          .from('firecrawl_api_keys')
          .update({ last_error: errMsg, last_used_at: new Date().toISOString() })
          .eq('id', key.id);
        lastError = errMsg;
        console.log(`🔑 Firecrawl key failed (${key.id}): ${errMsg}`);
        continue;
      }

      const raw: string = data?.rawHtml || data?.data?.rawHtml || data?.markdown || data?.data?.markdown || '';
      const m = raw.match(/"totalResults"\s*:\s*(\d+)/);
      const itemCount = m ? parseInt(m[1], 10) : 0;

      await supabase
        .from('firecrawl_api_keys')
        .update({ last_error: null, last_used_at: new Date().toISOString() })
        .eq('id', key.id);

      console.log(`🔥 Firecrawl success via key ${key.id}: ${itemCount} items`);
      return { success: true, itemCount };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Unknown error';
      console.log(`🔑 Firecrawl key error (${key.id}): ${lastError}`);
    }
  }

  return { success: false, error: lastError };
}

async function fetchItemCount(
  pageUrl: string,
  supabase: ReturnType<typeof createClient>,
): Promise<{ success: boolean; itemCount?: number; error?: string; via?: string }> {
  const direct = await directFetch(pageUrl);
  if (direct.success) return { ...direct, via: 'direct' };

  // Fall back to Firecrawl on 403/blocked or any non-OK response
  console.log(`⚠️ Direct fetch failed (${direct.error}) — falling back to Firecrawl`);
  const fc = await firecrawlFetch(pageUrl, supabase);
  if (fc.success) return { ...fc, via: 'firecrawl' };

  return { success: false, error: `direct: ${direct.error} | firecrawl: ${fc.error}` };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Get settings
    const { data: settings } = await supabase
      .from('monitor_settings')
      .select('threshold, is_paused, interval_seconds')
      .eq('id', 'default')
      .single();

    if (settings?.is_paused) {
      return new Response(JSON.stringify({ success: true, paused: true, message: 'Monitoring is currently paused' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Interval guard (only enforced for cron-style invocations; manual checks always pass `manual:true`)
    const body = await req.json().catch(() => ({} as any));
    const isManual = body?.manual === true;
    const intervalSeconds = settings?.interval_seconds ?? 5;

    if (!isManual) {
      const { data: lastHistory } = await supabase
        .from('monitor_history')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastHistory?.created_at) {
        const secondsSinceLast = (Date.now() - new Date(lastHistory.created_at).getTime()) / 1000;
        if (secondsSinceLast < intervalSeconds) {
          return new Response(JSON.stringify({
            success: true,
            skipped: true,
            message: `Waiting for interval (${secondsSinceLast.toFixed(1)}/${intervalSeconds}s)`,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    const globalThreshold = settings?.threshold ?? 1;

    // Load all active monitored links
    const { data: links } = await supabase
      .from('category_monitors')
      .select('id, name, url, threshold, is_active, last_item_count')
      .eq('is_active', true);

    if (!links || links.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No links configured. Add a link in the dashboard to start monitoring.',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`📡 Checking ${links.length} link(s)...`);

    // Fetch all in parallel
    const results = await Promise.all(
      (links as MonitoredLink[]).map(async (link) => {
        const r = await fetchItemCount(link.url);
        return { link, ...r };
      })
    );

    const alerts: { name: string; url: string; count: number; threshold: number; previous: number | null }[] = [];
    const linkResults: { id: string; name: string; url: string; itemCount: number | null; threshold: number; error?: string }[] = [];

    for (const r of results) {
      if (r.success && typeof r.itemCount === 'number') {
        const previous = r.link.last_item_count;
        linkResults.push({ id: r.link.id, name: r.link.name, url: r.link.url, itemCount: r.itemCount, threshold: r.link.threshold });

        // Persist last_item_count
        await supabase
          .from('category_monitors')
          .update({ last_item_count: r.itemCount })
          .eq('id', r.link.id);

        if (r.itemCount >= r.link.threshold) {
          alerts.push({
            name: r.link.name,
            url: r.link.url,
            count: r.itemCount,
            threshold: r.link.threshold,
            previous,
          });
        }
        console.log(`✅ ${r.link.name}: ${r.itemCount} items (threshold ${r.link.threshold})`);
      } else {
        linkResults.push({ id: r.link.id, name: r.link.name, url: r.link.url, itemCount: null, threshold: r.link.threshold, error: r.error });
        console.log(`❌ ${r.link.name}: ${r.error}`);
      }
    }

    // Send Telegram if any alerts
    let telegramSent = false;
    let telegramError: string | null = null;

    if (alerts.length > 0) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      if (!botToken) {
        telegramError = 'TELEGRAM_BOT_TOKEN not configured';
      } else {
        const { data: subscribers } = await supabase
          .from('telegram_subscribers')
          .select('chat_id')
          .eq('is_active', true);

        if (subscribers && subscribers.length > 0) {
          const lines = ['🚨 <b>SHEIN Monitor Alert!</b>\n'];
          for (const a of alerts) {
            lines.push(`📦 <b>${a.name}</b>: ${a.count.toLocaleString()} items`);
            lines.push(`   Threshold: ${a.threshold.toLocaleString()}${a.previous !== null ? ` | Previous: ${a.previous.toLocaleString()}` : ''}`);
            lines.push(`   🔗 ${a.url}\n`);
          }
          lines.push(`⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);

          const message = lines.join('\n');
          let successCount = 0;

          for (const sub of subscribers) {
            try {
              const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: sub.chat_id,
                  text: message,
                  parse_mode: 'HTML',
                  disable_web_page_preview: false,
                }),
              });
              if ((await resp.json()).ok) successCount++;
            } catch (e) {
              console.error(`Failed to notify ${sub.chat_id}:`, e);
            }
          }
          telegramSent = successCount > 0;
        }
      }
    }

    // Total/representative count for history table (sum of all link counts)
    const totalCount = linkResults.reduce((sum, l) => sum + (l.itemCount ?? 0), 0);
    const exceedsThreshold = alerts.length > 0;

    await supabase.from('monitor_history').insert({
      item_count: totalCount,
      threshold: globalThreshold,
      exceeds_threshold: exceedsThreshold,
      telegram_sent: telegramSent,
      telegram_error: telegramError,
    });

    return new Response(JSON.stringify({
      success: true,
      itemCount: totalCount,
      threshold: globalThreshold,
      exceedsThreshold,
      alerts,
      links: linkResults,
      telegramSent,
      telegramError,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Monitor error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
