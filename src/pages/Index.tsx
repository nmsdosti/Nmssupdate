import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, RefreshCw, Bell, BellOff, TrendingUp, Clock, ExternalLink,
  Settings, Timer, Plus, Trash2, Pause, Play, Lock, Link as LinkIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const ADMIN_PASSWORD = "9898054041";
const SESSION_KEY = "monitor_admin_session";

interface MonitoredLink {
  id: string;
  name: string;
  url: string;
  threshold: number;
  is_active: boolean;
  last_item_count: number | null;
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

interface AlertItem {
  name: string;
  url: string;
  count: number;
  threshold: number;
}

interface LinkResult {
  id: string;
  name: string;
  url: string;
  itemCount: number | null;
  threshold: number;
  error?: string;
}

interface MonitorResult {
  success: boolean;
  itemCount?: number;
  threshold?: number;
  exceedsThreshold?: boolean;
  telegramSent?: boolean;
  telegramError?: string | null;
  timestamp?: string;
  alerts?: AlertItem[];
  links?: LinkResult[];
  error?: string;
}

const Index = () => {
  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Monitor state
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MonitorResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Settings
  const [intervalSeconds, setIntervalSeconds] = useState(5);
  const [intervalInput, setIntervalInput] = useState("5");
  const [globalThreshold, setGlobalThreshold] = useState(1);
  const [thresholdInput, setThresholdInput] = useState("1");
  const [isPaused, setIsPaused] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [isSavingInterval, setIsSavingInterval] = useState(false);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Links
  const [links, setLinks] = useState<MonitoredLink[]>([]);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkThreshold, setNewLinkThreshold] = useState("1");
  const [isAddingLink, setIsAddingLink] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (localStorage.getItem(SESSION_KEY) === "authenticated") setIsAuthenticated(true);
  }, []);

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      if (rememberMe) localStorage.setItem(SESSION_KEY, "authenticated");
      toast({ title: "Access granted" });
    } else {
      toast({ title: "Invalid password", variant: "destructive" });
    }
  };

  const loadLinks = async () => {
    const { data } = await supabase
      .from('category_monitors')
      .select('id, name, url, threshold, is_active, last_item_count')
      .order('created_at', { ascending: true });
    if (data) setLinks(data);
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from('monitor_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setHistory(data);
      if (data.length > 0 && !result) {
        const latest = data[0];
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
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      const { data: settings } = await supabase
        .from('monitor_settings')
        .select('threshold, interval_seconds, is_paused')
        .eq('id', 'default')
        .single();
      if (settings) {
        setGlobalThreshold(settings.threshold);
        setThresholdInput(settings.threshold.toString());
        setIntervalSeconds(settings.interval_seconds);
        setIntervalInput(settings.interval_seconds.toString());
        setIsPaused(settings.is_paused ?? false);
      }
      await loadLinks();
      await loadHistory();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const checkMonitor = async () => {
    if (links.length === 0) {
      toast({
        title: "No links to monitor",
        description: "Add at least one link below before running a check.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-shein", {
        body: { manual: true },
      });
      if (error) throw error;
      setResult(data);
      await Promise.all([loadHistory(), loadLinks()]);
      if (data.success) {
        toast({
          title: data.exceedsThreshold ? "Alert Triggered!" : "Check Complete",
          description: `Total ${data.itemCount?.toLocaleString() ?? 0} items across ${data.links?.length ?? 0} link(s)`,
          variant: data.exceedsThreshold ? "destructive" : "default",
        });
      } else {
        toast({ title: "Error", description: data.error || "Failed to check", variant: "destructive" });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Check failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const addLink = async () => {
    const url = newLinkUrl.trim();
    const name = newLinkName.trim();
    const th = parseInt(newLinkThreshold, 10);
    if (!url) {
      toast({ title: "Missing URL", description: "Please enter a SHEIN page URL", variant: "destructive" });
      return;
    }
    if (!name) {
      toast({ title: "Missing name", description: "Please enter a name for this link", variant: "destructive" });
      return;
    }
    if (isNaN(th) || th < 1) {
      toast({ title: "Invalid threshold", description: "Threshold must be at least 1", variant: "destructive" });
      return;
    }
    setIsAddingLink(true);
    const { error } = await supabase
      .from('category_monitors')
      .insert({ name, url, threshold: th, is_active: true, subtract_from_total: false });
    setIsAddingLink(false);
    if (error) {
      toast({ title: "Error", description: "Failed to add link", variant: "destructive" });
      return;
    }
    setNewLinkName("");
    setNewLinkUrl("");
    setNewLinkThreshold("1");
    await loadLinks();
    toast({ title: "Link added", description: `Now monitoring ${name}` });
  };

  const updateLinkThreshold = async (id: string, value: number) => {
    if (isNaN(value) || value < 1) return;
    await supabase.from('category_monitors').update({ threshold: value }).eq('id', id);
    setLinks(prev => prev.map(l => l.id === id ? { ...l, threshold: value } : l));
  };

  const toggleLinkActive = async (link: MonitoredLink) => {
    await supabase.from('category_monitors').update({ is_active: !link.is_active }).eq('id', link.id);
    setLinks(prev => prev.map(l => l.id === link.id ? { ...l, is_active: !l.is_active } : l));
  };

  const deleteLink = async (id: string, name: string) => {
    await supabase.from('category_monitors').delete().eq('id', id);
    setLinks(prev => prev.filter(l => l.id !== id));
    toast({ title: "Removed", description: `${name} is no longer monitored` });
  };

  const saveInterval = async () => {
    const v = parseInt(intervalInput, 10);
    if (isNaN(v) || v < 5 || v > 300) {
      toast({ title: "Invalid interval", description: "Enter a number between 5 and 300 seconds", variant: "destructive" });
      return;
    }
    setIsSavingInterval(true);
    const { error } = await supabase.from('monitor_settings').update({ interval_seconds: v }).eq('id', 'default');
    setIsSavingInterval(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save interval", variant: "destructive" });
      return;
    }
    setIntervalSeconds(v);
    toast({ title: "Interval saved", description: `Checks every ${v} seconds` });
  };

  const saveGlobalThreshold = async () => {
    const v = parseInt(thresholdInput.replace(/,/g, ""), 10);
    if (isNaN(v) || v < 1) {
      toast({ title: "Invalid threshold", description: "Enter a positive number", variant: "destructive" });
      return;
    }
    setIsSavingThreshold(true);
    const { error } = await supabase.from('monitor_settings').update({ threshold: v }).eq('id', 'default');
    setIsSavingThreshold(false);
    if (error) {
      toast({ title: "Error", description: "Failed to save threshold", variant: "destructive" });
      return;
    }
    setGlobalThreshold(v);
    toast({ title: "Default threshold saved", description: `New links will default to ${v.toLocaleString()}` });
  };

  const togglePause = async () => {
    setIsTogglingPause(true);
    const { error } = await supabase.from('monitor_settings').update({ is_paused: !isPaused }).eq('id', 'default');
    setIsTogglingPause(false);
    if (error) {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
      return;
    }
    setIsPaused(!isPaused);
    toast({ title: isPaused ? "Monitoring resumed" : "Monitoring paused" });
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
              <Checkbox id="remember" checked={rememberMe} onCheckedChange={(c) => setRememberMe(c === true)} />
              <Label htmlFor="remember" className="text-sm text-slate-400 cursor-pointer">Remember me</Label>
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
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isPaused && (
              <Badge variant="outline" className="border-red-500/30 text-red-400 bg-red-500/10">
                <Pause className="w-3 h-3 mr-1" />Paused
              </Badge>
            )}
            <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/10">
              <Timer className="w-3 h-3 mr-1" />{intervalSeconds}s
            </Badge>
            <Button
              variant="ghost" size="sm"
              onClick={() => setShowSettings(!showSettings)}
              className="text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <Settings className="w-4 h-4 mr-2" />Settings
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Status banner */}
        <Card className="bg-cyan-500/10 border-cyan-500/20 mb-6">
          <CardContent className="py-3">
            <div className="flex items-center justify-center gap-2 text-cyan-400 text-sm text-center">
              <Timer className="w-4 h-4 shrink-0" />
              <span>
                Monitoring {links.filter(l => l.is_active).length} active link{links.filter(l => l.is_active).length === 1 ? '' : 's'} every {intervalSeconds}s.
                Telegram alert when any link reaches its own threshold.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Settings */}
        {showSettings && (
          <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pause/Resume */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <div>
                  <Label className="text-slate-300 text-sm block">Monitoring Status</Label>
                  <p className="text-xs text-slate-500 mt-1">
                    {isPaused ? "Paused. Auto-checks won't run." : `Active. Checking every ${intervalSeconds}s.`}
                  </p>
                </div>
                <Button
                  onClick={togglePause}
                  disabled={isTogglingPause}
                  variant={isPaused ? "default" : "destructive"}
                  className={isPaused ? "bg-emerald-600 hover:bg-emerald-500" : ""}
                >
                  {isTogglingPause ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> :
                    isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                  {isPaused ? "Resume" : "Pause"}
                </Button>
              </div>

              {/* Interval */}
              <div>
                <Label className="text-slate-300 text-sm mb-2 block">Check Interval (seconds)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number" value={intervalInput} min={5} max={300}
                    onChange={(e) => setIntervalInput(e.target.value)}
                    placeholder="e.g. 5"
                    className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 max-w-xs"
                  />
                  <Button onClick={saveInterval} disabled={isSavingInterval} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                    {isSavingInterval ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">How often to check (5-300 seconds).</p>
              </div>

              {/* Default threshold */}
              <div>
                <Label className="text-slate-300 text-sm mb-2 block">Default Threshold (for new links)</Label>
                <div className="flex gap-2">
                  <Input
                    type="text" value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    placeholder="e.g. 1"
                    className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 max-w-xs"
                  />
                  <Button onClick={saveGlobalThreshold} disabled={isSavingThreshold} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                    {isSavingThreshold ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Each link can also have its own threshold below.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inventory snapshot */}
        <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm mb-6 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-cyan-500/5 pointer-events-none" />
          <CardHeader className="relative">
            <CardTitle className="text-white flex items-center gap-2">
              <span>Inventory Status</span>
              {result?.exceedsThreshold && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Alert Active</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-slate-400">
              Total items across all monitored links
            </CardDescription>
          </CardHeader>
          <CardContent className="relative space-y-6">
            <div className="text-center py-6">
              {result ? (
                <>
                  <div className={`text-6xl sm:text-7xl font-bold tracking-tight ${result.exceedsThreshold ? "text-red-400" : "text-emerald-400"}`}>
                    {result.itemCount?.toLocaleString() ?? "—"}
                  </div>
                  <p className="text-slate-400 mt-2">Total Items Found</p>
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

            {result?.alerts && result.alerts.length > 0 && (
              <div className="space-y-2">
                {result.alerts.map((a, i) => (
                  <div key={i} className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-red-300 text-sm font-medium">⚠️ {a.name}</p>
                    <p className="text-xs text-slate-400">{a.count.toLocaleString()} items (threshold: {a.threshold.toLocaleString()})</p>
                  </div>
                ))}
              </div>
            )}

            {result?.exceedsThreshold && (
              <div className={`flex items-center justify-center gap-2 p-3 rounded-lg ${result.telegramSent ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                {result.telegramSent ? (
                  <><Bell className="w-4 h-4 text-emerald-400" /><span className="text-emerald-400 text-sm">Telegram notification sent!</span></>
                ) : (
                  <><BellOff className="w-4 h-4 text-amber-400" /><span className="text-amber-400 text-sm">{result.telegramError || "Notification not sent"}</span></>
                )}
              </div>
            )}

            <div className="flex justify-center">
              <Button
                onClick={checkMonitor} disabled={isLoading}
                className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white border-0"
                size="lg"
              >
                {isLoading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Checking...</>) :
                  (<><RefreshCw className="w-4 h-4 mr-2" />Check Now</>)}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Monitored Links */}
        <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm mb-6">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <LinkIcon className="w-5 h-5" />Monitored Links
              <Badge variant="outline" className="ml-1 text-xs border-slate-600 text-slate-400">
                {links.filter(l => l.is_active).length}/{links.length}
              </Badge>
            </CardTitle>
            <CardDescription className="text-slate-400">
              Add SHEIN page URLs to monitor. Each link has its own alert threshold.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new link */}
            <div className="bg-slate-800/30 p-3 rounded-lg border border-slate-700/30 space-y-2">
              <Input
                value={newLinkName}
                onChange={(e) => setNewLinkName(e.target.value)}
                placeholder="Name (e.g. Footwear)"
                className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
              />
              <Input
                type="url"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://www.sheinindia.in/s/footwear-206291"
                className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
              />
              <div className="flex gap-2">
                <Input
                  type="number" min={1}
                  value={newLinkThreshold}
                  onChange={(e) => setNewLinkThreshold(e.target.value)}
                  placeholder="Threshold"
                  className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500 w-28"
                />
                <Button onClick={addLink} disabled={isAddingLink} className="bg-emerald-600 hover:bg-emerald-500 text-white flex-1">
                  {isAddingLink ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  Add Link
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Supports both <span className="text-slate-300">/c/&lt;code&gt;</span> and <span className="text-slate-300">/s/&lt;code&gt;</span> URLs.
              </p>
            </div>

            {/* List */}
            {links.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">No links yet. Add your first link above.</p>
            ) : (
              <div className="space-y-2">
                {links.map((link) => (
                  <div key={link.id} className="p-3 bg-slate-800/20 rounded-lg border border-slate-700/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium truncate">{link.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${link.is_active ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-600 text-slate-500'}`}
                          >
                            {link.is_active ? 'Active' : 'Paused'}
                          </Badge>
                          {link.last_item_count !== null && (
                            <Badge variant="outline" className="text-xs border-cyan-500/40 text-cyan-300">
                              {link.last_item_count.toLocaleString()} items
                            </Badge>
                          )}
                        </div>
                        <a
                          href={link.url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-slate-500 hover:text-cyan-400 truncate block mt-1"
                        >
                          {link.url}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Label className="text-xs text-slate-400">Threshold</Label>
                      <Input
                        type="number" min={1}
                        defaultValue={link.threshold}
                        onBlur={(e) => updateLinkThreshold(link.id, parseInt(e.target.value, 10))}
                        className="bg-slate-900/50 border-slate-700 text-white w-24 h-8 text-xs"
                      />
                      <Button
                        variant="ghost" size="sm"
                        className={`h-8 px-2 text-xs ${link.is_active ? 'text-amber-400 hover:text-amber-300' : 'text-emerald-400 hover:text-emerald-300'}`}
                        onClick={() => toggleLinkActive(link)}
                      >
                        {link.is_active ? 'Pause' : 'Activate'}
                      </Button>
                      <Button variant="ghost" size="sm" asChild className="h-8 w-8 p-0 text-slate-400 hover:text-white">
                        <a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" /></a>
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 w-8 p-0"
                        onClick={() => deleteLink(link.id, link.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per-link results */}
        {result?.links && result.links.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm mb-6">
            <CardHeader>
              <CardTitle className="text-white text-lg">Last Check — Per Link</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {result.links.map((l) => (
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${l.error ? 'bg-amber-400' : (l.itemCount ?? 0) >= l.threshold ? 'bg-red-400' : 'bg-emerald-400'}`} />
                      <span className="text-white font-medium truncate">{l.name}</span>
                    </div>
                    <span className="text-sm text-slate-300">
                      {l.error ? <span className="text-amber-400">{l.error}</span> : `${l.itemCount?.toLocaleString()} items`}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white text-lg">Check History</CardTitle>
              <CardDescription className="text-slate-400">Recent monitoring checks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${item.exceeds_threshold ? "bg-red-400" : "bg-emerald-400"}`} />
                      <span className="text-white font-medium">{item.item_count.toLocaleString()} items</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.telegram_sent && <Bell className="w-4 h-4 text-emerald-400" />}
                      <span className="text-xs text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Index;
