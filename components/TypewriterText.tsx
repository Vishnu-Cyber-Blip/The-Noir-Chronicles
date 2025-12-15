import React, { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({ 
  text, 
  speed = 30, 
  onComplete,
  className = "" 
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const indexRef = useRef(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset when text changes
    setDisplayedText('');
    indexRef.current = 0;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const typeChar = () => {
      if (indexRef.current < text.length) {
        setDisplayedText((prev) => prev + text.charAt(indexRef.current));
        indexRef.current++;
        // Randomize speed slightly for human feel
        const randomSpeed = speed + (Math.random() * 20 - 10); 
        timeoutRef.current = window.setTimeout(typeChar, Math.max(5, randomSpeed));
      } else {
        if (onComplete) onComplete();
      }
    };

    timeoutRef.current = window.setTimeout(typeChar, speed);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [text, speed, onComplete]);

  // Use a span with a whitespace-pre-wrap to preserve newlines
  return (
    <div className={`whitespace-pre-wrap leading-relaxed ${className}`}>
      {displayedText}
      <span className="animate-pulse inline-block w-2 h-4 bg-zinc-500 ml-1 align-middle"></span>
    </div>
  );
};