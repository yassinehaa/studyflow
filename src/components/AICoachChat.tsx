import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BrainCircuit, Send, User, Bot, Sparkles, Loader2, MessageSquare, X, Maximize2, Minimize2 } from 'lucide-react';
import { callGroq } from '../groq';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AICoachChatProps {
  optimizerData: any;
  initialAdvice?: string;
}

export function AICoachChat({ optimizerData, initialAdvice }: AICoachChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialAdvice && messages.length === 0) {
      setMessages([{ role: 'assistant', content: initialAdvice }]);
    }
  }, [initialAdvice]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const apiKey = process.env.VITE_GROQ_API_KEY;
      if (!apiKey) {
        setMessages(prev => [...prev, { role: 'assistant', content: "Error: VITE_GROQ_API_KEY is not configured in environment variables." }]);
        return;
      }

      // Prepare rich context including topic-level detail
      const topicDetails = optimizerData?.scoredTopics?.map((t: any) => ({
        name: t.name,
        subject: t.subject_name,
        mastery: Math.round(((t.studied_minutes || 0) / (t.required_minutes || 1)) * 100),
        quizScore: t.mastery_score || 0,
        remainingMinutes: Math.round(t.remaining_minutes || 0),
        difficulty: t.difficulty,
        predictedCompletion: t.predicted_completion_date,
        lastStudied: t.last_studied_at,
      }));

      const context = `You are the Adaptive Strategy Coach for a student. 
You have full access to their study data:
- Subjects: ${JSON.stringify(optimizerData?.subjects?.map((s: any) => ({ name: s.name, examDate: s.exam_date })))}
- Risk Analysis: ${JSON.stringify(optimizerData?.risks)}
- Today's Plan: ${JSON.stringify(optimizerData?.todayPlan)}
- All Topics (with mastery & quiz scores): ${JSON.stringify(topicDetails)}

Current Time: ${new Date().toLocaleString()}

IMPORTANT: Keep every reply to 2-3 sentences maximum. Be punchy and direct. Use bold for emphasis instead of long paragraphs. If they ask about a specific subject or topic, use the data above.
MANDATORY: Respond in the exact same language as the user's latest query/message. Do not translate terms unnecessarily unless the user asked you to.`;

      const groqMessages = [
        { role: 'system' as const, content: context },
        ...messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        { role: 'user' as const, content: userMessage }
      ];

      const assistantMessage = await callGroq(groqMessages, {
        temperature: 0.7
      });

      setMessages(prev => [...prev, { role: 'assistant', content: assistantMessage || "I'm sorry, I couldn't process that request." }]);
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error while thinking. Please check your VITE_GROQ_API_KEY configuration." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isExpanded) {
    return (
      <motion.div
        layoutId="ai-coach"
        className="bg-zinc-950 text-white border-none shadow-2xl shadow-zinc-900/40 p-12 rounded-[3rem] relative overflow-hidden group cursor-pointer"
        onClick={() => setIsExpanded(true)}
      >
        <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-500">
          <BrainCircuit size={120} />
        </div>
        <div className="relative z-10 space-y-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl">
              <BrainCircuit className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="font-black text-xl tracking-tight">Adaptive Strategy Coach</h3>
          </div>
          <div className="space-y-6">
            <p className="text-zinc-400 leading-relaxed text-lg font-medium italic">
              "{messages[messages.length - 1]?.content || initialAdvice || "Analyzing your study patterns to provide personalized strategy..."}"
            </p>
            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-white/20 uppercase font-black tracking-[0.3em]">Interactive AI Coach</p>
                <Sparkles size={12} className="text-emerald-500 animate-pulse" />
              </div>
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                Click to chat <MessageSquare size={14} />
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  const containerClasses = isFullscreen
    ? "fixed inset-0 z-[70] bg-zinc-950 text-white flex flex-col"
    : "bg-zinc-950 text-white border-none shadow-2xl shadow-zinc-900/40 rounded-[3rem] relative overflow-hidden flex flex-col h-[600px]";

  return (
    <motion.div
      layoutId="ai-coach"
      className={containerClasses}
    >
      {/* Header */}
      <div className={cn("p-8 border-b border-white/10 flex items-center justify-between bg-zinc-900/50 backdrop-blur-xl", isFullscreen && "rounded-none")}>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 rounded-2xl">
            <BrainCircuit className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-black text-xl tracking-tight">AI Study Coach</h3>
            <p className="text-[10px] text-white/40 uppercase font-black tracking-[0.2em]">Llama 3.1 8B Powered</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-zinc-400 hover:text-white"
            title={isFullscreen ? "Exit fullscreen" : "Enlarge"}
          >
            {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
          </button>
          <button
            onClick={() => { setIsExpanded(false); setIsFullscreen(false); }}
            className="p-3 hover:bg-white/10 rounded-2xl transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-4 max-w-[85%]",
              msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0",
              msg.role === 'user' ? "bg-zinc-800" : "bg-emerald-500/20"
            )}>
              {msg.role === 'user' ? <User size={18} /> : <Bot size={18} className="text-emerald-400" />}
            </div>
            <div className={cn(
              "p-6 rounded-[2rem] text-sm leading-relaxed",
              msg.role === 'user' ? "bg-zinc-800 text-white rounded-tr-none" : "bg-white/5 text-zinc-300 rounded-tl-none"
            )}>
              <div className="markdown-body prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
              <Loader2 size={18} className="text-emerald-400 animate-spin" />
            </div>
            <div className="p-6 bg-white/5 rounded-[2rem] rounded-tl-none">
              <div className="flex gap-1">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-8 bg-zinc-900/50 border-t border-white/10">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask your coach anything..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-zinc-600"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 p-2.5 bg-emerald-500 text-zinc-950 rounded-xl hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 transition-all"
          >
            <Send size={18} />
          </button>
        </div>
        <p className="mt-4 text-[10px] text-zinc-500 text-center uppercase font-bold tracking-widest">
          The coach has full context of your curriculum and risks
        </p>
      </div>
    </motion.div>
  );
}
