import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const targetUrl = 'https://www.sheinindia.in/c/sverse-5939-37961';
    
    console.log('Fetching page:', targetUrl);
    
    // Fetch the page
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    console.log('Page fetched, length:', html.length);

    // Extract item count using regex
    const patterns = [
      /aria-label="([\d,]+)\s*Items?\s*Found"/i,
      /<div[^>]*class="[^"]*length[^"]*"[^>]*>.*?<strong>([\d,]+)\s*Items?\s*Found<\/strong>/i,
      /([\d,]+)\s*Items?\s*Found/i,
    ];

    let itemCount: number | null = null;
    let rawMatch: string | null = null;

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        rawMatch = match[1];
        itemCount = parseInt(match[1].replace(/,/g, ''), 10);
        console.log('Found match with pattern:', pattern.toString(), 'Value:', rawMatch);
        break;
      }
    }

    if (itemCount === null) {
      console.log('Could not find item count in HTML');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Could not extract item count from page',
        htmlPreview: html.substring(0, 1000)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Extracted item count:', itemCount);

    // Check if count exceeds threshold and send Telegram notification
    let telegramSent = false;
    let telegramError: string | null = null;
    const threshold = 1000;

    if (itemCount > threshold) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

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
                parse_mode: 'HTML',
              }),
            }
          );

          const telegramResult = await telegramResponse.json();
          console.log('Telegram response:', telegramResult);
          
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
      exceedsThreshold: itemCount > threshold,
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
