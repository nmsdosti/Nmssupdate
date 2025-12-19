import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Bell, BellOff, TrendingUp, Clock, ExternalLink, Settings, Timer, Plus, Trash2, Layers, Minus, Pause, Play, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

const ADMIN_PASSWORD = "9898054041";
const SESSION_KEY = "monitor_admin_session";

interface MonitorResult {
  success: boolean;
  itemCount?: number;
  threshold?: number;
  exceedsThreshold?: boolean;
  telegramSent?: boolean;
  telegramError?: string | null;
  timestamp?: string;
  error?: string;
}

interface HistoryItem {
  id: string;
  item_count: number;
  threshold: number;
  exceeds_threshold: boolean;
  telegram_sent: boolean;
  telegram_error: string | null;
  created_at: string;
}

interface CategoryMonitor {
  id: string;
  name: string;
  url: string;
  threshold: number;
  is_active: boolean;
  last_item_count: number | null;
  subtract_from_total: boolean;
}

interface FirecrawlApiKey {
  id: string;
  api_key: string;
  label: string | null;
  is_active: boolean;
  last_error: string | null;
  last_used_at: string | null;
}

const Index = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MonitorResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [threshold, setThreshold] = useState(1000);
  const [thresholdInput, setThresholdInput] = useState("1000");
  const [jumpThreshold, setJumpThreshold] = useState(100);
  const [jumpThresholdInput, setJumpThresholdInput] = useState("100");
  const [intervalMinutes, setIntervalMinutes] = useState(30);
  const [intervalInput, setIntervalInput] = useState("30");
  const [isPaused, setIsPaused] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<FirecrawlApiKey[]>([]);
  const [newApiKey, setNewApiKey] = useState("");
  const [newApiKeyLabel, setNewApiKeyLabel] = useState("");
  const [isAddingApiKey, setIsAddingApiKey] = useState(false);
  const [showApiKeys, setShowApiKeys] = useState(false);
  
  // Category monitors state
  const [categories, setCategories] = useState<CategoryMonitor[]>([]);
  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryUrl, setNewCategoryUrl] = useState("");
  const [newCategoryThreshold, setNewCategoryThreshold] = useState("1");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  
  const { toast } = useToast();

  // Check for saved session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      if (rememberMe) {
        localStorage.setItem(SESSION_KEY, "authenticated");
      }
      toast({ title: "Access granted" });
    } else {
      toast({ title: "Invalid password", variant: "destructive" });
    }
  };


  // Load data when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const loadData = async () => {
      // Load threshold
      const { data: settings } = await supabase
        .from('monitor_settings')
        .select('threshold, jump_threshold, interval_seconds, is_paused')
        .eq('id', 'default')
        .single();
      
      if (settings) {
        setThreshold(settings.threshold);
        setThresholdInput(settings.threshold.toString());
        setJumpThreshold(settings.jump_threshold);
        setJumpThresholdInput(settings.jump_threshold.toString());
        setIntervalMinutes(settings.interval_seconds);
        setIntervalInput(settings.interval_seconds.toString());
        setIsPaused(settings.is_paused ?? false);
      }

      // Load API keys
      const { data: keysData } = await supabase
        .from('firecrawl_api_keys')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (keysData) {
        setApiKeys(keysData);
      }

      // Load history
      const { data: historyData } = await supabase
        .from('monitor_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (historyData) {
        setHistory(historyData);
        // Set latest result if available
        if (historyData.length > 0) {
          const latest = historyData[0];
          setResult({
            success: true,
            itemCount: latest.item_count,
            threshold: latest.threshold,
            exceedsThreshold: latest.exceeds_threshold,
            telegramSent: latest.telegram_sent,
            telegramError: latest.telegram_error,
            timestamp: latest.created_at,
          });
        }
      }

      // Load category monitors
      const { data: categoryData } = await supabase
        .from('category_monitors')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (categoryData) {
        setCategories(categoryData);
      }
    };
    loadData();
  }, [isAuthenticated]);

  const checkMonitor = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-shein", {
        body: { threshold }
      });
      
      if (error) throw error;
      
      setResult(data);
      
      // Reload history from database
      const { data: historyData } = await supabase
        .from('monitor_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (historyData) {
        setHistory(historyData);
      }
      
      if (data.success) {
        toast({
          title: data.exceedsThreshold ? "Alert Triggered!" : "Check Complete",
          description: `Found ${data.itemCount?.toLocaleString()} items`,
          variant: data.exceedsThreshold ? "destructive" : "default",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to check",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      console.error("Monitor error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to check monitor",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const updateThreshold = async () => {
    const newThreshold = parseInt(thresholdInput.replace(/,/g, ""), 10);
    if (isNaN(newThreshold) || newThreshold < 0) {
      toast({
        title: "Invalid Threshold",
        description: "Please enter a valid positive number",
        variant: "destructive",
      });
      return;
    }
    
    setIsSavingThreshold(true);
    const { error } = await supabase
      .from('monitor_settings')
      .update({ threshold: newThreshold })
      .eq('id', 'default');
    
    setIsSavingThreshold(false);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to save threshold",
        variant: "destructive",
      });
      return;
    }
    
    setThreshold(newThreshold);
    setShowSettings(false);
    toast({
      title: "Threshold Updated",
      description: `Alert will trigger when items exceed ${newThreshold.toLocaleString()}`,
    });
  };

  // Bulk API keys state
  const [bulkApiKeys, setBulkApiKeys] = useState<string[]>(["", "", "", "", ""]);

  const addApiKey = async () => {
    const key = newApiKey.trim();
    if (!key) {
      toast({
        title: "Invalid API Key",
        description: "Please enter a valid Firecrawl API key",
        variant: "destructive",
      });
      return;
    }
    
    if (apiKeys.length >= 50) {
      toast({
        title: "Limit Reached",
        description: "Maximum 50 API keys allowed",
        variant: "destructive",
      });
      return;
    }
    
    setIsAddingApiKey(true);
    const { error } = await supabase
      .from('firecrawl_api_keys')
      .insert({
        api_key: key,
        label: newApiKeyLabel.trim() || null,
      });
    
    setIsAddingApiKey(false);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to add API key",
        variant: "destructive",
      });
      return;
    }
    
    // Reload API keys
    const { data } = await supabase
      .from('firecrawl_api_keys')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (data) {
      setApiKeys(data);
    }
    
    setNewApiKey("");
    setNewApiKeyLabel("");
    toast({
      title: "API Key Added",
      description: "New Firecrawl API key has been saved",
    });
  };

  const addBulkApiKeys = async () => {
    const validKeys = bulkApiKeys.filter(k => k.trim().length > 0);
    if (validKeys.length === 0) {
      toast({
        title: "No Keys",
        description: "Please enter at least one API key",
        variant: "destructive",
      });
      return;
    }
    
    if (apiKeys.length + validKeys.length > 50) {
      toast({
        title: "Limit Exceeded",
        description: `Can only add ${50 - apiKeys.length} more keys (max 50)`,
        variant: "destructive",
      });
      return;
    }
    
    setIsAddingApiKey(true);
    const keysToInsert = validKeys.map((key, index) => ({
      api_key: key.trim(),
      label: `Bulk ${apiKeys.length + index + 1}`,
    }));

    const { error } = await supabase
      .from('firecrawl_api_keys')
      .insert(keysToInsert);
    
    setIsAddingApiKey(false);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to add API keys",
        variant: "destructive",
      });
      return;
    }
    
    // Reload API keys
    const { data } = await supabase
      .from('firecrawl_api_keys')
      .select('*')
      .order('created_at', { ascending: true });
    
    if (data) {
      setApiKeys(data);
    }
    
    setBulkApiKeys(["", "", "", "", ""]);
    toast({
      title: "API Keys Added",
      description: `${validKeys.length} Firecrawl API key(s) added`,
    });
  };

  // Google Sheets sync
  const [sheetUrl, setSheetUrl] = useState("https://docs.google.com/spreadsheets/d/1e1O0wneRwUwsjvaHuCklRGh4aJm4oCnZuzeRO-2gqBw/export?format=csv");
  const [isSyncing, setIsSyncing] = useState(false);

  const syncFromGoogleSheets = async () => {
    if (!sheetUrl.trim()) {
      toast({
        title: "Missing URL",
        description: "Please enter a Google Sheets CSV URL",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    try {
      const response = await fetch(sheetUrl);
      if (!response.ok) {
        throw new Error("Failed to fetch sheet. Make sure it's published to web as CSV.");
      }
      
      const csvText = await response.text();
      const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      // Extract API keys (first column, skip header if it looks like one)
      const keys: string[] = [];
      for (const line of lines) {
        const firstCol = line.split(',')[0].trim().replace(/^"|"$/g, '');
        // Skip if it looks like a header or empty
        if (firstCol && firstCol.toLowerCase() !== 'api_key' && firstCol.toLowerCase() !== 'key' && firstCol.startsWith('fc-')) {
          keys.push(firstCol);
        }
      }

      if (keys.length === 0) {
        toast({
          title: "No Keys Found",
          description: "No valid API keys (starting with fc-) found in the sheet",
          variant: "destructive",
        });
        setIsSyncing(false);
        return;
      }

      // Get existing keys to avoid duplicates
      const existingKeys = new Set(apiKeys.map(k => k.api_key));
      const newKeys = keys.filter(k => !existingKeys.has(k));

      if (newKeys.length === 0) {
        toast({
          title: "No New Keys",
          description: "All keys from the sheet already exist",
        });
        setIsSyncing(false);
        return;
      }

      // Insert new keys
      const keysToInsert = newKeys.map((key, index) => ({
        api_key: key,
        label: `Sheet ${apiKeys.length + index + 1}`,
      }));

      const { error } = await supabase
        .from('firecrawl_api_keys')
        .insert(keysToInsert);

      if (error) throw error;

      // Reload API keys
      const { data } = await supabase
        .from('firecrawl_api_keys')
        .select('*')
        .order('created_at', { ascending: true });

      if (data) {
        setApiKeys(data);
      }

      toast({
        title: "Sync Complete",
        description: `Added ${newKeys.length} new API keys from Google Sheets`,
      });
    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync from Google Sheets",
        variant: "destructive",
      });
    }
    setIsSyncing(false);
  };

  // Login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900/50 border-slate-800/50 backdrop-blur-sm">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-white text-xl">SHEIN Monitor</CardTitle>
            <CardDescription className="text-slate-400">Enter password to access the dashboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
            />
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember" 
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer">
                Remember me
              </Label>
            </div>
            <Button onClick={handleLogin} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white">
              Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-950/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">SHEIN Monitor</h1>
              <p className="text-xs text-slate-400">Real-time inventory tracking</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPaused && (
              <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10">
                <Pause className="w-3 h-3 mr-1" />
                Paused
              </Badge>
            )}
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
              <Timer className="w-3 h-3 mr-1" />
              Auto: {intervalMinutes}s
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Settings className="w-4 h-4 mr-2" />
              {threshold.toLocaleString()}
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Auto-check Info */}
        <Card className="bg-cyan-500/10 border-cyan-500/20 mb-6">
          <CardContent className="py-3">
            <div className="flex items-center justify-center gap-2 text-cyan-400 text-sm">
              <Timer className="w-4 h-4" />
              <span>Auto-checking every {intervalMinutes} second{intervalMinutes > 1 ? 's' : ''}. Alerts when items exceed {threshold.toLocaleString()} or jump by {jumpThreshold.toLocaleString()}+.</span>
            </div>
          </CardContent>
        </Card>

        {/* Settings Panel */}
        {showSettings && (
          <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Pause/Resume Monitoring */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                  <div>
                    <Label className="text-slate-300 text-sm block">
                      Monitoring Status
                    </Label>
                    <p className="text-xs text-slate-500 mt-1">
                      {isPaused ? "Monitoring is paused. Auto-checks will not run." : "Monitoring is active. Auto-checks running every " + intervalMinutes + "s."}
                    </p>
                  </div>
                  <Button
                    onClick={async () => {
                      setIsTogglingPause(true);
                      const { error } = await supabase
                        .from('monitor_settings')
                        .update({ is_paused: !isPaused })
                        .eq('id', 'default');
                      
                      setIsTogglingPause(false);
                      
                      if (error) {
                        toast({
                          title: "Error",
                          description: "Failed to update monitoring status",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      setIsPaused(!isPaused);
                      toast({
                        title: isPaused ? "Monitoring Resumed" : "Monitoring Paused",
                        description: isPaused ? "Auto-checks will now run" : "Auto-checks have been stopped",
                      });
                    }}
                    disabled={isTogglingPause}
                    variant={isPaused ? "default" : "destructive"}
                    className={isPaused ? "bg-emerald-600 hover:bg-emerald-500" : ""}
                  >
                    {isTogglingPause ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : isPaused ? (
                      <Play className="w-4 h-4 mr-2" />
                    ) : (
                      <Pause className="w-4 h-4 mr-2" />
                    )}
                    {isPaused ? "Resume" : "Stop"}
                  </Button>
                </div>

                <div>
                  <Label className="text-slate-300 text-sm mb-2 block">
                    Alert Threshold (send Telegram when items exceed this)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={thresholdInput}
                      onChange={(e) => setThresholdInput(e.target.value)}
                      placeholder="e.g. 1000"
                      className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 max-w-xs"
                    />
                    <Button 
                      onClick={updateThreshold}
                      disabled={isSavingThreshold}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      {isSavingThreshold ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    This threshold is used for both auto-checks and manual checks.
                  </p>
                </div>

                <div>
                  <Label className="text-slate-300 text-sm mb-2 block">
                    Jump Alert (send Telegram when items suddenly increase by this amount)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={jumpThresholdInput}
                      onChange={(e) => setJumpThresholdInput(e.target.value)}
                      placeholder="e.g. 100"
                      className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 max-w-xs"
                    />
                    <Button 
                      onClick={async () => {
                        const newJump = parseInt(jumpThresholdInput.replace(/,/g, ""), 10);
                        if (isNaN(newJump) || newJump < 0) {
                          toast({
                            title: "Invalid Jump Threshold",
                            description: "Please enter a valid positive number",
                            variant: "destructive",
                          });
                          return;
                        }
                        const { error } = await supabase
                          .from('monitor_settings')
                          .update({ jump_threshold: newJump })
                          .eq('id', 'default');
                        
                        if (error) {
                          toast({
                            title: "Error",
                            description: "Failed to save jump threshold",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        setJumpThreshold(newJump);
                        toast({
                          title: "Jump Threshold Updated",
                          description: `Alert will trigger on sudden jump of ${newJump.toLocaleString()} items`,
                        });
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Notifies when item count increases by this amount from the last check.
                  </p>
                </div>

                <div>
                  <Label className="text-slate-300 text-sm mb-2 block">
                    Check Interval (seconds)
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={intervalInput}
                      onChange={(e) => setIntervalInput(e.target.value)}
                      placeholder="e.g. 30"
                      min="10"
                      max="60"
                      className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 max-w-xs"
                    />
                    <Button 
                      onClick={async () => {
                        const newInterval = parseInt(intervalInput, 10);
                        if (isNaN(newInterval) || newInterval < 10 || newInterval > 60) {
                          toast({
                            title: "Invalid Interval",
                            description: "Please enter a number between 10 and 60 seconds",
                            variant: "destructive",
                          });
                          return;
                        }
                          const { error } = await supabase
                            .from('monitor_settings')
                            .update({ interval_seconds: newInterval })
                            .eq('id', 'default');
                        
                        if (error) {
                          toast({
                            title: "Error",
                            description: "Failed to save interval",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        setIntervalMinutes(newInterval);
                        toast({
                          title: "Interval Updated",
                          description: `Monitoring will run every ${newInterval} second${newInterval > 1 ? 's' : ''}.`,
                        });
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white"
                    >
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    How often to check for stock updates (10-60 seconds). Faster intervals use more API credits.
                  </p>
                </div>

                {/* Firecrawl API Keys Section */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-slate-300 text-sm flex items-center gap-2">
                      Firecrawl API Keys
                      <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                        {apiKeys.filter(k => k.is_active).length}/{apiKeys.length}
                      </Badge>
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowApiKeys(!showApiKeys)}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      {showApiKeys ? "Hide" : "Manage"}
                    </Button>
                  </div>
                  
                  {showApiKeys && (
                    <div className="space-y-4">
                      {/* Google Sheets Sync */}
                      <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/20 p-3 rounded-lg border border-green-700/30">
                        <p className="text-xs text-green-300 mb-2 font-medium">📊 Sync from Google Sheets</p>
                        <p className="text-xs text-slate-400 mb-3">Add your keys to a Google Sheet, publish as CSV, then sync. Keys must start with "fc-".</p>
                        <div className="space-y-2">
                          <Input
                            type="url"
                            value={sheetUrl}
                            onChange={(e) => setSheetUrl(e.target.value)}
                            placeholder="Google Sheets CSV URL"
                            className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 text-xs"
                          />
                          <Button
                            onClick={syncFromGoogleSheets}
                            disabled={isSyncing}
                            className="bg-green-600 hover:bg-green-500 text-white w-full"
                          >
                            {isSyncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                            Sync Keys from Sheet
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Your sheet: <a href="https://docs.google.com/spreadsheets/d/1e1O0wneRwUwsjvaHuCklRGh4aJm4oCnZuzeRO-2gqBw" target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">Open Sheet</a>
                        </p>
                      </div>

                      {/* Bulk add API keys (5 at a time) */}
                      <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                        <p className="text-xs text-slate-400 mb-3">Or add up to 5 API keys manually. Keys are used in order, rotating on failure.</p>
                        <div className="space-y-2">
                          {bulkApiKeys.map((key, index) => (
                            <Input
                              key={index}
                              type="text"
                              value={key}
                              onChange={(e) => {
                                const updated = [...bulkApiKeys];
                                updated[index] = e.target.value;
                                setBulkApiKeys(updated);
                              }}
                              placeholder={`API Key ${index + 1} (fc-xxxxx...)`}
                              className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                            />
                          ))}
                          <Button
                            onClick={addBulkApiKeys}
                            disabled={isAddingApiKey}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white w-full"
                          >
                            {isAddingApiKey ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                            Add Keys ({bulkApiKeys.filter(k => k.trim()).length} entered)
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Get your API key from <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">firecrawl.dev</a>
                        </p>
                      </div>

                      {/* Single key add */}
                      <div className="bg-slate-800/20 p-3 rounded-lg border border-slate-700/20">
                        <p className="text-xs text-slate-400 mb-2">Or add single key with label:</p>
                        <div className="space-y-2">
                          <Input
                            type="text"
                            value={newApiKeyLabel}
                            onChange={(e) => setNewApiKeyLabel(e.target.value)}
                            placeholder="Label (optional)"
                            className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                          />
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              value={newApiKey}
                              onChange={(e) => setNewApiKey(e.target.value)}
                              placeholder="fc-xxxxx..."
                              className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 flex-1"
                            />
                            <Button
                              onClick={addApiKey}
                              disabled={isAddingApiKey || apiKeys.length >= 50}
                              className="bg-cyan-600 hover:bg-cyan-500 text-white"
                            >
                              {isAddingApiKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Existing API keys */}
                      {apiKeys.length > 0 ? (
                        <div className="space-y-2">
                          {apiKeys.map((key, index) => (
                            <div key={key.id} className="flex items-center justify-between p-3 bg-slate-800/20 rounded-lg border border-slate-700/20">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-medium truncate">
                                    {key.label || `Key ${index + 1}`}
                                  </span>
                                  <Badge 
                                    variant="outline" 
                                    className={`text-xs ${key.is_active ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}
                                  >
                                    {key.is_active ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                                <p className="text-xs text-slate-500 truncate">
                                  ••••••••{key.api_key.slice(-8)}
                                </p>
                                {key.last_error && (
                                  <p className="text-xs text-red-400 truncate">Error: {key.last_error}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 px-2 ${key.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                                  onClick={async () => {
                                    await supabase.from('firecrawl_api_keys').update({ is_active: !key.is_active }).eq('id', key.id);
                                    setApiKeys(prev => prev.map(k => k.id === key.id ? { ...k, is_active: !k.is_active } : k));
                                  }}
                                >
                                  {key.is_active ? 'Disable' : 'Enable'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                                  onClick={async () => {
                                    await supabase.from('firecrawl_api_keys').delete().eq('id', key.id);
                                    setApiKeys(prev => prev.filter(k => k.id !== key.id));
                                    toast({ title: "Deleted", description: "API key removed" });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 text-center py-2">No API keys added yet</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Category Monitors Section */}
                <div className="border-t border-slate-700/50 pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-slate-300 text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4" />
                      Category Monitors
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCategories(!showCategories)}
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      {showCategories ? "Hide" : "Manage"}
                    </Button>
                  </div>
                  
                  {showCategories && (
                    <div className="space-y-4">
                      {/* Add new category */}
                      <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30">
                        <p className="text-xs text-slate-400 mb-3">Add a category URL to monitor (e.g., Women Jeans)</p>
                        <div className="space-y-2">
                          <Input
                            type="text"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            placeholder="Category name (e.g., Women Jeans)"
                            className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                          />
                          <Input
                            type="url"
                            value={newCategoryUrl}
                            onChange={(e) => setNewCategoryUrl(e.target.value)}
                            placeholder="SHEIN category URL"
                            className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                          />
                          <div className="flex gap-2">
                            <Input
                              type="number"
                              value={newCategoryThreshold}
                              onChange={(e) => setNewCategoryThreshold(e.target.value)}
                              placeholder="Threshold"
                              min="1"
                              className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 w-24"
                            />
                            <Button
                              onClick={async () => {
                                if (!newCategoryName.trim() || !newCategoryUrl.trim()) {
                                  toast({
                                    title: "Missing Info",
                                    description: "Please enter both name and URL",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                const th = parseInt(newCategoryThreshold, 10);
                                if (isNaN(th) || th < 1) {
                                  toast({
                                    title: "Invalid Threshold",
                                    description: "Threshold must be at least 1",
                                    variant: "destructive",
                                  });
                                  return;
                                }
                                setIsAddingCategory(true);
                                const { error } = await supabase
                                  .from('category_monitors')
                                  .insert({
                                    name: newCategoryName.trim(),
                                    url: newCategoryUrl.trim(),
                                    threshold: th,
                                  });
                                setIsAddingCategory(false);
                                if (error) {
                                  toast({ title: "Error", description: "Failed to add category", variant: "destructive" });
                                  return;
                                }
                                // Reload categories
                                const { data } = await supabase.from('category_monitors').select('*').order('created_at', { ascending: true });
                                if (data) setCategories(data);
                                setNewCategoryName("");
                                setNewCategoryUrl("");
                                setNewCategoryThreshold("1");
                                toast({ title: "Category Added", description: `Now monitoring ${newCategoryName}` });
                              }}
                              disabled={isAddingCategory}
                              className="bg-emerald-600 hover:bg-emerald-500 text-white"
                            >
                              {isAddingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Existing categories */}
                      {categories.length > 0 ? (
                        <div className="space-y-2">
                          {categories.map((cat) => (
                            <div key={cat.id} className="flex items-center justify-between p-3 bg-slate-800/20 rounded-lg border border-slate-700/20">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-medium truncate">{cat.name}</span>
                                  {cat.subtract_from_total ? (
                                    <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-400">
                                      <Minus className="w-3 h-3 mr-1" />
                                      Subtract
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">
                                      ≥{cat.threshold}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 truncate">{cat.url}</p>
                                {cat.last_item_count !== null && (
                                  <p className="text-xs text-cyan-400">Last: {cat.last_item_count} items</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 ml-2">
                                {!cat.subtract_from_total && (
                                  <Input
                                    type="number"
                                    value={cat.threshold}
                                    min="1"
                                    className="bg-slate-900/50 border-slate-700 text-white w-16 h-8 text-xs"
                                    onChange={async (e) => {
                                      const newTh = parseInt(e.target.value, 10);
                                      if (isNaN(newTh) || newTh < 1) return;
                                      await supabase.from('category_monitors').update({ threshold: newTh }).eq('id', cat.id);
                                      setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, threshold: newTh } : c));
                                    }}
                                  />
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={`h-8 px-2 text-xs ${cat.subtract_from_total ? 'text-amber-400 hover:text-amber-300' : 'text-slate-400 hover:text-slate-300'}`}
                                  onClick={async () => {
                                    await supabase.from('category_monitors').update({ subtract_from_total: !cat.subtract_from_total }).eq('id', cat.id);
                                    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, subtract_from_total: !c.subtract_from_total } : c));
                                    toast({
                                      title: cat.subtract_from_total ? "Monitor Mode" : "Subtract Mode",
                                      description: cat.subtract_from_total 
                                        ? `${cat.name} will now trigger alerts` 
                                        : `${cat.name} will be subtracted from total`
                                    });
                                  }}
                                >
                                  {cat.subtract_from_total ? 'Monitor' : 'Subtract'}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                                  onClick={async () => {
                                    await supabase.from('category_monitors').delete().eq('id', cat.id);
                                    setCategories(prev => prev.filter(c => c.id !== cat.id));
                                    toast({ title: "Deleted", description: `Removed ${cat.name}` });
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 text-center py-2">No category monitors added yet</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm mb-6 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 pointer-events-none" />
          <CardHeader className="relative">
            <CardTitle className="text-white flex items-center gap-2">
              <span>Inventory Status</span>
              {result?.exceedsThreshold && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                  Alert Active
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-slate-400">
              Monitoring sheinindia.in/c/sverse-5939-37961
            </CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-6">
            <div className="text-center py-8">
              {result ? (
                <>
                  <div className={`text-7xl font-bold tracking-tight ${
                    result.exceedsThreshold 
                      ? "text-red-400" 
                      : "text-emerald-400"
                  }`}>
                    {result.itemCount?.toLocaleString() ?? "—"}
                  </div>
                  <p className="text-slate-400 mt-2">Items Found</p>
                  {result.timestamp && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last checked: {new Date(result.timestamp).toLocaleString()}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-slate-500">
                  <p className="text-4xl font-bold">—</p>
                  <p className="mt-2">Click Check Now or wait for auto-check</p>
                </div>
              )}
            </div>

            {result && result.exceedsThreshold && (
              <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${
                result.telegramSent 
                  ? "bg-emerald-500/10 border border-emerald-500/20" 
                  : "bg-amber-500/10 border border-amber-500/20"
              }`}>
                {result.telegramSent ? (
                  <>
                    <Bell className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 text-sm">Telegram notification sent!</span>
                  </>
                ) : (
                  <>
                    <BellOff className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-400 text-sm">
                      {result.telegramError || "Notification not sent"}
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 justify-center">
              <Button 
                onClick={checkMonitor}
                disabled={isLoading}
                className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white border-0"
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Check Now
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                asChild
              >
                <a 
                  href="https://www.sheinindia.in/c/sverse-5939-37961" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Site
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white text-lg">Check History</CardTitle>
              <CardDescription className="text-slate-400">
                All monitoring checks (auto & manual)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((item) => (
                  <div 
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        item.exceeds_threshold ? "bg-red-400" : "bg-emerald-400"
                      }`} />
                      <span className="text-white font-medium">
                        {item.item_count.toLocaleString()} items
                      </span>
                      <span className="text-slate-500 text-xs">
                        (threshold: {item.threshold.toLocaleString()})
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.telegram_sent && (
                        <Bell className="w-4 h-4 text-emerald-400" />
                      )}
                      <span className="text-xs text-slate-500">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-slate-900/30 border-slate-800/30 mt-6">
          <CardContent className="pt-6">
            <div className="text-center text-slate-400 text-sm">
              <p>This monitor automatically checks SHEIN India sverse collection every 5 minutes.</p>
              <p className="mt-1">A Telegram notification is sent when the item count exceeds the threshold.</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
