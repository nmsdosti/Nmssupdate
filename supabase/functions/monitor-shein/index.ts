import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CategoryMonitor {
  id: string;
  name: string;
  url: string;
  threshold: number;
  is_active: boolean;
  last_item_count: number | null;
  subtract_from_total: boolean;
}

interface ApiKey {
  id: string;
  api_key: string;
  label: string | null;
  is_active: boolean;
  last_error: string | null;
}

// Convert category page URL to API URL
function convertToApiUrl(pageUrl: string): string {
  const match = pageUrl.match(/\/c\/([a-z0-9-]+)/i) || pageUrl.match(/\/([a-z]+-\d+-\d+)/i);
  if (match) {
    const categoryPath = match[1];
    return `https://www.sheinindia.in/api/category/${categoryPath}?fields=SITE&currentPage=0&pageSize=45&format=json&query=%3Anewest&sort=9&gridColumns=2&includeUnratedProducts=false&advfilter=true&platform=Desktop&displayRatings=true&store=shein`;
  }
  if (pageUrl.includes('/api/category/')) return pageUrl;
  return pageUrl;
}

// Main URLs
const MAIN_PAGE_URL = 'https://www.sheinindia.in/c/sverse-5939-37961';
const MAIN_API_URL = "https://www.sheinindia.in/api/category/sverse-5939-37961?fields=SITE&currentPage=0&pageSize=45&format=json&query=%3Anewest&sort=9&gridColumns=2&includeUnratedProducts=false&advfilter=true&platform=Desktop&displayRatings=true&store=shein";

// Try direct API first (fast, no credits used)
async function fetchFromSheinApiDirect(apiUrl: string): Promise<{ success: boolean; itemCount?: number; error?: string; shouldFallback?: boolean }> {
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.sheinindia.in/sheinverse/c/sverse-5939-37961',
      'Origin': 'https://www.sheinindia.in',
    };

    const urlWithCacheBuster = `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
    const response = await fetch(urlWithCacheBuster, { method: 'GET', headers });

    if (response.status === 403) {
      console.log('⚠️ Direct API returned 403, will fallback to Firecrawl');
      return { success: false, error: 'API blocked (403)', shouldFallback: true };
    }

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}`, shouldFallback: true };
    }

    const data = await response.json();
    const totalResults = data.totalResults || 0;
    console.log(`✅ Direct API success: ${totalResults} items`);
    return { success: true, itemCount: totalResults };
  } catch (error) {
    console.log('⚠️ Direct API error, will fallback:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', shouldFallback: true };
  }
}

