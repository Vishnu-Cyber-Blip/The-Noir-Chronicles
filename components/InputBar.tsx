import React, { useState, useEffect, useRef } from 'react';
import { SpeechRecognition, SpeechRecognitionEvent, SpeechRecognitionErrorEvent } from '../types';

interface InputBarProps {
  onSubmit: (text: string) => void;
  isProcessing: boolean;
  placeholder?: string;
}

export const InputBar: React.FC<InputBarProps> = ({ onSubmit, isProcessing, placeholder = "Speak or type..." }) => {
  const [inputValue, setInputValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false; // Stop after one sentence for game flow
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
             // Show interim results if desired, but we'll stick to updating input value
             setInputValue(event.results[i][0].transcript);
          }
        }
        if (finalTranscript) {
           setInputValue(finalTranscript);
           // Optional: Auto-submit on final voice result? 
           // Let's let the user confirm or wait a beat. 
           // For better UX, let's auto submit after a short pause if user doesn't edit.
           // Actually, let's keep it manual submit or explicit Enter to avoid accidents.
           // But user asked for "voice recognition feature... story shud adopt".
           // To make it seamless, we stop listening and update the input.
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      setInputValue('');
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inputValue.trim() && !isProcessing) {
      onSubmit(inputValue.trim());
      setInputValue('');
    }
  };

  return (
    <div className="fixed bottom-0 left-0 w-full bg-zinc-950 border-t border-zinc-800 p-4 z-40">
      <div className="max-w-3xl mx-auto flex items-center gap-4">
        
        {/* Voice Toggle */}
        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`p-3 rounded-full transition-all duration-300 ${
            isListening 
              ? 'bg-red-900 text-white animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.5)]' 
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title="Toggle Voice Input"
        >
          {isListening ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          )}
        </button>

        {/* Input Field */}
        <form onSubmit={handleSubmit} className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isProcessing}
            placeholder={isListening ? "Listening..." : placeholder}
            className="w-full bg-zinc-900 text-zinc-100 font-mono text-sm sm:text-base p-3 border border-zinc-700 rounded focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all placeholder:text-zinc-600 disabled:opacity-50"
            autoFocus
          />
          {inputValue && (
            <button 
                type="submit" 
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-zinc-400 hover:text-white"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
            </button>
          )}
        </form>

      </div>
    </div>
  );
};