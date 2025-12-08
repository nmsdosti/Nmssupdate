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
    const update = await req.json();
    console.log('Received Telegram update:', JSON.stringify(update));

    const message = update.message;
    if (!message) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chatId = message.chat.id.toString();
    const text = message.text || '';
    const username = message.from?.username || null;
    const firstName = message.from?.first_name || null;

    if (text === '/start') {
      // Add subscriber to database
      const { error } = await supabase
        .from('telegram_subscribers')
        .upsert({
          chat_id: chatId,
          username: username,
          first_name: firstName,
          is_active: true,
          subscribed_at: new Date().toISOString(),
        }, { onConflict: 'chat_id' });

      if (error) {
        console.error('Error saving subscriber:', error);
      }

      // Send welcome message
      const welcomeMessage = `✅ You're now subscribed to SHEIN Monitor alerts!\n\nYou'll receive notifications when the item count exceeds the configured threshold.\n\nCommands:\n/start - Subscribe to alerts\n/stop - Unsubscribe from alerts\n/status - Check your subscription status`;

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeMessage,
        }),
      });

      console.log(`Subscriber added: ${chatId} (${firstName || username || 'unknown'})`);
    } else if (text === '/stop') {
      // Deactivate subscriber
      const { error } = await supabase
        .from('telegram_subscribers')
        .update({ is_active: false })
        .eq('chat_id', chatId);

      if (error) {
        console.error('Error deactivating subscriber:', error);
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '❌ You have been unsubscribed from SHEIN Monitor alerts.\n\nSend /start to subscribe again.',
        }),
      });

      console.log(`Subscriber deactivated: ${chatId}`);
    } else if (text === '/status') {
      // Check subscription status
      const { data: subscriber } = await supabase
        .from('telegram_subscribers')
        .select('is_active, subscribed_at')
        .eq('chat_id', chatId)
        .single();

      let statusMessage: string;
      if (subscriber?.is_active) {
        statusMessage = `✅ You are subscribed to alerts.\n\nSubscribed since: ${new Date(subscriber.subscribed_at).toLocaleString()}`;
      } else {
        statusMessage = '❌ You are not subscribed to alerts.\n\nSend /start to subscribe.';
      }

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: statusMessage,
        }),
      });
    } else if (text && !text.startsWith('/')) {
      // Store regular messages from users
      const { error } = await supabase
        .from('telegram_messages')
        .insert({
          chat_id: chatId,
          username: username,
          first_name: firstName,
          message_text: text,
        });

      if (error) {
        console.error('Error saving message:', error);
      }
      console.log(`Message stored from ${chatId}: ${text}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in telegram-webhook:', error);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
