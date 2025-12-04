
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { getChatbotResponse, resetChatSession } from '../services/geminiService';
import { SendIcon, TrashIcon } from '../components/icons/Icons';

const AIChatbot: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      text: 'Xin chào! Tôi có thể giúp gì cho bạn về việc hiến máu hôm nay?',
      sender: 'bot',
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Reset the AI session when entering the page to ensure context matches the visible UI
    resetChatSession();
    scrollToBottom();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      text: input,
      sender: 'user',
    };
    
    // Add user message and a placeholder for bot loading state
    setMessages(prev => [
        ...prev, 
        userMessage, 
        {id: Date.now()+1, text: '', sender: 'bot', isLoading: true}
    ]);
    setInput('');
    setIsLoading(true);

    const botResponseText = await getChatbotResponse(input);

    const botMessage: ChatMessage = {
      id: Date.now() + 2,
      text: botResponseText,
      sender: 'bot',
    };
    
    // Remove loading message and add real response
    setMessages(prev => [
        ...prev.filter(m => !m.isLoading),
        botMessage
    ]);
    setIsLoading(false);
  };

  const handleClearChat = () => {
      resetChatSession();
      setMessages([{
        id: Date.now(),
        text: 'Xin chào! Tôi có thể giúp gì cho bạn về việc hiến máu hôm nay?',
        sender: 'bot',
      }]);
  };

  return (
    <div className="p-4 md:p-8 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Trợ lý AI</h1>
            <p className="text-gray-600 text-sm md:text-base hidden md:block">Sử dụng giao diện này để kiểm tra và đảm bảo chất lượng phản hồi của trợ lý AI.</p>
        </div>
        <button 
            onClick={handleClearChat}
            className="flex items-center text-sm font-medium text-gray-500 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-200 px-3 py-2 rounded-lg transition-colors shadow-sm"
            title="Làm mới đoạn chat"
        >
            <TrashIcon className="w-4 h-4 mr-2" />
            Làm mới
        </button>
      </div>
      
      <div className="flex-1 bg-white rounded-lg shadow-md flex flex-col overflow-hidden border border-gray-100">
        <div className="flex-1 p-6 space-y-4 overflow-y-auto custom-scrollbar bg-gray-50/30">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex items-end gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
              {msg.sender === 'bot' && <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">AI</div>}
              <div className={`px-4 py-3 rounded-2xl max-w-lg shadow-sm ${msg.sender === 'user' ? 'bg-red-500 text-white rounded-br-none' : 'bg-white text-gray-800 rounded-bl-none border border-gray-100'}`}>
                {msg.isLoading ? (
                    <div className="flex items-center space-x-2 py-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 border-t border-gray-100 bg-white">
          <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Đặt câu hỏi về hiến máu..."
              className="flex-1 p-3 border border-gray-200 rounded-full focus:ring-2 focus:ring-red-500 focus:outline-none transition-all shadow-sm bg-gray-50 focus:bg-white"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading}
              className="bg-red-500 text-white rounded-full p-3 hover:bg-red-600 disabled:bg-red-300 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AIChatbot;
