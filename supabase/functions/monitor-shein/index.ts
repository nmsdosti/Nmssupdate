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


async function scrapeItemCount(url: string, _unused?: string): Promise<{ success: boolean; itemCount?: number; error?: string; isApiKeyError?: boolean }> {
  const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
  
  if (!rapidApiKey) {
    return { success: false, error: 'RAPIDAPI_KEY not configured', isApiKeyError: true };
  }
  
  try {
    // Add cache-busting parameter
    const scrapedUrl = `${url}${url.includes('?') ? '&' : '?'}_nocache=${Date.now()}`;
    
    const formData = new URLSearchParams();
    formData.append('url', scrapedUrl);
    formData.append('render_js', 'true');
    formData.append('wait_for_selector', '.she-length-in-header');
    
    const scrapeResponse = await fetch('https://ai-web-scraper.p.rapidapi.com/extract_content/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-rapidapi-host': 'ai-web-scraper.p.rapidapi.com',
        'x-rapidapi-key': rapidApiKey,
      },
      body: formData.toString(),
    });

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text();
      const isApiKeyError = scrapeResponse.status === 401 || 
                           scrapeResponse.status === 403 ||
                           scrapeResponse.status === 429;
      return { success: false, error: `HTTP ${scrapeResponse.status}: ${errorText}`, isApiKeyError };
    }

    const scrapeData = await scrapeResponse.json();
    
    // RapidAPI returns content in different format - check for html/text content
    const html = scrapeData.html || scrapeData.content || scrapeData.text || JSON.stringify(scrapeData);
    
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

    return { success: false, error: 'Could not extract item count from response' };
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
    
    // Get settings from database
    const { data: settings } = await supabase
      .from('monitor_settings')
      .select('threshold, jump_threshold, is_paused, last_api_key_alert_at, interval_seconds')
      .eq('id', 'default')
      .single();
    
    // Check if monitoring is paused
    if (settings?.is_paused) {
      console.log('Monitoring is paused. Skipping check.');
      return new Response(JSON.stringify({ 
        success: true, 
        paused: true,
        message: 'Monitoring is currently paused'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check if enough time has passed since last check (interval logic in seconds)
    const intervalSeconds = settings?.interval_seconds ?? 30;
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
        console.log(`Skipping check - only ${secondsSinceLastCheck.toFixed(1)}s since last check (interval: ${intervalSeconds}s)`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true,
          message: `Waiting for interval (${secondsSinceLastCheck.toFixed(1)}/${intervalSeconds}s)`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    console.log(`Interval check passed (${intervalSeconds}s). Running monitor...`);
    
    const threshold = typeof body.threshold === 'number' ? body.threshold : (settings?.threshold ?? 1000);
    const jumpThreshold = settings?.jump_threshold ?? 100;
    const lastApiKeyAlertAt = settings?.last_api_key_alert_at ? new Date(settings.last_api_key_alert_at) : null;
    console.log('Loaded threshold from database:', threshold);
    console.log('Jump threshold:', jumpThreshold);
    
    // Check if RapidAPI key is configured
    const rapidApiKey = Deno.env.get('RAPIDAPI_KEY');
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'RapidAPI key not configured. Please add RAPIDAPI_KEY in secrets.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log('RapidAPI key configured');
    
    const targetUrl = 'https://www.sheinindia.in/c/sverse-5939-37961';

    console.log('Scraping with RapidAPI:', targetUrl);
    console.log('Using threshold:', threshold);

    // Scrape main URL with RapidAPI
    const mainResult = await scrapeItemCount(targetUrl);
    
    if (!mainResult.success) {
      console.error('Main scrape failed:', mainResult.error);
      
      // If API key error, send notification (rate limited to once per hour)
      if (mainResult.isApiKeyError) {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const shouldSendAlert = !lastApiKeyAlertAt || lastApiKeyAlertAt < oneHourAgo;
        
        if (shouldSendAlert) {
          console.log('Sending API key error notification (rate limit: once per hour)');
          const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
          if (botToken) {
            const { data: subscribers } = await supabase
              .from('telegram_subscribers')
              .select('chat_id, first_name')
              .eq('is_active', true);
            
            if (subscribers && subscribers.length > 0) {
              const alertMessage = `⚠️ RapidAPI Scraper Error!\n\n${mainResult.error}\n\nPlease check your RapidAPI key or subscription.\n\n(This alert is sent once per hour)`;
              
              for (const sub of subscribers) {
                try {
                  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: sub.chat_id, text: alertMessage }),
                  });
                } catch (e) {
                  console.error(`Failed to notify ${sub.chat_id}:`, e);
                }
              }
              
              // Update last alert time
              await supabase
                .from('monitor_settings')
                .update({ last_api_key_alert_at: now.toISOString() })
                .eq('id', 'default');
            }
          }
        } else {
          console.log('Skipping API key alert - already sent within the last hour');
        }
      }
      
      return new Response(JSON.stringify({ 
        success: false, 
        error: mainResult.error
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawItemCount = mainResult.itemCount!;
    console.log('Found main count:', rawItemCount);

    // Get last item count from history for jump detection
    const { data: lastHistoryForJump } = await supabase
      .from('monitor_history')
      .select('item_count')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const lastItemCount = lastHistoryForJump?.item_count ?? null;

    // Check category monitors
    const { data: categoryMonitors } = await supabase
      .from('category_monitors')
      .select('*')
      .eq('is_active', true);
    
    const categoryAlerts: { name: string; count: number; threshold: number }[] = [];
    const subtractedCategories: { name: string; count: number }[] = [];
    let totalSubtraction = 0;
    
    if (categoryMonitors && categoryMonitors.length > 0) {
      console.log(`Checking ${categoryMonitors.length} category monitors...`);
      
      for (const cat of categoryMonitors as CategoryMonitor[]) {
        console.log(`Checking category: ${cat.name} (${cat.url})`);
        
        // Scrape category with RapidAPI
        const catResult = await scrapeItemCount(cat.url);
        
        if (catResult.success && catResult.itemCount !== undefined) {
          console.log(`Category ${cat.name}: ${catResult.itemCount} items (threshold: ${cat.threshold})`);
          
          // Update last_item_count
          await supabase
            .from('category_monitors')
            .update({ last_item_count: catResult.itemCount })
            .eq('id', cat.id);
          
          // If marked for subtraction, add to total subtraction
          if (cat.subtract_from_total) {
            totalSubtraction += catResult.itemCount;
            subtractedCategories.push({ name: cat.name, count: catResult.itemCount });
            console.log(`Subtracting ${cat.name}: ${catResult.itemCount} from total`);
          }
          
          // Check if exceeds threshold (only for non-subtracted categories)
          if (!cat.subtract_from_total && catResult.itemCount >= cat.threshold) {
            categoryAlerts.push({
              name: cat.name,
              count: catResult.itemCount,
              threshold: cat.threshold,
            });
          }
        } else {
          console.log(`Failed to scrape category ${cat.name}:`, catResult.error);
        }
      }
    }
    
    // Calculate adjusted item count
    const itemCount = Math.max(0, rawItemCount - totalSubtraction);
    console.log(`Raw count: ${rawItemCount}, Subtraction: ${totalSubtraction}, Adjusted count: ${itemCount}`);
    
    const jumpDetected = lastItemCount !== null && (itemCount - lastItemCount) >= jumpThreshold;
    console.log('Last item count:', lastItemCount, 'Current:', itemCount, 'Jump detected:', jumpDetected);

    // Determine if we should send notifications
    let telegramSent = false;
    let telegramError: string | null = null;
    const exceedsThreshold = itemCount > threshold;
    const hasCategoryAlerts = categoryAlerts.length > 0;
    const shouldNotify = exceedsThreshold || jumpDetected || hasCategoryAlerts;

    if (shouldNotify) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');

      console.log('Sending Telegram notifications...');

      if (botToken) {
        const { data: subscribers, error: subError } = await supabase
          .from('telegram_subscribers')
          .select('chat_id, first_name')
          .eq('is_active', true);

        if (subError) {
          console.error('Error fetching subscribers:', subError);
          telegramError = 'Failed to fetch subscribers';
        } else if (!subscribers || subscribers.length === 0) {
          console.log('No active subscribers found');
          telegramError = 'No active subscribers';
        } else {
          console.log(`Sending to ${subscribers.length} subscribers`);
          
          // Build message
          let messageParts: string[] = ['🚨 SHEIN Monitor Alert!\n'];
          
          // Main threshold alerts
          if (exceedsThreshold || jumpDetected) {
            if (totalSubtraction > 0) {
              messageParts.push(`📦 Adjusted Stock: ${itemCount.toLocaleString()} items`);
              messageParts.push(`(Raw: ${rawItemCount.toLocaleString()} - ${totalSubtraction.toLocaleString()} excluded)`);
            } else {
              messageParts.push(`📦 Total Stock: ${itemCount.toLocaleString()} items`);
            }
            messageParts.push(`Threshold: ${threshold.toLocaleString()}`);
            if (lastItemCount !== null) {
              messageParts.push(`Previous: ${lastItemCount.toLocaleString()}`);
            }
            
            if (exceedsThreshold && jumpDetected) {
              messageParts.push(`\n⚠️ Exceeded threshold AND jumped by +${(itemCount - lastItemCount!).toLocaleString()}!`);
            } else if (exceedsThreshold) {
              messageParts.push(`\n⚠️ Item count exceeded threshold!`);
            } else if (jumpDetected) {
              messageParts.push(`\n⚠️ Sudden jump: +${(itemCount - lastItemCount!).toLocaleString()} items!`);
            }
          }
          
          // Category alerts
          if (hasCategoryAlerts) {
            messageParts.push('\n\n📁 Category Alerts:');
            for (const alert of categoryAlerts) {
              messageParts.push(`• ${alert.name}: ${alert.count} items (limit: ${alert.threshold})`);
            }
          }
          
          messageParts.push(`\n\n🔗 ${targetUrl}`);
          
          const message = messageParts.join('\n');

          let successCount = 0;
          const errors: string[] = [];

          for (const sub of subscribers) {
            try {
              const telegramResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: sub.chat_id,
                    text: message,
                  }),
                }
              );

              const telegramResult = await telegramResponse.json();
              if (telegramResult.ok) {
                successCount++;
                console.log(`Sent to ${sub.chat_id} (${sub.first_name || 'unknown'})`);
              } else {
                errors.push(`${sub.chat_id}: ${telegramResult.description}`);
              }
            } catch (e: unknown) {
              errors.push(`${sub.chat_id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
            }
          }

          telegramSent = successCount > 0;
          if (errors.length > 0) {
            telegramError = `Sent to ${successCount}/${subscribers.length}. Errors: ${errors.join('; ')}`;
          }
          console.log(`Notifications sent: ${successCount}/${subscribers.length}`);
        }
      } else {
        telegramError = 'Telegram bot token not configured';
      }
    }

    // Log to history table
    const { error: historyError } = await supabase
      .from('monitor_history')
      .insert({
        item_count: itemCount,
        threshold: threshold,
        exceeds_threshold: exceedsThreshold || hasCategoryAlerts,
        telegram_sent: telegramSent,
        telegram_error: telegramError,
      });

    if (historyError) {
      console.error('Failed to log history:', historyError);
    }

    return new Response(JSON.stringify({
      success: true,
      itemCount,
      threshold,
      exceedsThreshold,
      categoryAlerts,
      telegramSent,
      telegramError,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in monitor-shein function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});