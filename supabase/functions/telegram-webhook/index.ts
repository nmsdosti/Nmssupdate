import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PRICING_MESSAGE = `💰 *SHEIN Monitor Subscription Plans*

📦 *3 Days* - ₹50
📦 *1 Week* - ₹100  
📦 *1 Month* - ₹400

To subscribe:
1️⃣ Scan the QR code below and pay
2️⃣ After payment, send your UTR ID like this:
   \`UTR: 123456789012\`

Your subscription will be activated after verification!`;

const SUBSCRIPTION_EXPIRED_MESSAGE = `⏰ *Your subscription has expired!*

To continue receiving SHEIN Monitor alerts, please renew your subscription.

${PRICING_MESSAGE}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')!;

  // QR code URL - hosted in public folder
  const qrCodeUrl = `${supabaseUrl.replace('.supabase.co', '')}/storage/v1/object/public/assets/payment-qr.jpg`;

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

    // Helper function to send message
    const sendMessage = async (text: string, parseMode = 'Markdown') => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: parseMode,
        }),
      });
    };

    // Helper function to send photo
    const sendPhoto = async (photoUrl: string, caption: string) => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: 'Markdown',
        }),
      });
    };

    // Check subscription status
    const checkSubscription = async (): Promise<{ isActive: boolean; expiresAt: Date | null }> => {
      const { data: subscriber } = await supabase
        .from('telegram_subscribers')
        .select('subscription_expires_at')
        .eq('chat_id', chatId)
        .single();

      if (!subscriber?.subscription_expires_at) {
        return { isActive: false, expiresAt: null };
      }

      const expiresAt = new Date(subscriber.subscription_expires_at);
      const now = new Date();
      return { isActive: expiresAt > now, expiresAt };
    };

    if (text === '/start') {
      // Add subscriber to database (without active subscription)
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

      // Send welcome message with pricing
      const welcomeMsg = `👋 *Welcome to SHEIN Monitor!*

Get instant alerts when SHEIN India stock changes exceed your configured thresholds.

${PRICING_MESSAGE}`;

      await sendMessage(welcomeMsg);
      
      // Send QR code as a separate image
      // Using a placeholder URL - admin should upload QR code to storage
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!;
        // Try to fetch from project's public assets
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: `${projectUrl}/storage/v1/object/public/assets/payment-qr.jpg`,
            caption: '📱 Scan this QR code to pay',
          }),
        });
      } catch (e) {
        console.log('Could not send QR code image:', e);
        await sendMessage('⚠️ Please contact admin for payment QR code.');
      }

      console.log(`New subscriber: ${chatId} (${firstName || username || 'unknown'})`);

    } else if (text === '/stop') {
      // Deactivate subscriber
      const { error } = await supabase
        .from('telegram_subscribers')
        .update({ is_active: false })
        .eq('chat_id', chatId);

      if (error) {
        console.error('Error deactivating subscriber:', error);
      }

      await sendMessage('❌ You have been unsubscribed from SHEIN Monitor alerts.\n\nSend /start to subscribe again.');
      console.log(`Subscriber deactivated: ${chatId}`);

    } else if (text === '/status') {
      const subscription = await checkSubscription();
      
      let statusMessage: string;
      if (subscription.isActive && subscription.expiresAt) {
        const daysLeft = Math.ceil((subscription.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        statusMessage = `✅ *Subscription Active*\n\n📅 Expires: ${subscription.expiresAt.toLocaleDateString()}\n⏳ Days remaining: ${daysLeft}`;
      } else {
        statusMessage = `❌ *No Active Subscription*\n\nSend /start to see subscription plans.`;
      }

      await sendMessage(statusMessage);

    } else if (text.toUpperCase().startsWith('UTR:') || text.toUpperCase().startsWith('UTR ')) {
      // User is submitting UTR ID
      const utrId = text.replace(/^UTR[:\s]*/i, '').trim();

      if (!utrId || utrId.length < 6) {
        await sendMessage('❌ Invalid UTR ID. Please enter a valid UTR ID like:\n`UTR: 123456789012`');
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Ask for plan selection
      await sendMessage(`📝 UTR ID received: \`${utrId}\`\n\nPlease select your plan by sending:\n• \`3days\` for 3 Days (₹50)\n• \`1week\` for 1 Week (₹100)\n• \`1month\` for 1 Month (₹400)`);

      // Store UTR temporarily in messages for plan selection
      await supabase.from('telegram_messages').insert({
        chat_id: chatId,
        username: username,
        first_name: firstName,
        message_text: `UTR: ${utrId}`,
      });

    } else if (['3days', '1week', '1month', '3 days', '1 week', '1 month'].includes(text.toLowerCase().replace(/\s/g, ''))) {
      // User selected a plan - find their pending UTR
      const { data: recentMessages } = await supabase
        .from('telegram_messages')
        .select('message_text')
        .eq('chat_id', chatId)
        .like('message_text', 'UTR:%')
        .order('created_at', { ascending: false })
        .limit(1);

      const utrMatch = recentMessages?.[0]?.message_text?.match(/UTR:\s*(\S+)/i);
      const utrId = utrMatch?.[1];

      if (!utrId) {
        await sendMessage('❌ Please first send your UTR ID like:\n`UTR: 123456789012`');
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const normalizedPlan = text.toLowerCase().replace(/\s/g, '');
      let planType: string;
      let amount: number;

      if (normalizedPlan === '3days') {
        planType = '3_days';
        amount = 50;
      } else if (normalizedPlan === '1week') {
        planType = '1_week';
        amount = 100;
      } else {
        planType = '1_month';
        amount = 400;
      }

      // Create subscription request
      const { error } = await supabase.from('telegram_subscriptions').insert({
        chat_id: chatId,
        username: username,
        first_name: firstName,
        utr_id: utrId,
        plan_type: planType,
        amount: amount,
        status: 'pending',
      });

      if (error) {
        console.error('Error creating subscription request:', error);
        await sendMessage('❌ Error submitting request. Please try again.');
      } else {
        await sendMessage(`✅ *Payment Request Submitted!*\n\n📋 Plan: ${planType.replace('_', ' ')}\n💰 Amount: ₹${amount}\n🔢 UTR: \`${utrId}\`\n\nYour subscription will be activated after verification. This usually takes a few minutes.`);
        console.log(`Subscription request: ${chatId} - ${planType} - UTR: ${utrId}`);
      }

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
