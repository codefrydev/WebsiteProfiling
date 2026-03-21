import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Copy, Check, Zap, FileCode, Link2, RotateCcw, Target, TrendingUp, AlertCircle, Loader2 } from 'lucide-react';
import { PageLayout, PageHeader, Card, Button, Badge } from '../components';
import { useApi } from '../context/ApiContext';
import { api } from '../lib/api';

const QUICK_ACTIONS = [
  { id: 'diagnose', label: 'Diagnose Site Issues', icon: AlertCircle, prompt: 'Analyze the current site audit data and provide a prioritized list of the most critical SEO issues to fix, with detailed explanations and action steps.' },
  { id: 'strategy', label: 'Generate SEO Strategy', icon: Target, prompt: 'Based on the site data available, create a comprehensive 90-day SEO strategy with specific, actionable milestones and expected outcomes.' },
  { id: 'robots', label: 'Generate Robots.txt', icon: FileCode, prompt: 'Generate an optimized robots.txt file for this website. Include rules for common crawlers, disallow unnecessary paths, and ensure crawl budget is used efficiently.' },
  { id: 'schema', label: 'Create Schema Markup', icon: FileCode, prompt: 'Generate appropriate JSON-LD schema markup for the homepage of this site. Include Organization, WebSite, and BreadcrumbList schemas.' },
  { id: 'redirects', label: 'Suggest Redirects', icon: Link2, prompt: 'Review the broken URLs from the site audit and suggest 301 redirect mappings to the most relevant existing pages.' },
  { id: 'internal-links', label: 'Internal Link Opportunities', icon: Link2, prompt: 'Analyze the site structure and suggest internal linking opportunities that would improve PageRank distribution and user experience.' },
  { id: 'content-gaps', label: 'Content Gap Analysis', icon: TrendingUp, prompt: 'Based on the keywords and content data available, identify the top content gaps and suggest new content topics that would drive organic traffic.' },
  { id: 'meta-tags', label: 'Optimize Meta Tags', icon: Zap, prompt: 'Review the pages with missing or poorly optimized title tags and meta descriptions. Provide optimized versions following SEO best practices.' },
];

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="p-1.5 rounded hover:bg-brand-700 text-slate-500 hover:text-slate-300 transition-colors" title="Copy">
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  const content = msg.content || '';

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1], content: match[2].trim() });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 ${isUser ? 'bg-blue-600' : 'bg-purple-700'}`}>
        {isUser ? <span className="text-xs font-bold text-white">You</span> : <Bot className="h-4 w-4 text-white" />}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        {parts.map((part, i) =>
          part.type === 'code' ? (
            <div key={i} className="w-full rounded-lg overflow-hidden border border-slate-700">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-700">
                <span className="text-xs text-slate-500 font-mono">{part.lang || 'code'}</span>
                <CopyButton text={part.content} />
              </div>
              <pre className="p-3 bg-slate-950 text-xs font-mono text-green-300 overflow-x-auto whitespace-pre-wrap break-words">
                {part.content}
              </pre>
            </div>
          ) : (
            <div
              key={i}
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                isUser
                  ? 'bg-blue-600 text-white rounded-tr-sm'
                  : 'bg-brand-800 text-slate-200 border border-muted rounded-tl-sm'
              }`}
            >
              {part.content}
            </div>
          )
        )}
        <span className="text-[10px] text-slate-600 px-1">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

export default function AiAssistant() {
  const { isConnected, currentProject } = useApi();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm your AI SEO Assistant. I can help you analyze your site data, generate technical SEO assets, create content strategies, and answer any SEO questions. What would you like to work on today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content) => {
    if (!content.trim() || loading) return;
    const userMsg = { role: 'user', content: content.trim(), timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await api.post('/content/ai/chat', {
        messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
        context: { project: currentProject },
      });
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.reply || res.response || res.content || 'No response received.', timestamp: new Date().toISOString() },
      ]);
    } catch (e) {
      const errorMsg = e.message?.includes('API key') || e.message?.includes('401')
        ? "No AI API key configured. Go to **Settings → API Keys** and add your OpenAI or Anthropic API key to enable AI features."
        : `Sorry, I encountered an error: ${e.message}`;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: errorMsg, timestamp: new Date().toISOString() },
      ]);
      if (e.message?.includes('API key')) setHasApiKey(false);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuickAction = (action) => {
    sendMessage(action.prompt);
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: "Chat cleared. How can I help you with SEO today?",
      timestamp: new Date().toISOString(),
    }]);
  };

  if (!isConnected) {
    return (
      <PageLayout>
        <PageHeader title="AI Assistant" subtitle="AI-powered SEO advisor and content generator" />
        <Card shadow className="p-8 text-center">
          <Bot className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">Backend not connected</p>
          <p className="text-slate-500 text-sm mt-1">Start the backend to use AI features:</p>
          <code className="mt-3 inline-block bg-brand-900 px-4 py-2 rounded text-sm font-mono text-green-400">
            uvicorn backend.app.main:app --reload
          </code>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 px-6 pt-6">
        <div>
          <h1 className="text-xl font-bold text-bright flex items-center gap-2">
            <Bot className="h-6 w-6 text-purple-400" /> AI SEO Assistant
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Powered by OpenAI / Anthropic • {currentProject ? `Project: ${currentProject.name}` : 'No project selected'}</p>
        </div>
        <div className="flex items-center gap-2">
          {!hasApiKey && (
            <Badge variant="high" label="No API Key" />
          )}
          <Button variant="ghost" onClick={clearChat} className="text-xs">
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 min-h-0 px-6 pb-6">
        {/* Quick Actions Sidebar */}
        <div className="w-56 shrink-0 flex flex-col gap-2">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Quick Actions</p>
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleQuickAction(action)}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-brand-800 border border-muted text-sm text-slate-400 hover:text-slate-200 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all text-left disabled:opacity-50"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                <span className="text-xs leading-tight">{action.label}</span>
              </button>
            );
          })}
          {!hasApiKey && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400 font-medium mb-1">API Key Required</p>
              <p className="text-xs text-slate-500">Add OpenAI or Anthropic key in Settings to enable AI features.</p>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-h-0 rounded-xl bg-brand-800 border border-muted overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-700 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div className="bg-brand-800 border border-muted rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  <span className="text-sm text-slate-500">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-muted p-3">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
                placeholder="Ask anything about SEO, your site data, or request content..."
                disabled={loading}
                className="flex-1 bg-brand-900 border border-default focus:border-blue-500 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 outline-none transition-all disabled:opacity-50"
              />
              <Button
                variant="primary"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-slate-600 mt-2 text-center">
              Press Enter to send • Context includes current project data
            </p>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
