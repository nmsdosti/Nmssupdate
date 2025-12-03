import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Bell, BellOff, TrendingUp, Clock, ExternalLink, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<MonitorResult | null>(null);
  const [history, setHistory] = useState<MonitorResult[]>([]);
  const [manualCount, setManualCount] = useState("");
  const { toast } = useToast();

  const checkWithManualInput = async () => {
    const count = parseInt(manualCount.replace(/,/g, ""), 10);
    if (isNaN(count)) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid number",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("monitor-shein", {
        body: { manualCount: count }
      });
      
      if (error) throw error;
      
      setResult(data);
      setHistory(prev => [data, ...prev].slice(0, 10));
      
      if (data.success) {
        toast({
          title: data.exceedsThreshold ? "Alert Triggered!" : "Check Complete",
          description: `Recorded ${data.itemCount?.toLocaleString()} items`,
          variant: data.exceedsThreshold ? "destructive" : "default",
        });
      }
    } catch (error: unknown) {
      console.error("Monitor error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setManualCount("");
    }
  };

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
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
            Threshold: 1,000
          </Badge>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
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
                      Last checked: {new Date(result.timestamp).toLocaleTimeString()}
                    </p>
                  )}
                </>
              ) : (
                <div className="text-slate-500">
                  <p className="text-4xl font-bold">—</p>
                  <p className="mt-2">Enter the item count from the website</p>
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

            {/* Manual Input Section */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-4">
              <Label className="text-slate-300 text-sm mb-2 block">
                Step 1: Open the website and find the item count
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 mb-4"
                asChild
              >
                <a 
                  href="https://www.sheinindia.in/c/sverse-5939-37961" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open SHEIN Website
                </a>
              </Button>
              
              <Label className="text-slate-300 text-sm mb-2 block">
                Step 2: Enter the Items Found count below
              </Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={manualCount}
                  onChange={(e) => setManualCount(e.target.value)}
                  placeholder="e.g. 1,333"
                  className="bg-slate-900/50 border-slate-700 text-white placeholder:text-slate-500"
                />
                <Button 
                  onClick={checkWithManualInput}
                  disabled={isLoading || !manualCount}
                  className="bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white border-0"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-white text-lg">Recent Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.map((item, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 border border-slate-700/30"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        item.exceedsThreshold ? "bg-red-400" : "bg-emerald-400"
                      }`} />
                      <span className="text-white font-medium">
                        {item.itemCount?.toLocaleString() ?? "—"} items
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {item.telegramSent && (
                        <Bell className="w-4 h-4 text-emerald-400" />
                      )}
                      <span className="text-xs text-slate-500">
                        {item.timestamp && new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-amber-500/10 border-amber-500/20 mt-6">
          <CardContent className="pt-6">
            <div className="text-center text-amber-300 text-sm">
              <p className="font-medium">Why manual input?</p>
              <p className="mt-1 text-amber-400/80">
                SHEIN has anti-bot protection that blocks automated scraping. 
                You can connect Firecrawl in workspace settings for automatic monitoring.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
