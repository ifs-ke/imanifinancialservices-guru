// src/components/weekly-review/ReviewChat.tsx
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Send, 
  Sparkles, 
  MessageSquare, 
  Users, 
  RefreshCw, 
  Zap, 
  HelpCircle, 
  Volume2, 
  VolumeX, 
  Trash2, 
  MessageSquareCode,
  CornerDownLeft,
  Loader2,
  CheckCheck,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { 
  ReviewChatMessage, 
  SharedReviewRecord 
} from '@/lib/types';
import { 
  sendReviewChatMessageApi, 
  streamReviewChatMessagesApi, 
  streamAIAssistantResponse 
} from '@/app/actions/shareActions';

interface ReviewChatProps {
  shareRecord: SharedReviewRecord | null;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: 'owner' | 'reviewer';
  transactionsCount: number;
  commentsCount: number;
  journalNotes?: string;
  onCommentsUpdated?: () => void;
}

export function ReviewChat({
  shareRecord,
  currentUserId,
  currentUserName,
  currentUserRole,
  transactionsCount,
  commentsCount,
  journalNotes = "",
  onCommentsUpdated
}: ReviewChatProps) {
  const [chatMode, setChatMode] = useState<'peer' | 'ai'>('ai');
  const [messages, setMessages] = useState<ReviewChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isStreamingAI, setIsStreamingAI] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isOnline, setIsOnline] = useState(true);

  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Active share ID (if peer sharing is not active, use a mock/local-only ID for AI-only mode)
  const activeShareId = shareRecord?.id || `local_review_ai_coach_${currentUserId}`;

  // Suggestion chips
  const suggestions = useMemo(() => {
    return [
      { text: "🔍 Analyze high-ticket items", prompt: "Could you analyze our high-ticket expense transactions this week and advise where we spent excessively?" },
      { text: "💡 Give budget improvement tips", prompt: "How can we optimize our budget allocation for next week based on our spending patterns?" },
      { text: "🏆 Summarize weekly wins", prompt: "Looking at our review notes and transactions, what are our top 3 savings wins for this week?" }
    ];
  }, []);

  // Sync online status
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    setIsOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  // Subscribe to real-time chat messages when in peer mode or if there's a valid Firestore share
  useEffect(() => {
    if (!activeShareId) return;

    // Reset messages when switching active share
    setMessages([]);

    const unsubscribe = streamReviewChatMessagesApi(activeShareId, (realtimeMessages) => {
      // Filter or sort messages by timestamp
      const sorted = [...realtimeMessages].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(sorted);
    });

    return () => {
      unsubscribe();
    };
  }, [activeShareId]);

  // Auto-scroll chat feed on update
  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }, 80);
    }
  }, [messages, streamingText]);

  // AI Streaming handler
  const handleAISend = async (userMsgText: string) => {
    if (isStreamingAI || !userMsgText.trim()) return;

    const cleanMsg = userMsgText.trim();
    setIsSending(true);

    const userMsg: ReviewChatMessage = {
      id: `msg_user_${Date.now()}`,
      shareId: activeShareId,
      senderId: currentUserId,
      senderName: currentUserName,
      senderRole: currentUserRole,
      message: cleanMsg,
      timestamp: new Date().toISOString()
    };

    // Save user message to Firestore chat to preserve history
    try {
      await sendReviewChatMessageApi(activeShareId, cleanMsg, {
        userId: currentUserId,
        name: currentUserName,
        role: currentUserRole
      });
    } catch (e) {
      // Local fallback handled inside API, append to state in case Firestore offline
      setMessages(prev => [...prev, userMsg]);
    }

    setInputText('');
    setIsSending(false);
    setIsStreamingAI(true);
    setStreamingText('');

    // Compile review context to ground the AI model
    const reviewContext = {
      periodLabel: shareRecord?.periodLabel || "This Week's Review",
      journal: journalNotes,
      transactionsCount,
      commentsCount
    };

    // Prepare history for Gemini
    const chatHistoryForAI = [...messages, userMsg];

    try {
      await streamAIAssistantResponse(
        activeShareId,
        cleanMsg,
        chatHistoryForAI,
        reviewContext,
        (chunk) => {
          setStreamingText(prev => prev + chunk);
        }
      );
    } catch (error) {
      console.error("AI Streaming failed:", error);
    } finally {
      setIsStreamingAI(false);
      // Persist the complete AI streamed message to Firestore
      setStreamingText((finalText) => {
        if (finalText.trim()) {
          sendReviewChatMessageApi(activeShareId, finalText, {
            userId: 'gemini-ai-advisor-uid',
            name: 'Imani AI Advisor',
            role: 'assistant'
          }).catch(console.error);
        }
        return '';
      });
      if (onCommentsUpdated) {
        onCommentsUpdated();
      }
    }
  };

  // Peer-to-peer sending handler
  const handlePeerSend = async () => {
    if (!inputText.trim() || isSending) return;
    setIsSending(true);

    try {
      await sendReviewChatMessageApi(activeShareId, inputText, {
        userId: currentUserId,
        name: currentUserName,
        role: currentUserRole
      });
      setInputText('');
    } catch (error: any) {
      toast({
        title: "Send Failed",
        description: error.message || "Unable to send message.",
        variant: "destructive"
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = () => {
    if (chatMode === 'ai') {
      handleAISend(inputText);
    } else {
      handlePeerSend();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  return (
    <Card className="border border-border/40 bg-card/60 backdrop-blur-sm shadow-sm rounded-2xl flex flex-col h-[580px] overflow-hidden">
      {/* Tab Switcher & Status Header */}
      <CardHeader className="p-4 border-b border-border/30 bg-muted/20 flex flex-row items-center justify-between shrink-0 space-y-0">
        <div className="flex items-center gap-2">
          {chatMode === 'ai' ? (
            <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
          ) : (
            <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-500">
              <Users className="h-4 w-4" />
            </div>
          )}
          <div>
            <CardTitle className="text-sm font-bold text-foreground">
              {chatMode === 'ai' ? 'Imani AI Advisor' : 'Collaborator Chat'}
            </CardTitle>
            <CardDescription className="text-[10px] text-muted-foreground flex items-center gap-1">
              {isOnline ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" /> Live Streaming Active
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 text-amber-500" /> Offline mode (Auto-cached)
                </>
              )}
            </CardDescription>
          </div>
        </div>

        {/* Navigation Mode Bar */}
        <div className="flex bg-muted p-1 rounded-xl items-center border border-border/40 gap-1">
          <Button
            variant={chatMode === 'ai' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setChatMode('ai')}
            className={cn(
              "h-7 rounded-lg text-[10px] px-2.5 font-semibold transition-all",
              chatMode === 'ai' && "bg-background text-foreground shadow-sm hover:bg-background"
            )}
          >
            <Sparkles className="mr-1 h-3 w-3 text-primary" /> AI Advisor
          </Button>
          <Button
            variant={chatMode === 'peer' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              if (!shareRecord) {
                toast({
                  title: "Sharing Not Active",
                  description: "Please share this review using the Share dialog first to engage in collaborator chat.",
                  variant: "default"
                });
                return;
              }
              setChatMode('peer');
            }}
            className={cn(
              "h-7 rounded-lg text-[10px] px-2.5 font-semibold transition-all",
              chatMode === 'peer' && "bg-background text-foreground shadow-sm hover:bg-background",
              !shareRecord && "opacity-50 cursor-not-allowed"
            )}
          >
            <Users className="mr-1 h-3 w-3 text-sky-500" /> Peer Discussion
          </Button>
        </div>
      </CardHeader>

      {/* Message Feed Canvas */}
      <CardContent className="flex-grow p-4 overflow-hidden relative bg-background/20">
        <ScrollArea className="h-full w-full pr-2">
          <div className="space-y-4 pb-4">
            {/* Header Greeting or Empty Alert */}
            {messages.length === 0 && !streamingText && (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4 space-y-3">
                {chatMode === 'ai' ? (
                  <>
                    <div className="p-3 bg-primary/10 rounded-full text-primary">
                      <Sparkles className="h-6 w-6 animate-pulse" />
                    </div>
                    <div className="space-y-1 max-w-xs">
                      <p className="text-xs font-bold text-foreground">Imani AI Financial Coach</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        I am your private financial assistant. Select one of the quick suggestions below or write a query to audit this week's review.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="p-3 bg-sky-500/10 rounded-full text-sky-500">
                      <Users className="h-6 w-6" />
                    </div>
                    <div className="space-y-1 max-w-xs">
                      <p className="text-xs font-bold text-foreground">Peer-to-Peer Collab Room</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        No messages in this review yet. Exchange instant comments, coordinate payment adjustments, and verify ledger lines here in real-time.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Message Stream */}
            {messages.map((msg) => {
              const isMe = msg.senderId === currentUserId;
              const isAI = msg.senderId === 'gemini-ai-advisor-uid' || msg.senderRole === 'assistant';

              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-2.5 max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300",
                    isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}
                >
                  <Avatar className={cn(
                    "h-7 w-7 border shrink-0 text-[10px] font-bold rounded-xl",
                    isAI ? "bg-primary/10 text-primary border-primary/20" : isMe ? "bg-sky-500/10 text-sky-600 border-sky-500/20" : "bg-muted text-muted-foreground"
                  )}>
                    <AvatarFallback className="rounded-xl">
                      {isAI ? '🤖' : getInitials(msg.senderName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-1.5">
                    {/* Message Bubble Metadata */}
                    <div className={cn(
                      "flex items-center gap-1.5 text-[9px] text-muted-foreground",
                      isMe && "justify-end"
                    )}>
                      <span className="font-semibold text-foreground/80">{isAI ? 'Imani AI Advisor' : msg.senderName}</span>
                      <span>•</span>
                      <span>{format(new Date(msg.timestamp), 'h:mm a')}</span>
                    </div>

                    {/* Chat Bubble Body */}
                    <div className={cn(
                      "p-3 rounded-2xl text-[11px] leading-relaxed select-text whitespace-pre-wrap break-words border",
                      isAI 
                        ? "bg-primary/5 text-foreground/90 border-primary/10 rounded-tl-none font-sans" 
                        : isMe 
                          ? "bg-sky-500 text-white border-sky-600/10 rounded-tr-none shadow-sm font-medium" 
                          : "bg-muted/75 text-foreground/90 border-border/40 rounded-tl-none"
                    )}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Streaming UI text */}
            {isStreamingAI && streamingText && (
              <div className="flex gap-2.5 max-w-[85%] mr-auto animate-in fade-in duration-100">
                <Avatar className="h-7 w-7 border bg-primary/10 text-primary border-primary/20 rounded-xl shrink-0 text-[10px] font-bold">
                  <AvatarFallback className="rounded-xl">🤖</AvatarFallback>
                </Avatar>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                    <span className="font-semibold text-primary">Imani AI Advisor</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 text-primary animate-pulse">
                      <Loader2 className="h-2 w-2 animate-spin" /> Streaming...
                    </span>
                  </div>
                  <div className="p-3 rounded-2xl text-[11px] leading-relaxed select-text whitespace-pre-wrap break-words border bg-primary/5 text-foreground/90 border-primary/10 rounded-tl-none font-sans shadow-sm">
                    {streamingText}
                    <span className="inline-block h-3 w-1.5 ml-0.5 bg-primary/60 animate-pulse" />
                  </div>
                </div>
              </div>
            )}
          </div>
          <div ref={scrollRef} />
        </ScrollArea>
      </CardContent>

      {/* Suggestion & Input Panel */}
      <CardFooter className="p-3 border-t border-border/30 bg-muted/10 flex flex-col gap-2 shrink-0">
        {/* Suggestion Chips */}
        {chatMode === 'ai' && messages.length === 0 && !isStreamingAI && (
          <div className="w-full flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar shrink-0">
            {suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => handleAISend(s.prompt)}
                disabled={isSending || isStreamingAI}
                className="text-[10px] font-semibold bg-background hover:bg-primary/5 hover:text-primary transition-all border border-border/40 hover:border-primary/20 px-2.5 py-1 rounded-xl whitespace-nowrap text-muted-foreground"
              >
                {s.text}
              </button>
            ))}
          </div>
        )}

        {/* Input Text Box */}
        <div className="w-full relative flex items-center gap-2">
          <Textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              chatMode === 'ai' 
                ? "Ask AI Coach..." 
                : "Type message to collaborator..."
            }
            className="flex-grow h-10 min-h-10 max-h-20 pr-12 text-[11px] rounded-xl border-border/40 bg-background/80 resize-none focus-visible:ring-primary py-2.5 line-clamp-2 focus-visible:bg-background"
            disabled={isSending || isStreamingAI}
          />
          <div className="absolute right-2.5 top-1.5 flex items-center gap-1">
            <Button
              size="icon"
              onClick={handleSendMessage}
              disabled={!inputText.trim() || isSending || isStreamingAI}
              className="h-7 w-7 rounded-lg bg-primary hover:bg-primary/90 text-primary-content shrink-0 shadow-sm transition-all"
            >
              {isSending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
