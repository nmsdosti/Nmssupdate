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

interface ScrapeResult {
  categoryId: string;
  categoryName: string;
  categoryUrl: string;
  productLinks: string[];
  error?: string;
  apiKeyId?: string;
}

// Extract product links from HTML content
function extractProductLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  
  // Pattern 1: Product links in href attributes - SHEIN product URLs
  // Match patterns like /p-, /product/, goods-, -p-
  const hrefPattern = /href=["']([^"']*(?:\/p-|\/product\/|goods-|-p-)[^"']*?)["']/gi;
  let match;
  
  while ((match = hrefPattern.exec(html)) !== null) {
    let url = match[1];
    // Make absolute URL if relative
    if (url.startsWith('/')) {
      try {
        const urlObj = new URL(baseUrl);
        url = `${urlObj.origin}${url}`;
      } catch {
        continue;
      }
    } else if (!url.startsWith('http')) {
      url = `${baseUrl}${url}`;
    }
    // Clean the URL (remove query params for deduplication)
    try {
      const cleanUrl = new URL(url);
      const cleanPath = cleanUrl.origin + cleanUrl.pathname;
      if (!links.includes(cleanPath)) {
        links.push(cleanPath);
      }
    } catch {
      // Skip invalid URLs
    }
  }
  
  // Pattern 2: data-href or data-url attributes
  const dataPattern = /data-(?:href|url|link)=["']([^"']*(?:\/p-|\/product\/|goods-|-p-)[^"']*?)["']/gi;
  while ((match = dataPattern.exec(html)) !== null) {
    let url = match[1];
    if (url.startsWith('/')) {
      try {
        const urlObj = new URL(baseUrl);
        url = `${urlObj.origin}${url}`;
      } catch {
        continue;
      }
    } else if (!url.startsWith('http')) {
      url = `${baseUrl}${url}`;
    }
    try {
      const cleanUrl = new URL(url);
      const cleanPath = cleanUrl.origin + cleanUrl.pathname;
      if (!links.includes(cleanPath)) {
        links.push(cleanPath);
      }
    } catch {
      // Skip invalid URLs
    }
  }
  
  return links;
}

// Scrape a category URL using Firecrawl
async function scrapeCategory(
  category: CategoryMonitor,
  apiKey: ApiKey
): Promise<ScrapeResult> {
  console.log(`Scraping category: ${category.name} with API key: ${apiKey.label || apiKey.id.slice(0, 8)}`);
  
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${category.url}${category.url.includes('?') ? '&' : '?'}_nocache=${Date.now()}`,
        formats: ['html'],
        onlyMainContent: false,
        waitFor: 5000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Firecrawl error for ${category.name}:`, errorText);
      
      const isApiKeyError = response.status === 401 || 
                           response.status === 402 || 
                           response.status === 403 ||
                           response.status === 429;
      
      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryUrl: category.url,
        productLinks: [],
        error: isApiKeyError ? 'API_KEY_ERROR' : `HTTP ${response.status}`,
        apiKeyId: apiKey.id,
      };
    }

    const data = await response.json();
    
    if (!data.success) {
      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryUrl: category.url,
        productLinks: [],
        error: data.error || 'Scrape failed',
        apiKeyId: apiKey.id,
      };
    }
    
    const html = data.data?.html || '';
    
    if (!html) {
      console.log(`No HTML content for ${category.name}`);
      return {
        categoryId: category.id,
        categoryName: category.name,
        categoryUrl: category.url,
        productLinks: [],
        error: 'NO_HTML',
        apiKeyId: apiKey.id,
      };
    }

    const productLinks = extractProductLinks(html, category.url);
    console.log(`Found ${productLinks.length} product links in ${category.name}`);
    
    return {
      categoryId: category.id,
      categoryName: category.name,
      categoryUrl: category.url,
      productLinks,
      apiKeyId: apiKey.id,
    };
  } catch (error) {
    console.error(`Error scraping ${category.name}:`, error);
    return {
      categoryId: category.id,
      categoryName: category.name,
      categoryUrl: category.url,
      productLinks: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      apiKeyId: apiKey.id,
    };
  }
}

