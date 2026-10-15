import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Send, User, Bot, Loader2, MessageSquareText } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';

export default function NLQuery() {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: "Hello! I am AuditIQ's AI assistant. Ask me anything about your current audit dataset anomalies, risk scores, or specific transactions." }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e) => {
        e?.preventDefault();
        if (!input.trim() || loading) return;

        const userMessage = input.trim();
        setInput('');
        
        // Add user message
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setLoading(true);

        try {
            const response = await axios.post('http://localhost:8000/nlquery/ask', {
                question: userMessage
            });
            
            // Add assistant response
            setMessages(prev => [...prev, { role: 'assistant', content: response.data.answer }]);
        } catch (error) {
            console.error("Error asking question:", error);
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: "I encountered an error trying to process your request. Please ensure the backend is running and xAI/Grok API credentials are configured correctly." 
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <PageWrapper title="Natural Language Query">
            <div className="h-full flex flex-col pt-4 max-w-5xl mx-auto w-full">
                <div className="mb-4">
                    <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                        <MessageSquareText className="text-auditiq-teal" />
                        Audit Assistant
                    </h2>
                    <p className="text-sm text-auditiq-muted mt-1">
                        Interact with your audit data directly using natural language queries powered by grok-2.
                    </p>
                </div>

                {/* Chat Container */}
                <div className="flex-1 bg-auditiq-card border border-auditiq-border rounded-xl  overflow-hidden flex flex-col shadow-lg relative">
                    
                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar">
                        {messages.map((msg, index) => (
                            <div 
                                key={index} 
                                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                            >
                                {/* Avatar */}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                    msg.role === 'user' ? 'bg-auditiq-blue text-white' : 'bg-auditiq-teal text-gray-900'
                                }`}>
                                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                </div>

                                {/* Bubble */}
                                <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${
                                    msg.role === 'user' 
                                        ? 'bg-auditiq-blue text-white rounded-tr-sm' 
                                        : 'bg-[#1E2D45] text-auditiq-text rounded-tl-sm border border-white/5'
                                }`}>
                                    {msg.role === 'user' ? (
                                        <p className="whitespace-pre-wrap m-0 text-sm leading-relaxed">{msg.content}</p>
                                    ) : (
                                        <div className="prose prose-invert prose-sm max-w-none 
                                            prose-p:leading-relaxed prose-p:my-1
                                            prose-a:text-auditiq-teal hover:prose-a:text-[#00D4DE]
                                            prose-code:bg-black/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                                            prose-pre:bg-black/40 prose-pre:p-3 prose-pre:rounded-lg
                                            prose-ul:my-2 prose-li:my-0.5
                                            prose-headings:text-white prose-headings:font-medium prose-h3:text-sm prose-h3:mt-3 prose-h3:mb-1"
                                        >
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {/* Loading Indicator */}
                        {loading && (
                            <div className="flex gap-4 flex-row">
                                <div className="w-8 h-8 rounded-full bg-auditiq-teal text-gray-900 flex items-center justify-center flex-shrink-0">
                                    <Bot size={16} />
                                </div>
                                <div className="bg-[#1E2D45] rounded-2xl rounded-tl-sm px-5 py-4 border border-white/5 flex items-center gap-2">
                                    <span className="flex gap-1">
                                        <span className="w-2 h-2 bg-auditiq-teal rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="w-2 h-2 bg-auditiq-teal rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="w-2 h-2 bg-auditiq-teal rounded-full animate-bounce"></span>
                                    </span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-auditiq-border bg-[#0A0F1A]/50">
                        <form 
                            onSubmit={handleSend}
                            className="flex gap-3 bg-[#161B27] border border-auditiq-border rounded-xl p-2 focus-within:ring-1 focus-within:ring-auditiq-teal focus-within:border-auditiq-teal transition-all"
                        >
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask about anomalies, high-risk vendors, or specific patterns..."
                                className="w-full bg-transparent border-none text-white text-sm placeholder-gray-500 focus:outline-none resize-none pt-2 px-3 h-10 custom-scrollbar"
                                rows={1}
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || loading}
                                className="w-10 h-10 flex-shrink-0 bg-auditiq-teal hover:bg-[#00D4DE] text-gray-900 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Send size={18} className={input.trim() && !loading ? "ml-0.5" : ""} />
                            </button>
                        </form>
                        <div className="text-center mt-2">
                            <span className="text-[10px] text-auditiq-muted">
                                AuditIQ's AI can make mistakes. Verify critical analytical findings before proceeding.
                            </span>
                        </div>
                    </div>

                </div>
            </div>
        </PageWrapper>
    );
}
