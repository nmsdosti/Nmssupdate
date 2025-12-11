import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_CHAT_ID = '801475049';

const PRICING_MESSAGE = `💰 *SHEIN Monitor Subscription Plans*

📦 *3 Days* - ₹50
📦 *1 Week* - ₹100  
📦 *1 Month* - ₹400

To subscribe:
1️⃣ Scan the QR code below and pay
2️⃣ After payment, send your UTR ID like this:
   \`UTR: 123456789012\`
3️⃣ Then select your plan

Your subscription will be activated after verification!`;

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

    // Helper function to send message
    const sendMessage = async (targetChatId: string, text: string, parseMode = 'Markdown') => {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: text,
          parse_mode: parseMode,
        }),
      });
    };

    // Helper to send message to current user
    const sendUserMessage = async (text: string) => {
      await sendMessage(chatId, text);
    };

    // Helper to notify admin
    const notifyAdmin = async (text: string) => {
      await sendMessage(ADMIN_CHAT_ID, text);
    };

    // Check subscription status
    const checkSubscription = async (): Promise<{ isActive: boolean; expiresAt: Date | null; status: string }> => {
      const { data: subscriber } = await supabase
        .from('telegram_subscribers')
        .select('subscription_expires_at, is_active')
        .eq('chat_id', chatId)
        .single();

      if (!subscriber) {
        return { isActive: false, expiresAt: null, status: 'not_registered' };
      }

      if (!subscriber.subscription_expires_at) {
        return { isActive: false, expiresAt: null, status: 'hold' };
      }

      const expiresAt = new Date(subscriber.subscription_expires_at);
      const now = new Date();
      
      if (expiresAt > now) {
        return { isActive: true, expiresAt, status: 'active' };
      } else {
        // Subscription expired - update to hold status
        await supabase
          .from('telegram_subscribers')
          .update({ is_active: false })
          .eq('chat_id', chatId);
        return { isActive: false, expiresAt, status: 'expired' };
      }
    };

    if (text === '/start') {
      // Just show welcome message with pricing - DON'T register
      const welcomeMsg = `👋 *Welcome to SHEIN Monitor!*

Get instant alerts when SHEIN India stock changes exceed your configured thresholds.

${PRICING_MESSAGE}`;

      await sendUserMessage(welcomeMsg);
      
      // Send QR code
      try {
        const projectUrl = Deno.env.get('SUPABASE_URL')!;
        await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            photo: `${projectUrl}/storage/v1/object/public/assets/sheinnms%20qr.jpg`,
            caption: '📱 Scan this QR code to pay',
          }),
        });
      } catch (e) {
        console.log('Could not send QR code image:', e);
        await sendUserMessage('⚠️ Please contact admin for payment QR code.');
      }

      console.log(`Welcome message sent to: ${chatId} (${firstName || username || 'unknown'})`);

    } else if (text === '/stop') {
      // Deactivate subscriber
      const { error } = await supabase
        .from('telegram_subscribers')
        .update({ is_active: false })
        .eq('chat_id', chatId);

      if (error) {
        console.error('Error deactivating subscriber:', error);
      }

      await sendUserMessage('❌ You have been unsubscribed from SHEIN Monitor alerts.\n\nSend /start to subscribe again.');
      console.log(`Subscriber deactivated: ${chatId}`);

    } else if (text === '/status') {
      const subscription = await checkSubscription();
      
      let statusMessage: string;
      if (subscription.status === 'not_registered') {
        statusMessage = `❌ *Not Registered*\n\nYou haven't subscribed yet. Send /start to see subscription plans.`;
      } else if (subscription.status === 'hold') {
        statusMessage = `⏸️ *Subscription On Hold*\n\nYour subscription is pending activation. If you've made payment, please wait for verification.`;
      } else if (subscription.status === 'active' && subscription.expiresAt) {
        const daysLeft = Math.ceil((subscription.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        statusMessage = `✅ *Subscription Active*\n\n📅 Expires: ${subscription.expiresAt.toLocaleDateString()}\n⏳ Days remaining: ${daysLeft}`;
      } else {
        statusMessage = `⏰ *Subscription Expired*\n\nYour subscription has expired. Send /start to renew.`;
      }

      await sendUserMessage(statusMessage);

    } else if (text.toUpperCase().startsWith('UTR:') || text.toUpperCase().startsWith('UTR ')) {
      // User is submitting UTR ID
      const utrId = text.replace(/^UTR[:\s]*/i, '').trim();

      if (!utrId || utrId.length < 6) {
        await sendUserMessage('❌ Invalid UTR ID. Please enter a valid UTR ID like:\n`UTR: 123456789012`');
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Register user as subscriber with hold status (is_active = false)
      const { error: subscriberError } = await supabase
        .from('telegram_subscribers')
        .upsert({
          chat_id: chatId,
          username: username,
          first_name: firstName,
          is_active: false, // Hold status
          subscribed_at: new Date().toISOString(),
        }, { onConflict: 'chat_id' });

      if (subscriberError) {
        console.error('Error registering subscriber:', subscriberError);
      }

      // Store UTR in messages for plan selection
      await supabase.from('telegram_messages').insert({
        chat_id: chatId,
        username: username,
        first_name: firstName,
        message_text: `UTR: ${utrId}`,
      });

      // Ask for plan selection
      await sendUserMessage(`📝 UTR ID received: \`${utrId}\`\n\nPlease select your plan by sending:\n1️⃣ for 3 Days (₹50)\n2️⃣ for 1 Week (₹100)\n3️⃣ for 1 Month (₹400)`);

      console.log(`UTR received from ${chatId} (${firstName || username}): ${utrId}`);

    } else if (['1', '2', '3', '3days', '1week', '1month', '3 days', '1 week', '1 month'].includes(text.toLowerCase().replace(/\s/g, ''))) {
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
        await sendUserMessage('❌ Please first send your UTR ID like:\n`UTR: 123456789012`');
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const normalizedPlan = text.toLowerCase().replace(/\s/g, '');
      let planType: string;
      let amount: number;
      let planDisplay: string;

      if (normalizedPlan === '1' || normalizedPlan === '3days') {
        planType = '3_days';
        amount = 50;
        planDisplay = '3 Days';
      } else if (normalizedPlan === '2' || normalizedPlan === '1week') {
        planType = '1_week';
        amount = 100;
        planDisplay = '1 Week';
      } else {
        planType = '1_month';
        amount = 400;
        planDisplay = '1 Month';
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
        await sendUserMessage('❌ Error submitting request. Please try again.');
      } else {
        await sendUserMessage(`✅ *Payment Request Submitted!*\n\n📋 Plan: ${planDisplay}\n💰 Amount: ₹${amount}\n🔢 UTR: \`${utrId}\`\n\nYour subscription will be activated after verification. This usually takes a few minutes.`);
        
        // Notify admin about new subscription request
        const adminNotification = `🔔 *New Subscription Request!*\n\n👤 User: ${firstName || 'Unknown'} (@${username || 'no username'})\n🆔 Chat ID: \`${chatId}\`\n📋 Plan: ${planDisplay}\n💰 Amount: ₹${amount}\n🔢 UTR: \`${utrId}\`\n\nPlease verify payment and activate subscription in /telegram panel.`;
        await notifyAdmin(adminNotification);
        
        console.log(`Subscription request: ${chatId} - ${planType} - UTR: ${utrId} - Admin notified`);
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