// Send Telegram notification for new products
async function sendNewProductsNotification(
  supabase: any,
  botToken: string,
  newProducts: { categoryName: string; url: string }[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: subscribers, error: subError } = await supabase
      .from('telegram_subscribers')
      .select('chat_id, first_name')
      .eq('is_active', true)
      .or('subscription_expires_at.is.null,subscription_expires_at.gt.now()');
    
    if (subError) {
      console.error('Error fetching subscribers:', subError);
      return { success: false, error: subError.message };
    }
    
    if (!subscribers || subscribers.length === 0) {
      console.log('No active subscribers to notify');
      return { success: true };
    }
    
    // Group by category
    const byCategory: Record<string, string[]> = {};
    for (const product of newProducts) {
      if (!byCategory[product.categoryName]) {
        byCategory[product.categoryName] = [];
      }
      byCategory[product.categoryName].push(product.url);
    }
    
    // Build message
    let message = `🆕 *New Products Found!*\n\n`;
    message += `Found ${newProducts.length} new product(s):\n\n`;
    
    for (const [categoryName, urls] of Object.entries(byCategory)) {
      message += `📁 *${categoryName}* (${urls.length} new)\n`;
      // Show first 3 URLs per category to avoid message being too long
      const displayUrls = urls.slice(0, 3);
      for (const url of displayUrls) {
        message += `• ${url}\n`;
      }
      if (urls.length > 3) {
        message += `_...and ${urls.length - 3} more_\n`;
      }
      message += '\n';
    }
    
    message += `⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
    
    // Send to all subscribers
    let successCount = 0;
    for (const subscriber of subscribers) {
      try {
        const telegramResponse = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: subscriber.chat_id,
              text: message,
              parse_mode: 'Markdown',
              disable_web_page_preview: true,
            }),
          }
        );
        
        if (telegramResponse.ok) {
          successCount++;
        } else {
          const errData = await telegramResponse.json();
          console.error(`Failed to send to ${subscriber.chat_id}:`, errData);
        }
      } catch (e) {
        console.error(`Failed to send to ${subscriber.chat_id}:`, e);
      }
    }
    
    console.log(`Sent notifications to ${successCount}/${subscribers.length} subscribers`);
    return { success: successCount > 0 };
  } catch (error) {
    console.error('Error sending Telegram notification:', error);
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
    // Get settings from database
    const { data: settings } = await supabase
      .from('monitor_settings')
      .select('is_paused, interval_seconds, last_api_key_alert_at')
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
    
    // Check if enough time has passed since last check
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
        console.log(`Skipping check - only ${secondsSinceLastCheck.toFixed(1)}s since last check`);
        return new Response(JSON.stringify({ 
          success: true, 
          skipped: true,
          message: `Waiting for interval (${secondsSinceLastCheck.toFixed(1)}/${intervalSeconds}s)`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
    
    console.log(`Running product link monitor...`);

    // Get active categories
    const { data: categories, error: catError } = await supabase
      .from('category_monitors')
      .select('*')
      .eq('is_active', true);

    if (catError) {
      console.error('Error fetching categories:', catError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Failed to fetch categories' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!categories || categories.length === 0) {
      console.log('No active categories to monitor');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No active categories to monitor' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get active API keys
    const { data: apiKeys, error: keyError } = await supabase
      .from('firecrawl_api_keys')
      .select('id, api_key, label, is_active, last_error')
      .eq('is_active', true)
      .order('last_used_at', { ascending: true, nullsFirst: true });

    if (keyError || !apiKeys || apiKeys.length === 0) {
      console.error('No active API keys available');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'No active API keys available' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Monitoring ${categories.length} categories with ${apiKeys.length} API keys (parallel)`);

    // Scrape all categories in parallel, using different API keys for each
    const scrapePromises: Promise<ScrapeResult>[] = [];
    const keyAssignments: { category: string; key: string }[] = [];
    
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i] as CategoryMonitor;
      // Rotate through API keys - each category gets a different key
      const apiKey = apiKeys[i % apiKeys.length] as ApiKey;
      
      keyAssignments.push({
        category: category.name,
        key: apiKey.label || apiKey.id.slice(0, 8),
      });
      
      scrapePromises.push(scrapeCategory(category, apiKey));
    }

    console.log('Key assignments:', keyAssignments);

    // Wait for all scrapes to complete in parallel
    const scrapeResults = await Promise.all(scrapePromises);

    // Update last_used_at for all used API keys
    const usedKeyIds = [...new Set(scrapeResults.map(r => r.apiKeyId).filter(Boolean))];
    for (const keyId of usedKeyIds) {
      await supabase
        .from('firecrawl_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', keyId);
    }

    // Process results and find new products
    const newProducts: { categoryName: string; url: string; categoryId: string }[] = [];
    let totalProducts = 0;
    let totalErrors = 0;
    const categoryStats: { name: string; found: number; new: number; error?: string }[] = [];

    for (const result of scrapeResults) {
      if (result.error) {
        console.error(`Error in ${result.categoryName}: ${result.error}`);
        totalErrors++;
        categoryStats.push({
          name: result.categoryName,
          found: 0,
          new: 0,
          error: result.error,
        });
        
        // Mark API key error if applicable
        if (result.error === 'API_KEY_ERROR' && result.apiKeyId) {
          await supabase
            .from('firecrawl_api_keys')
            .update({ last_error: 'Quota/auth error' })
            .eq('id', result.apiKeyId);
        }
        continue;
      }

      totalProducts += result.productLinks.length;

      // Get existing products for this category
      const { data: existingProducts } = await supabase
        .from('monitored_products')
        .select('product_url')
        .eq('category_id', result.categoryId);

      const existingUrls = new Set(existingProducts?.map((p: any) => p.product_url) || []);
      
      let newCount = 0;
      // Find new products
      for (const url of result.productLinks) {
        if (!existingUrls.has(url)) {
          newProducts.push({
            categoryName: result.categoryName,
            url,
            categoryId: result.categoryId,
          });
          newCount++;
        }
      }
      
      categoryStats.push({
        name: result.categoryName,
        found: result.productLinks.length,
        new: newCount,
      });
      
      console.log(`${result.categoryName}: ${result.productLinks.length} products, ${newCount} new`);
    }

    console.log(`Total: ${totalProducts} products, ${newProducts.length} new, ${totalErrors} errors`);

    // Insert new products into database
    let insertedCount = 0;
    if (newProducts.length > 0) {
      // Insert in batches to avoid timeout
      const batchSize = 100;
      for (let i = 0; i < newProducts.length; i += batchSize) {
        const batch = newProducts.slice(i, i + batchSize);
        const insertData = batch.map(p => ({
          product_url: p.url,
          category_id: p.categoryId,
          notified: false,
        }));

        const { error: insertError, data: inserted } = await supabase
          .from('monitored_products')
          .upsert(insertData, { 
            onConflict: 'product_url',
            ignoreDuplicates: true 
          })
          .select();

        if (insertError) {
          console.error('Error inserting products:', insertError);
        } else {
          insertedCount += inserted?.length || 0;
        }
      }
      
      console.log(`Inserted ${insertedCount} new products`);

      // Send Telegram notification for new products
      const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      if (botToken && newProducts.length > 0) {
        const notifyResult = await sendNewProductsNotification(
          supabase,
          botToken,
          newProducts.map(p => ({ categoryName: p.categoryName, url: p.url }))
        );

        if (notifyResult.success) {
          // Mark products as notified
          const urls = newProducts.map(p => p.url);
          for (let i = 0; i < urls.length; i += 100) {
            const batch = urls.slice(i, i + 100);
            await supabase
              .from('monitored_products')
              .update({ notified: true })
              .in('product_url', batch);
          }
        }

        // Log to history
        await supabase
          .from('monitor_history')
          .insert({
            item_count: newProducts.length,
            threshold: 0,
            exceeds_threshold: newProducts.length > 0,
            telegram_sent: notifyResult.success,
            telegram_error: notifyResult.error || null,
          });
      }
    } else {
      // Log check even if no new products
      await supabase
        .from('monitor_history')
        .insert({
          item_count: 0,
          threshold: 0,
          exceeds_threshold: false,
          telegram_sent: false,
          telegram_error: null,
        });
    }

    return new Response(JSON.stringify({
      success: true,
      categoriesMonitored: categories.length,
      totalProductsFound: totalProducts,
      newProductsFound: newProducts.length,
      productsInserted: insertedCount,
      errors: totalErrors,
      categoryStats,
      sampleNewProducts: newProducts.slice(0, 5).map(p => ({
        category: p.categoryName,
        url: p.url,
      })),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
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
