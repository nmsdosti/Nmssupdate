import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Package, Layers, RefreshCw, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CategoryMonitor {
  id: string;
  name: string;
  last_item_count: number | null;
  is_active: boolean;
  subtract_from_total: boolean;
}

interface MonitorHistory {
  item_count: number;
  created_at: string;
}

export default function UserDashboard() {
  const [totalStock, setTotalStock] = useState<number | null>(null);
  const [categories, setCategories] = useState<CategoryMonitor[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    
    // Load latest total stock from history
    const { data: historyData } = await supabase
      .from('monitor_history')
      .select('item_count, created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    
    if (historyData && historyData.length > 0) {
      setTotalStock(historyData[0].item_count);
      setLastUpdated(historyData[0].created_at);
    }
    
    // Load category monitors
    const { data: categoryData } = await supabase
      .from('category_monitors')
      .select('id, name, last_item_count, is_active, subtract_from_total')
      .order('name', { ascending: true });
    
    if (categoryData) {
      setCategories(categoryData);
    }
    
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatNumber = (num: number | null) => {
    if (num === null) return "-";
    return num.toLocaleString();
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  // Calculate adjusted stock (total minus subtract categories)
  const calculateAdjustedStock = () => {
    if (totalStock === null) return null;
    const subtractAmount = categories
      .filter(c => c.subtract_from_total && c.last_item_count !== null)
      .reduce((sum, c) => sum + (c.last_item_count || 0), 0);
    return totalStock - subtractAmount;
  };

  const adjustedStock = calculateAdjustedStock();
  const hasSubtractions = categories.some(c => c.subtract_from_total && c.last_item_count !== null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <header className="border-b border-slate-800/50 backdrop-blur-sm bg-slate-950/50 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">SHEIN Stock Dashboard</h1>
              <p className="text-xs text-slate-400">Real-time inventory view</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={isLoading}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Last Updated */}
        <div className="flex items-center justify-center gap-2 text-slate-400 text-sm mb-6">
          <Timer className="w-4 h-4" />
          <span>Last updated: {formatTime(lastUpdated)}</span>
        </div>

        {/* Total Stock Card */}
        <Card className="bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-400" />
              Total Stock
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-5xl font-bold text-white">
                  {formatNumber(hasSubtractions ? adjustedStock : totalStock)}
                </p>
                {hasSubtractions && (
                  <p className="text-sm text-slate-400 mt-1">
                    Adjusted (Raw: {formatNumber(totalStock)})
                  </p>
                )}
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 mb-2">
                Items Found
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Categories Grid */}
        <div className="mb-4 flex items-center gap-2">
          <Layers className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Category Breakdown</h2>
        </div>

        {categories.length === 0 ? (
          <Card className="bg-slate-900/50 border-slate-800/50">
            <CardContent className="py-8 text-center text-slate-400">
              No categories configured
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((category) => (
              <Card 
                key={category.id} 
                className={`bg-slate-900/50 border-slate-800/50 ${
                  category.subtract_from_total ? 'border-l-4 border-l-red-500/50' : ''
                } ${!category.is_active ? 'opacity-50' : ''}`}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-medium text-white text-sm truncate flex-1">
                      {category.name}
                    </h3>
                    {category.subtract_from_total && (
                      <Badge variant="outline" className="text-red-400 border-red-500/30 text-xs ml-2">
                        Subtract
                      </Badge>
                    )}
                  </div>
                  <p className="text-3xl font-bold text-cyan-400">
                    {formatNumber(category.last_item_count)}
                  </p>
                  {!category.is_active && (
                    <p className="text-xs text-slate-500 mt-1">Inactive</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Subscribe CTA */}
        <Card className="bg-slate-900/50 border-slate-800/50 mt-8">
          <CardContent className="py-6 text-center">
            <p className="text-slate-300 mb-2">
              Want instant alerts when stock changes?
            </p>
            <p className="text-slate-400 text-sm">
              Join our Telegram bot for real-time notifications!
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
