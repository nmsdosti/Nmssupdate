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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

  try {
    const { message, chatIds } = await req.json();

    if (!message) {
      return new Response(JSON.stringify({ success: false, error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let targetChatIds: string[] = [];

    if (chatIds && chatIds.length > 0) {
      // Send to specific chat IDs
      targetChatIds = chatIds;
    } else {
      // Send to all active subscribers
      const { data: subscribers } = await supabase
        .from('telegram_subscribers')
        .select('chat_id')
        .eq('is_active', true);

      if (subscribers) {
        targetChatIds = subscribers.map(s => s.chat_id);
      }
    }

    let successCount = 0;
    let failCount = 0;

    for (const chatId of targetChatIds) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          console.error(`Failed to send to ${chatId}:`, await response.text());
        }
      } catch (e) {
        failCount++;
        console.error(`Error sending to ${chatId}:`, e);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      sent: successCount, 
      failed: failCount,
      total: targetChatIds.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in telegram-broadcast:', error);
    return new Response(JSON.stringify({ success: false, error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
