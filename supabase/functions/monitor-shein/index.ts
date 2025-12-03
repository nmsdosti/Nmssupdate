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
    const body = await req.json().catch(() => ({}));
    const { manualCount } = body;
    
    let itemCount: number;
    
    if (typeof manualCount === 'number') {
      // Use manual input
      itemCount = manualCount;
      console.log('Using manual input:', itemCount);
    } else {
      // Return error - automatic scraping not available
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Automatic scraping is blocked by SHEIN. Please use manual input or connect Firecrawl.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Item count:', itemCount);

    // Check if count exceeds threshold and send Telegram notification
    let telegramSent = false;
    let telegramError: string | null = null;
    const threshold = 1000;

    if (itemCount > threshold) {
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const chatId = Deno.env.get('TELEGRAM_CHAT_ID');

      console.log('Threshold exceeded! Sending Telegram notification...');
      console.log('Bot token exists:', !!botToken);
      console.log('Chat ID exists:', !!chatId);

      if (botToken && chatId) {
        const message = `🚨 SHEIN Monitor Alert!\n\nItem count: ${itemCount.toLocaleString()}\nThreshold: ${threshold.toLocaleString()}\n\nThe item count has exceeded the threshold!\n\n🔗 https://www.sheinindia.in/c/sverse-5939-37961`;

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
