import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Send, Lock, Users, MessageSquare, ArrowLeft, CreditCard, Check, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ADMIN_PASSWORD = "9898054041";

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

export default function TelegramManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [subscriptionRequests, setSubscriptionRequests] = useState<SubscriptionRequest[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"requests" | "subscribers" | "messages">("requests");
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

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
      toast({ title: "Access granted" });
    } else {
      toast({ title: "Invalid password", variant: "destructive" });
    }
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
          <Link to="/">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Monitor
            </Button>
          </Link>
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
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Chat ID</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Extend</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((sub) => {
                    const subStatus = getSubscriptionStatus(sub);
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
                          <Select onValueChange={(val) => extendSubscription(sub.chat_id, parseInt(val))}>
                            <SelectTrigger className="w-[120px]">
                              <SelectValue placeholder="Extend..." />
                            </SelectTrigger>
                            <SelectContent position="popper" className="z-50">
                              <SelectItem value="3">+3 days</SelectItem>
                              <SelectItem value="7">+7 days</SelectItem>
                              <SelectItem value="30">+30 days</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select 
                            value={sub.is_active ? "active" : (sub.subscription_expires_at ? "hold" : "stop")}
                            onValueChange={(val) => updateSubscriberStatus(sub.chat_id, val as "active" | "hold" | "stop")}
                          >
                            <SelectTrigger className="w-[110px]">
                              <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent position="popper" className="z-50">
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="hold">Hold</SelectItem>
                              <SelectItem value="stop">Stop</SelectItem>
                            </SelectContent>
                          </Select>
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
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No subscribers yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
      </div>
    </div>
  );
}
