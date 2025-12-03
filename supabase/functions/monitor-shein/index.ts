import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    
    // Get threshold from database if not provided in request
    let threshold = typeof body.threshold === 'number' ? body.threshold : null;
    
    if (threshold === null) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: settings } = await supabase
        .from('monitor_settings')
        .select('threshold')
        .eq('id', 'default')
        .single();
      
      threshold = settings?.threshold ?? 1000;
      console.log('Loaded threshold from database:', threshold);
    }
    
    const targetUrl = 'https://www.sheinindia.in/c/sverse-5939-37961';
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Firecrawl API key not configured'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Scraping with Firecrawl:', targetUrl);
    console.log('Using threshold:', threshold);
    
    // Use Firecrawl to scrape the page
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['html'],
        waitFor: 3000,
      }),
    });

    const scrapeData = await scrapeResponse.json();
    console.log('Firecrawl response status:', scrapeResponse.status);
    
    if (!scrapeResponse.ok || !scrapeData.success) {
      console.error('Firecrawl error:', JSON.stringify(scrapeData));
      return new Response(JSON.stringify({ 
        success: false, 
        error: scrapeData.error || 'Failed to scrape page'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = scrapeData.data?.html || '';
    console.log('HTML length:', html.length);

    // Extract item count using regex
    const patterns = [
      /aria-label="([\d,]+)\s*Items?\s*Found"/i,
      /<div[^>]*class="[^"]*length[^"]*"[^>]*>.*?<strong>([\d,]+)\s*Items?\s*Found<\/strong>/is,
      /([\d,]+)\s*Items?\s*Found/i,
    ];

    let itemCount: number | null = null;
    let rawMatch: string | null = null;

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        rawMatch = match[1];
        itemCount = parseInt(match[1].replace(/,/g, ''), 10);
        console.log('Found match:', rawMatch, '-> Count:', itemCount);
        break;
      }
    }

    if (itemCount === null) {
      console.log('Could not find item count in HTML');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Could not extract item count from page',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if count exceeds threshold and send Telegram notification
    let telegramSent = false;
    let telegramError: string | null = null;
    const exceedsThreshold = itemCount > threshold;

    if (exceedsThreshold) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

      console.log('Threshold exceeded! Sending Telegram notification...');

      if (botToken && chatId) {
        const message = `🚨 SHEIN Monitor Alert!\n\nItem count: ${itemCount.toLocaleString()}\nThreshold: ${threshold.toLocaleString()}\n\nThe item count has exceeded the threshold!\n\n🔗 ${targetUrl}`;

        try {
          const telegramResponse = await fetch(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: message,
              }),
            }
          );

          const telegramResult = await telegramResponse.json();
          console.log('Telegram response:', JSON.stringify(telegramResult));
          
          if (telegramResult.ok) {
            telegramSent = true;
          } else {
            telegramError = telegramResult.description || 'Failed to send';
          }
        } catch (e: unknown) {
          console.error('Telegram error:', e);
          telegramError = e instanceof Error ? e.message : 'Unknown error';
        }
      } else {
        telegramError = 'Telegram credentials not configured';
      }
    }

    return new Response(JSON.stringify({
      success: true,
      itemCount,
      rawMatch,
      threshold,
      exceedsThreshold,
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