// Fallback: Use Firecrawl for HTML scraping
async function scrapeWithFirecrawl(url: string, firecrawlApiKey: string): Promise<{ success: boolean; itemCount?: number; error?: string; isApiKeyError?: boolean }> {
  try {
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${url}${url.includes('?') ? '&' : '?'}_nocache=${Date.now()}`,
        formats: ['html'],
        waitFor: 2000,
        timeout: 15000,
      }),
    });

    const scrapeData = await scrapeResponse.json();
    
    if (!scrapeResponse.ok || !scrapeData.success) {
      const errorMessage = scrapeData.error || `HTTP ${scrapeResponse.status}`;
      const isApiKeyError = errorMessage.toLowerCase().includes('quota') ||
                           errorMessage.toLowerCase().includes('credit') ||
                           errorMessage.toLowerCase().includes('limit') ||
                           errorMessage.toLowerCase().includes('unauthorized') ||
                           errorMessage.toLowerCase().includes('invalid') ||
                           errorMessage.toLowerCase().includes('expired') ||
                           scrapeResponse.status === 401 ||
                           scrapeResponse.status === 402 ||
                           scrapeResponse.status === 403;
      return { success: false, error: errorMessage, isApiKeyError };
    }

    const html = scrapeData.data?.html || '';
    
    const patterns = [
      /aria-label="([\d,]+)\s*Items?\s*Found"/i,
      /<div[^>]*class="[^"]*length[^"]*"[^>]*>.*?<strong>([\d,]+)\s*Items?\s*Found<\/strong>/is,
      /([\d,]+)\s*Items?\s*Found/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const itemCount = parseInt(match[1].replace(/,/g, ''), 10);
        return { success: true, itemCount };
      }
    }

    return { success: false, error: 'Could not extract item count' };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    
    // Get settings
    const { data: settings } = await supabase
      .from('monitor_settings')
      .select('threshold, jump_threshold, is_paused, last_api_key_alert_at, interval_seconds')
      .eq('id', 'default')
      .single();
    
    if (settings?.is_paused) {
      console.log('Monitoring is paused.');
      return new Response(JSON.stringify({ success: true, paused: true, message: 'Monitoring is currently paused' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Interval check
    const intervalSeconds = settings?.interval_seconds ?? 5;
    const { data: lastHistory } = await supabase
      .from('monitor_history')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (lastHistory?.created_at) {
      const lastCheckTime = new Date(lastHistory.created_at);
      const now = new Date();
      const secondsSinceLastCheck = (now.getTime() - lastCheckTime.getTime()) / 1000;
      
      if (secondsSinceLastCheck < intervalSeconds) {
        console.log(`Skipping - ${secondsSinceLastCheck.toFixed(1)}s since last (interval: ${intervalSeconds}s)`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true,
          message: `Waiting for interval (${secondsSinceLastCheck.toFixed(1)}/${intervalSeconds}s)`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    console.log(`⚡ Running monitor (${intervalSeconds}s interval) - Hybrid Mode`);
    
    const threshold = typeof body.threshold === 'number' ? body.threshold : (settings?.threshold ?? 1000);
    const jumpThreshold = settings?.jump_threshold ?? 100;
    console.log('Threshold:', threshold, '| Jump:', jumpThreshold);
    
    // === STEP 1: Try direct API first (free & fast) ===
    console.log('📡 Attempting direct SHEIN API...');
    let mainResult = await fetchFromSheinApiDirect(MAIN_API_URL);
    let usedMethod = 'direct-api';
    
    // === STEP 2: Fallback to Firecrawl if direct API blocked ===
    if (!mainResult.success && mainResult.shouldFallback) {
      console.log('🔄 Falling back to Firecrawl...');
      usedMethod = 'firecrawl';
      
      const { data: apiKeys } = await supabase
        .from('firecrawl_api_keys')
        .select('id, api_key, label, is_active, last_error')
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      
      if (!apiKeys || apiKeys.length === 0) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: 'Direct API blocked and no Firecrawl API keys configured.'
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Try each Firecrawl key
      for (const key of apiKeys as ApiKey[]) {
        console.log(`Trying Firecrawl key: ${key.label || key.id.slice(0, 8)}...`);
        
        const result = await scrapeWithFirecrawl(MAIN_PAGE_URL, key.api_key);
        
        supabase
          .from('firecrawl_api_keys')
          .update({ 
            last_used_at: new Date().toISOString(), 
            last_error: result.success ? null : (result.error || null)
          })
          .eq('id', key.id)
          .then(() => {});
        
        if (result.success) {
          mainResult = { success: true, itemCount: result.itemCount };
          break;
        }
        
        if (result.isApiKeyError) continue;
        
        mainResult = { success: false, error: result.error };
        break;
      }
    }
    
    if (!mainResult.success) {
      console.error('All methods failed:', mainResult.error);
      return new Response(JSON.stringify({ 
        success: false, 
        error: mainResult.error
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItemCount = mainResult.itemCount!;
    console.log(`✅ Count: ${rawItemCount} (via ${usedMethod})`);

    // Get last count for jump detection
    const { data: lastHistoryForJump } = await supabase
      .from('monitor_history')
      .select('item_count')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const lastItemCount = lastHistoryForJump?.item_count ?? null;

    // Check category monitors in parallel
    const { data: categoryMonitors } = await supabase
      .from('category_monitors')
      .select('*')
      .eq('is_active', true);
    
    const categoryAlerts: { name: string; count: number; threshold: number }[] = [];
    let totalSubtraction = 0;
    
    if (categoryMonitors && categoryMonitors.length > 0) {
      console.log(`📁 Checking ${categoryMonitors.length} categories...`);
      
      const categoryPromises = (categoryMonitors as CategoryMonitor[]).map(async (cat) => {
        // Try direct API first for categories too
        const apiUrl = convertToApiUrl(cat.url);
        let result = await fetchFromSheinApiDirect(apiUrl);
        
        // If blocked, this category will be skipped (or you could add Firecrawl fallback here)
        return { cat, result };
      });
      
      const categoryResults = await Promise.all(categoryPromises);
      
      for (const { cat, result } of categoryResults) {
        if (result.success && result.itemCount !== undefined) {
          console.log(`✅ ${cat.name}: ${result.itemCount} items`);
          
          supabase.from('category_monitors').update({ last_item_count: result.itemCount }).eq('id', cat.id).then(() => {});
          
          if (cat.subtract_from_total) {
            totalSubtraction += result.itemCount;
          }
          
          if (!cat.subtract_from_total && result.itemCount >= cat.threshold) {
            categoryAlerts.push({ name: cat.name, count: result.itemCount, threshold: cat.threshold });
          }
        } else {
          console.log(`⚠️ ${cat.name}: fetch failed`);
        }
      }
    }
    
    const itemCount = Math.max(0, rawItemCount - totalSubtraction);
    console.log(`📊 Raw: ${rawItemCount} | Sub: ${totalSubtraction} | Final: ${itemCount}`);
    
    const jumpDetected = lastItemCount !== null && (itemCount - lastItemCount) >= jumpThreshold;

    // Notifications
    let telegramSent = false;
    let telegramError: string | null = null;
    const exceedsThreshold = itemCount > threshold;
    const hasCategoryAlerts = categoryAlerts.length > 0;
    const shouldNotify = exceedsThreshold || jumpDetected || hasCategoryAlerts;

    if (shouldNotify) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      console.log('🔔 Sending notifications...');

      if (botToken) {
        const { data: subscribers } = await supabase
          .from('telegram_subscribers')
          .select('chat_id, first_name')
          .eq('is_active', true);

        if (subscribers && subscribers.length > 0) {
          let messageParts: string[] = ['🚨 SHEIN Monitor Alert!\n'];
          
          if (exceedsThreshold || jumpDetected) {
            if (totalSubtraction > 0) {
              messageParts.push(`📦 Adjusted: ${itemCount.toLocaleString()} items`);
              messageParts.push(`(Raw: ${rawItemCount.toLocaleString()} - ${totalSubtraction.toLocaleString()})`);
            } else {
              messageParts.push(`📦 Stock: ${itemCount.toLocaleString()} items`);
            }
            messageParts.push(`Threshold: ${threshold.toLocaleString()}`);
            if (lastItemCount !== null) messageParts.push(`Previous: ${lastItemCount.toLocaleString()}`);
            
            if (exceedsThreshold && jumpDetected) {
              messageParts.push(`\n⚠️ Exceeded + jumped by +${(itemCount - lastItemCount!).toLocaleString()}!`);
            } else if (exceedsThreshold) {
              messageParts.push(`\n⚠️ Exceeded threshold!`);
            } else if (jumpDetected) {
              messageParts.push(`\n⚠️ Jump: +${(itemCount - lastItemCount!).toLocaleString()} items!`);
            }
          }
          
          if (hasCategoryAlerts) {
            messageParts.push('\n\n📁 Categories:');
            for (const alert of categoryAlerts) {
              messageParts.push(`• ${alert.name}: ${alert.count} (limit: ${alert.threshold})`);
            }
          }
          
          messageParts.push(`\n\n🔗 ${MAIN_PAGE_URL}`);
          messageParts.push(`\n⚡ Mode: ${usedMethod}`);
          
          const message = messageParts.join('\n');
          let successCount = 0;

          for (const sub of subscribers) {
            try {
              const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: sub.chat_id, text: message }),
              });
              if ((await resp.json()).ok) successCount++;
            } catch (e) {
              console.error(`Failed to notify ${sub.chat_id}:`, e);
            }
          }

          telegramSent = successCount > 0;
          console.log(`📤 Sent: ${successCount}/${subscribers.length}`);
        }
      } else {
        telegramError = 'Telegram bot token not configured';
      }
    }

    // Log history
    await supabase.from('monitor_history').insert({
      item_count: itemCount,
      threshold: threshold,
      exceeds_threshold: exceedsThreshold || hasCategoryAlerts,
      telegram_sent: telegramSent,
      telegram_error: telegramError,
    });

    return new Response(JSON.stringify({
      success: true,
      itemCount,
      threshold,
      exceedsThreshold,
      categoryAlerts,
      telegramSent,
      mode: usedMethod,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Monitor error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
