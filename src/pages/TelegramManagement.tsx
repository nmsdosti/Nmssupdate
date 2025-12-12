import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Send, Lock, Users, MessageSquare, ArrowLeft, CreditCard, Check, X, Settings, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const ADMIN_PASSWORD = "9898054041";
const SESSION_KEY = "telegram_admin_session";

interface Subscriber {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  is_active: boolean;
  subscribed_at: string;
  subscription_expires_at: string | null;
}

interface Message {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  message_text: string;
  created_at: string;
}

interface SubscriptionRequest {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  utr_id: string | null;
  plan_type: string;
  amount: number;
  status: string;
  requested_at: string;
}

interface SubscriptionPricing {
  price_3_days: number;
  price_1_week: number;
  price_1_month: number;
}

export default function TelegramManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"requests" | "subscribers" | "messages" | "settings">("requests");
  const [pricing, setPricing] = useState<SubscriptionPricing>({ price_3_days: 50, price_1_week: 100, price_1_month: 400 });
  const [isSavingPricing, setIsSavingPricing] = useState(false);
  const { toast } = useToast();

  // Check for saved session on mount
  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_KEY);
    if (savedSession === "authenticated") {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
      loadPricing();
    }
  }, [isAuthenticated]);

  const loadPricing = async () => {
    const { data } = await supabase
      .from("subscription_pricing")
      .select("price_3_days, price_1_week, price_1_month")
      .eq("id", "default")
      .single();
    
    if (data) {
      setPricing(data);
    }
  };

  const savePricing = async () => {
    setIsSavingPricing(true);
    const { error } = await supabase
      .from("subscription_pricing")
      .update({
        price_3_days: pricing.price_3_days,
        price_1_week: pricing.price_1_week,
        price_1_month: pricing.price_1_month,
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
    
    setIsSavingPricing(false);
    
    if (error) {
      toast({ title: "Error saving pricing", variant: "destructive" });
    } else {
      toast({ title: "Pricing updated successfully" });
    }
  };

  const loadData = async () => {
    const [subsResult, msgsResult, reqsResult] = await Promise.all([
      supabase.from("telegram_subscribers").select("*").order("subscribed_at", { ascending: false }),
      supabase.from("telegram_messages").select("*").order("created_at", { ascending: false }),
      supabase.from("telegram_subscriptions").select("*").eq("status", "pending").order("requested_at", { ascending: false }),
    ]);

    if (subsResult.data) setSubscribers(subsResult.data);
    if (msgsResult.data) setMessages(msgsResult.data);
    if (reqsResult.data) setSubscriptionRequests(reqsResult.data);
  };

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

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(SESSION_KEY);
    toast({ title: "Logged out" });
  };

  const deleteSubscriber = async (id: string) => {
    const { error } = await supabase.from("telegram_subscribers").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting subscriber", variant: "destructive" });
    } else {
      setSubscribers(subscribers.filter(s => s.id !== id));
      toast({ title: "Subscriber deleted" });
    }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("telegram_messages").delete().eq("id", id);
    if (error) {
      toast({ title: "Error deleting message", variant: "destructive" });
    } else {
      setMessages(messages.filter(m => m.id !== id));
      toast({ title: "Message deleted" });
    }
  };

  const approveSubscription = async (request: SubscriptionRequest) => {
    // Calculate expiry date
    const now = new Date();
    let expiresAt: Date;
    
    if (request.plan_type === '3_days') {
      expiresAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    } else if (request.plan_type === '1_week') {
      expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else {
      expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    // Update subscription request
    const { error: reqError } = await supabase
      .from("telegram_subscriptions")
      .update({ 
        status: "active", 
        approved_at: now.toISOString(),
        expires_at: expiresAt.toISOString()
      })
      .eq("id", request.id);

    if (reqError) {
      toast({ title: "Error approving subscription", variant: "destructive" });
      return;
    }

    // Update subscriber's expiry date
    const { error: subError } = await supabase
      .from("telegram_subscribers")
      .update({ subscription_expires_at: expiresAt.toISOString() })
      .eq("chat_id", request.chat_id);

    if (subError) {
      console.error("Error updating subscriber:", subError);
    }

    // Send confirmation to user
    const planName = request.plan_type.replace('_', ' ');
    const confirmMessage = `✅ *Subscription Activated!*\n\n📋 Plan: ${planName}\n📅 Valid until: ${expiresAt.toLocaleDateString()}\n\nYou will now receive SHEIN Monitor alerts. Thank you for subscribing!`;

    await supabase.functions.invoke("telegram-broadcast", {
      body: { message: confirmMessage, chatIds: [request.chat_id] },
    });

    toast({ title: "Subscription approved" });
    setSubscriptionRequests(subscriptionRequests.filter(r => r.id !== request.id));
    loadData();
  };

  const rejectSubscription = async (request: SubscriptionRequest) => {
    const { error } = await supabase
      .from("telegram_subscriptions")
      .update({ status: "expired" })
      .eq("id", request.id);

    if (error) {
      toast({ title: "Error rejecting subscription", variant: "destructive" });
      return;
    }

    // Notify user
    const rejectMessage = `❌ *Payment Not Verified*\n\nYour payment for UTR: \`${request.utr_id}\` could not be verified.\n\nPlease check your UTR ID and try again, or contact support.`;

    await supabase.functions.invoke("telegram-broadcast", {
      body: { message: rejectMessage, chatIds: [request.chat_id] },
    });

    toast({ title: "Subscription rejected" });
    setSubscriptionRequests(subscriptionRequests.filter(r => r.id !== request.id));
  };

  const updateSubscriberStatus = async (chatId: string, status: "active" | "hold" | "stop") => {
    const updates: { is_active: boolean; subscription_expires_at?: string | null } = {
      is_active: status === "active",
    };
    
    // If stopping, clear subscription
    if (status === "stop") {
      updates.subscription_expires_at = null;
    }

    const { error } = await supabase
      .from("telegram_subscribers")
      .update(updates)
      .eq("chat_id", chatId);

    if (error) {
      toast({ title: "Error updating status", variant: "destructive" });
      return;
    }

    const statusLabels = { active: "Active", hold: "On Hold", stop: "Stopped" };
    toast({ title: `Subscriber set to ${statusLabels[status]}` });
    loadData();
  };

  const extendSubscription = async (chatId: string, days: number) => {
    const subscriber = subscribers.find(s => s.chat_id === chatId);
    if (!subscriber) return;

    const currentExpiry = subscriber.subscription_expires_at 
      ? new Date(subscriber.subscription_expires_at) 
      : new Date();
    
    const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
    const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    const { error } = await supabase
      .from("telegram_subscribers")
      .update({ subscription_expires_at: newExpiry.toISOString() })
      .eq("chat_id", chatId);

    if (error) {
      toast({ title: "Error extending subscription", variant: "destructive" });
      return;
    }

    // Notify user
    const extendMessage = `✅ *Subscription Extended!*\n\n📅 New expiry: ${newExpiry.toLocaleDateString()}\n\nThank you for your continued support!`;

    await supabase.functions.invoke("telegram-broadcast", {
      body: { message: extendMessage, chatIds: [chatId] },
    });

    toast({ title: `Subscription extended by ${days} days` });
    loadData();
  };

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const response = await supabase.functions.invoke("telegram-broadcast", {
        body: { message: broadcastMessage, skipSubscriptionCheck: true },
      });

      if (response.error) throw response.error;

      const data = response.data;
      toast({
        title: "Broadcast sent",
        description: `Sent to ${data.sent} subscribers${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
      });
      setBroadcastMessage("");
    } catch (error) {
      toast({ title: "Error sending broadcast", variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  };

  const getSubscriptionStatus = (subscriber: Subscriber) => {
    if (!subscriber.subscription_expires_at) return { status: "none", label: "No subscription", color: "bg-muted text-muted-foreground" };
    
    const expiresAt = new Date(subscriber.subscription_expires_at);
    const now = new Date();
    
    if (expiresAt > now) {
      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return { status: "active", label: `${daysLeft}d left`, color: "bg-green-500/20 text-green-500" };
    }
    return { status: "expired", label: "Expired", color: "bg-red-500/20 text-red-500" };
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Telegram Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember" 
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="remember" className="text-sm text-muted-foreground cursor-pointer">
                Remember me
              </Label>
            </div>
            <Button onClick={handleLogin} className="w-full">
              Login
            </Button>
            <Link to="/">
              <Button variant="ghost" className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Monitor
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Telegram Management</h1>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
            <Link to="/">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Monitor
              </Button>
            </Link>
          </div>
        </div>

        {/* Broadcast Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="w-5 h-5" /> Broadcast Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              placeholder="Type your message to send to all subscribers..."
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              rows={4}
            />
            <Button onClick={sendBroadcast} disabled={isSending}>
              {isSending ? "Sending..." : `Send to ${subscribers.filter(s => s.is_active).length} Subscribers`}
            </Button>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={activeTab === "requests" ? "default" : "outline"}
            onClick={() => setActiveTab("requests")}
          >
            <CreditCard className="w-4 h-4 mr-2" /> Payment Requests ({subscriptionRequests.length})
          </Button>
          <Button
            variant={activeTab === "subscribers" ? "default" : "outline"}
            onClick={() => setActiveTab("subscribers")}
          >
            <Users className="w-4 h-4 mr-2" /> Subscribers ({subscribers.length})
          </Button>
          <Button
            variant={activeTab === "messages" ? "default" : "outline"}
            onClick={() => setActiveTab("messages")}
          >
            <MessageSquare className="w-4 h-4 mr-2" /> Messages ({messages.length})
          </Button>
          <Button
            variant={activeTab === "settings" ? "default" : "outline"}
            onClick={() => setActiveTab("settings")}
          >
            <Settings className="w-4 h-4 mr-2" /> Settings
          </Button>
        </div>

        {/* Payment Requests Table */}
        {activeTab === "requests" && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Payment Requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>UTR ID</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscriptionRequests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{req.first_name || "Unknown"}</div>
                          <div className="text-sm text-muted-foreground">
                            {req.username ? `@${req.username}` : req.chat_id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {req.plan_type.replace('_', ' ')}
                      </TableCell>
                      <TableCell>₹{req.amount}</TableCell>
                      <TableCell className="font-mono text-sm">{req.utr_id || "-"}</TableCell>
                      <TableCell>{new Date(req.requested_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => approveSubscription(req)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => rejectSubscription(req)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {subscriptionRequests.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No pending payment requests
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Subscribers Table */}
        {activeTab === "subscribers" && (
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle>All Subscribers</CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-visible">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Chat ID</TableHead>
                      <TableHead>Days Left</TableHead>
                      <TableHead>Extend</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscribers.map((sub) => {
                      const subStatus = getSubscriptionStatus(sub);
                      const currentStatus = sub.is_active ? "active" : (sub.subscription_expires_at ? "hold" : "stop");
                      return (
                        <TableRow key={sub.id}>
                          <TableCell>{sub.first_name || "-"}</TableCell>
                          <TableCell>{sub.username ? `@${sub.username}` : "-"}</TableCell>
                          <TableCell className="font-mono text-sm">{sub.chat_id}</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs ${subStatus.color}`}>
                              {subStatus.label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <select 
                              className="w-[100px] h-9 px-2 rounded-md border border-input bg-background text-sm"
                              onChange={(e) => extendSubscription(sub.chat_id, parseInt(e.target.value))}
                              defaultValue=""
                            >
                              <option value="" disabled>Extend...</option>
                              <option value="3">+3 days</option>
                              <option value="7">+7 days</option>
                              <option value="30">+30 days</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <select 
                              className="w-[100px] h-9 px-2 rounded-md border border-input bg-background text-sm"
                              value={currentStatus}
                              onChange={(e) => updateSubscriberStatus(sub.chat_id, e.target.value as "active" | "hold" | "stop")}
                            >
                              <option value="active">Active</option>
                              <option value="hold">Hold</option>
                              <option value="stop">Stop</option>
                            </select>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteSubscriber(sub.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {subscribers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          No subscribers yet
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Messages Table */}
        {activeTab === "messages" && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{msg.first_name || "Unknown"}</div>
                          <div className="text-sm text-muted-foreground">
                            {msg.username ? `@${msg.username}` : msg.chat_id}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-md truncate">{msg.message_text}</TableCell>
                      <TableCell>{new Date(msg.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMessage(msg.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {messages.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No messages yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" /> Subscription Pricing
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="price_3_days">3 Days (₹)</Label>
                  <Input
                    id="price_3_days"
                    type="number"
                    value={pricing.price_3_days}
                    onChange={(e) => setPricing({ ...pricing, price_3_days: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_1_week">1 Week (₹)</Label>
                  <Input
                    id="price_1_week"
                    type="number"
                    value={pricing.price_1_week}
                    onChange={(e) => setPricing({ ...pricing, price_1_week: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_1_month">1 Month (₹)</Label>
                  <Input
                    id="price_1_month"
                    type="number"
                    value={pricing.price_1_month}
                    onChange={(e) => setPricing({ ...pricing, price_1_month: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <Button onClick={savePricing} disabled={isSavingPricing}>
                {isSavingPricing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Pricing"
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                These prices will be shown to users when they subscribe via Telegram bot.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
