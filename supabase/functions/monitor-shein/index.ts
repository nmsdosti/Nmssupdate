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
}

async function scrapeItemCount(url: string, firecrawlApiKey: string): Promise<{ success: boolean; itemCount?: number; error?: string }> {
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
        waitFor: 5000,
      }),
    });

    const scrapeData = await scrapeResponse.json();
    
    if (!scrapeResponse.ok || !scrapeData.success) {
      return { success: false, error: scrapeData.error || 'Scrape failed' };
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
    
    // Get settings from database
    const { data: settings } = await supabase
      .from('monitor_settings')
      .select('threshold, jump_threshold, firecrawl_api_key')
      .eq('id', 'default')
      .single();
    
    const threshold = typeof body.threshold === 'number' ? body.threshold : (settings?.threshold ?? 1000);
    const jumpThreshold = settings?.jump_threshold ?? 100;
    console.log('Loaded threshold from database:', threshold);
    console.log('Jump threshold:', jumpThreshold);
    
    const targetUrl = 'https://www.sheinindia.in/c/sverse-5939-37961';
    const firecrawlApiKey = settings?.firecrawl_api_key || Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Firecrawl API key not configured. Please add it in Settings.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Scraping with Firecrawl:', targetUrl);
    console.log('Using threshold:', threshold);

    // Scrape main URL
    const mainResult = await scrapeItemCount(targetUrl, firecrawlApiKey);
    
    if (!mainResult.success) {
      console.error('Main scrape failed:', mainResult.error);
      
      // Check for API key errors
      const errorMessage = mainResult.error || '';
      const isApiKeyError = errorMessage.toLowerCase().includes('quota') ||
                           errorMessage.toLowerCase().includes('credit') ||
                           errorMessage.toLowerCase().includes('limit') ||
                           errorMessage.toLowerCase().includes('unauthorized') ||
                           errorMessage.toLowerCase().includes('invalid') ||
                           errorMessage.toLowerCase().includes('expired') ||
                           errorMessage.toLowerCase().includes('401') ||
                           errorMessage.toLowerCase().includes('402') ||
                           errorMessage.toLowerCase().includes('403');
      
      if (isApiKeyError) {
        const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
        if (botToken) {
          const { data: subscribers } = await supabase
            .from('telegram_subscribers')
            .select('chat_id, first_name')
            .eq('is_active', true);
          
          if (subscribers && subscribers.length > 0) {
            const alertMessage = `⚠️ Firecrawl API Error!\n\nYour Firecrawl API key may have run out of credits or is invalid.\n\nError: ${errorMessage}\n\nPlease update your API key in the Settings.`;
            
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
          }
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

    const itemCount = mainResult.itemCount!;
    console.log('Found main count:', itemCount);

    // Get last item count from history for jump detection
    const { data: lastHistory } = await supabase
      .from('monitor_history')
      .select('item_count')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    const lastItemCount = lastHistory?.item_count ?? null;
    const jumpDetected = lastItemCount !== null && (itemCount - lastItemCount) >= jumpThreshold;
    
    console.log('Last item count:', lastItemCount, 'Current:', itemCount, 'Jump detected:', jumpDetected);

    // Check category monitors
    const { data: categoryMonitors } = await supabase
      .from('category_monitors')
      .select('*')
      .eq('is_active', true);
    
    const categoryAlerts: { name: string; count: number; threshold: number }[] = [];
    
    if (categoryMonitors && categoryMonitors.length > 0) {
      console.log(`Checking ${categoryMonitors.length} category monitors...`);
      
      for (const cat of categoryMonitors as CategoryMonitor[]) {
        console.log(`Checking category: ${cat.name} (${cat.url})`);
        const catResult = await scrapeItemCount(cat.url, firecrawlApiKey);
        
        if (catResult.success && catResult.itemCount !== undefined) {
          console.log(`Category ${cat.name}: ${catResult.itemCount} items (threshold: ${cat.threshold})`);
          
          // Update last_item_count
          await supabase
            .from('category_monitors')
            .update({ last_item_count: catResult.itemCount })
            .eq('id', cat.id);
          
          // Check if exceeds threshold
          if (catResult.itemCount >= cat.threshold) {
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
            messageParts.push(`📦 Total Stock: ${itemCount.toLocaleString()} items`);
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