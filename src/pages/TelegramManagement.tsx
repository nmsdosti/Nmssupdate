import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Send, Lock, Users, MessageSquare, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const ADMIN_PASSWORD = "9898054041";

interface Subscriber {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  is_active: boolean;
  subscribed_at: string;
}

interface Message {
  id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  message_text: string;
  created_at: string;
}

export default function TelegramManagement() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTab, setActiveTab] = useState<"subscribers" | "messages">("subscribers");
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const loadData = async () => {
    const [subsResult, msgsResult] = await Promise.all([
      supabase.from("telegram_subscribers").select("*").order("subscribed_at", { ascending: false }),
      supabase.from("telegram_messages").select("*").order("created_at", { ascending: false }),
    ]);

    if (subsResult.data) setSubscribers(subsResult.data);
    if (msgsResult.data) setMessages(msgsResult.data);
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

  const sendBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      toast({ title: "Please enter a message", variant: "destructive" });
      return;
    }

    setIsSending(true);
    try {
      const response = await supabase.functions.invoke("telegram-broadcast", {
        body: { message: broadcastMessage },
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
              {isSending ? "Sending..." : `Send to ${subscribers.filter(s => s.is_active).length} Active Subscribers`}
            </Button>
          </CardContent>
        </Card>

        {/* Tabs */}
        <div className="flex gap-2">
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
                    <TableHead>Status</TableHead>
                    <TableHead>Subscribed</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subscribers.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell>{sub.first_name || "-"}</TableCell>
                      <TableCell>{sub.username ? `@${sub.username}` : "-"}</TableCell>
                      <TableCell className="font-mono text-sm">{sub.chat_id}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${sub.is_active ? "bg-green-500/20 text-green-500" : "bg-red-500/20 text-red-500"}`}>
                          {sub.is_active ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell>{new Date(sub.subscribed_at).toLocaleDateString()}</TableCell>
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
                  ))}
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
