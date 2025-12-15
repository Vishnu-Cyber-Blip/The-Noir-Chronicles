import React, { useState, useEffect, useRef, useCallback } from 'react';
import { initializeGemini, startNewStory, generateNextEntry, generateCaseSummary, fetchWorldNews } from './services/geminiService';
import { InputBar } from './components/InputBar';
import { TypewriterText } from './components/TypewriterText';
import { DiaryEntry, GameState, GameSettings, CharacterStats, GameCharacter, Achievement, SaveData } from './types';

// Constants
const DEFAULT_PREMISE = "You are a private investigator in a city that never sleeps. It's 3 AM, raining, and you just found something you shouldn't have.";
const SAVE_KEY = 'noir_chronicles_save';

// Extracted Components
interface ModalOverlayProps {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({ title, children, onClose }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 fade-enter-active" onClick={onClose}>
    <div className="bg-zinc-950 border border-zinc-800 w-full max-w-lg p-6 relative shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-2 flex-shrink-0">
        <h3 className="text-zinc-200 text-sm tracking-[0.3em] uppercase font-bold">{title}</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div className="overflow-y-auto scrollbar-hide flex-1 pr-2">
        {children}
      </div>
    </div>
  </div>
);

const AchievementToast = ({ achievement }: { achievement: Achievement }) => (
  <div className="fixed top-24 right-6 z-50 bg-zinc-900 border border-yellow-900/50 p-4 shadow-[0_0_15px_rgba(0,0,0,0.8)] max-w-xs animate-slide-in">
     <div className="text-yellow-600 text-[10px] uppercase tracking-widest mb-1">Achievement Unlocked</div>
     <div className="text-zinc-100 font-bold text-sm mb-1">{achievement.title}</div>
     <div className="text-zinc-500 text-xs italic">{achievement.description}</div>
  </div>
);

function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [premise, setPremise] = useState(DEFAULT_PREMISE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Game Data
  const [userApiKey, setUserApiKey] = useState('');
  const [stats, setStats] = useState<CharacterStats>({ health: 100, resolve: 100, suspicion: 0 });
  const [inventory, setInventory] = useState<string[]>([]);
  const [characters, setCharacters] = useState<GameCharacter[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [recentAchievement, setRecentAchievement] = useState<Achievement | null>(null);
  
  // UI State
  const [shake, setShake] = useState(false);
  const [activeModal, setActiveModal] = useState<'inventory' | 'characters' | 'storyline' | 'news' | null>(null);
  const [caseSummary, setCaseSummary] = useState<string | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  
  // News State
  const [newsContent, setNewsContent] = useState<string | null>(null);
  const [newsSources, setNewsSources] = useState<any[]>([]);
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  
  // TV / Start Screen State
  const [tvChannel, setTvChannel] = useState<'MENU' | 'CONFIG' | 'TIMELINE' | 'SETUP' | 'ERASE_CONFIRM'>('MENU');
  const [hasSave, setHasSave] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Settings
  const [settings, setSettings] = useState<GameSettings>({
    textSize: 'base',
    typingSpeed: 25
  });

  // Auto-scroll
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (process.env.API_KEY) {
      initializeGemini(process.env.API_KEY);
    }
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) setHasSave(true);
  }, []);

  useEffect(() => {
    if (gameState === GameState.PLAYING) {
        setTimeout(() => {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }
  }, [entries, gameState]);

  // Handle Achievement Toast
  useEffect(() => {
    if (recentAchievement) {
      const timer = setTimeout(() => setRecentAchievement(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [recentAchievement]);

  // Shake effect
  useEffect(() => {
      if (entries.length > 0) {
          const lastEntry = entries[entries.length - 1];
          if (!lastEntry.isUserAction) {
              const keywords = ['shot', 'blood', 'scream', 'dead', 'pain', 'gun', 'kill', 'danger', 'run'];
              if (keywords.some(k => lastEntry.text.toLowerCase().includes(k))) {
                  setShake(true);
                  setTimeout(() => setShake(false), 500);
              }
          }
      }
  }, [entries]);

  // Loading Animation Logic
  useEffect(() => {
    if (gameState === GameState.LOADING_ANIMATION) {
        const interval = setInterval(() => {
            setLoadingProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setGameState(GameState.PLAYING);
                    return 100;
                }
                return prev + Math.floor(Math.random() * 15) + 5;
            });
        }, 200);
        return () => clearInterval(interval);
    }
  }, [gameState]);

  // --- SAVE / LOAD SYSTEM ---

  const handleSave = () => {
    const data: SaveData = {
        entries,
        stats,
        inventory,
        characters,
        achievements,
        premise,
        timestamp: new Date().toLocaleString()
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    setHasSave(true);
    alert("Progress Saved to Tape.");
  };

  const handleLoad = () => {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return;
        const data: SaveData = JSON.parse(raw);
        setEntries(data.entries);
        setStats(data.stats);
        setInventory(data.inventory);
        setCharacters(data.characters);
        setAchievements(data.achievements);
        setPremise(data.premise);
        
        // Skip setup, go straight to loading
        setGameState(GameState.LOADING_ANIMATION);
    } catch (e) {
        console.error("Save file corrupted");
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
    }
  };

  const handleDeleteSave = () => {
    setTvChannel('ERASE_CONFIRM');
  };
  
  const confirmDelete = () => {
      localStorage.removeItem(SAVE_KEY);
      setHasSave(false);
      setTvChannel('MENU');
  };

  // --- GAME LOGIC ---

  const prepareNewGame = () => {
    setTvChannel('SETUP');
    setErrorMsg(null);
  };

  const startInvestigation = async () => {
    setIsProcessing(true);
    setErrorMsg(null);

    // Prioritize Env Key, then User Key
    const keyToUse = process.env.API_KEY || userApiKey;

    if (!keyToUse.trim()) {
        setErrorMsg("API Key Missing. Check Config Channel.");
        setIsProcessing(false);
        return;
    }

    initializeGemini(keyToUse);

    try {
      const response = await startNewStory(premise);
      setStats(response.stats);
      setInventory(response.inventory);
      setCharacters(response.characters || []);
      setAchievements([]); 
      
      const newEntry: DiaryEntry = {
        id: Date.now().toString(),
        text: response.narrative,
        timestamp: new Date().toLocaleTimeString(),
        isUserAction: false
      };
      setEntries([newEntry]);
      
      setGameState(GameState.LOADING_ANIMATION);

    } catch (e) {
      console.error(e);
      setErrorMsg("Signal Lost. Check Connection.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUserAction = useCallback(async (actionText: string) => {
    const userEntry: DiaryEntry = {
      id: `user-${Date.now()}`,
      text: `> ${actionText}`,
      timestamp: new Date().toLocaleTimeString(),
      isUserAction: true
    };
    
    setEntries(prev => [...prev, userEntry]);
    setIsProcessing(true);

    try {
      const response = await generateNextEntry(actionText, stats, inventory, characters);
      setStats(response.stats);
      setInventory(response.inventory);
      if (response.characters) setCharacters(response.characters);
      
      if (response.new_achievements && response.new_achievements.length > 0) {
        const uniqueNew = response.new_achievements.filter(na => !achievements.some(a => a.id === na.id));
        if (uniqueNew.length > 0) {
          setAchievements(prev => [...prev, ...uniqueNew]);
          setRecentAchievement(uniqueNew[0]);
        }
      }

      const aiEntry: DiaryEntry = {
        id: `ai-${Date.now()}`,
        text: response.narrative,
        timestamp: new Date().toLocaleTimeString(),
        isUserAction: false
      };
      setEntries(prev => [...prev, aiEntry]);
    } catch (e) {
      console.error(e);
      const errorEntry: DiaryEntry = {
        id: `err-${Date.now()}`,
        text: "The narrative slips away... (Connection Error)",
        timestamp: new Date().toLocaleTimeString(),
        isUserAction: false
      };
      setEntries(prev => [...prev, errorEntry]);
    } finally {
      setIsProcessing(false);
    }
  }, [stats, inventory, characters, achievements]);

  const handleGenerateSummary = async () => {
    setIsGeneratingSummary(true);
    // Get entries from state or save
    let currentEntries = entries;
    if (entries.length === 0) {
         try {
            const saved = localStorage.getItem(SAVE_KEY);
            if (saved) currentEntries = JSON.parse(saved).entries;
        } catch(e) {}
    }

    if (currentEntries.length > 0) {
        const summary = await generateCaseSummary(currentEntries);
        setCaseSummary(summary);
    }
    setIsGeneratingSummary(false);
  };

  const handleFetchNews = async () => {
      setIsFetchingNews(true);
      setNewsContent(null);
      setNewsSources([]);
      try {
          const result = await fetchWorldNews(premise);
          setNewsContent(result.text || "No headlines found.");
          setNewsSources(result.sources || []);
      } catch (e) {
          setNewsContent("Unable to fetch wire services.");
      }
      setIsFetchingNews(false);
  };

  const resetToMenu = () => {
    setGameState(GameState.START);
    setLoadingProgress(0);
    setActiveModal(null);
    setTvChannel('MENU');
    setCaseSummary(null);
  };

  // --- UI RENDERERS ---

  const renderStats = () => (
    <div className="flex items-center gap-4 md:gap-8 font-mono text-[10px] md:text-xs tracking-widest text-zinc-500">
        {[
          { label: 'VIT', val: stats.health, color: 'bg-red-900', text: 'group-hover:text-red-400', title: 'Vitality (Health)' },
          { label: 'SAN', val: stats.resolve, color: 'bg-blue-900/50', text: 'group-hover:text-blue-200', title: 'Sanity (Resolve)' },
          { label: 'SUS', val: stats.suspicion, color: 'bg-yellow-900/50', text: 'group-hover:text-yellow-600', title: 'Suspicion' }
        ].map((s) => (
          <div key={s.label} className="flex flex-col items-center group cursor-help" title={s.title}>
            <span className={`mb-1 transition-colors duration-300 ${s.text}`}>{s.label}</span>
            <div className="w-12 md:w-16 h-1 bg-zinc-800 rounded overflow-hidden">
                <div 
                    className={`h-full ${s.color} transition-all duration-1000`} 
                    style={{ width: `${Math.max(0, Math.min(100, s.val))}%` }}
                />
            </div>
          </div>
        ))}
    </div>
  );

  const renderLoadingScreen = () => (
      <div className="h-screen w-full bg-black flex flex-col items-center justify-center font-retro text-zinc-300 overflow-hidden">
          <div className="w-64 mb-4 text-center">LOADING TAPE...</div>
          <div className="w-64 h-6 border-2 border-zinc-700 p-1">
              <div 
                className="h-full bg-zinc-500 transition-all duration-200"
                style={{ width: `${loadingProgress}%` }}
              ></div>
          </div>
          <div className="mt-2 text-xs text-zinc-600 font-mono">{loadingProgress}%</div>
      </div>
  );

  const renderTVScreen = () => {
    // Helper for retro buttons
    const TvButton = ({ onClick, label, danger = false }: { onClick: () => void, label: string, danger?: boolean }) => (
        <button 
            onClick={onClick}
            className={`
                btn-lofi group relative px-6 py-2 font-retro text-xl tracking-widest uppercase border-2 
                transition-all duration-75 active:bg-zinc-800 active:border-zinc-400
                ${danger 
                    ? 'border-red-900/50 text-red-900 hover:bg-red-900 hover:text-black hover:border-red-500' 
                    : 'border-zinc-800 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200 hover:border-zinc-500'
                }
            `}
        >
            {label}
        </button>
    );

    return (
        <div className="h-screen w-screen flex items-center justify-center bg-[#050505] overflow-hidden">
            {/* TV Frame */}
            <div className="relative w-[90vw] max-w-4xl aspect-[4/3] bg-[#1a1a1a] rounded-3xl p-8 md:p-12 shadow-[0_0_50px_rgba(0,0,0,0.8),inset_0_0_100px_rgba(0,0,0,1)] border-t border-zinc-800 animate-turn-on">
                
                {/* Screen Area */}
                <div className="w-full h-full bg-[#0a0a0a] rounded-[50%_/_10%] relative overflow-hidden crt-container shadow-[inset_0_0_80px_rgba(0,0,0,1)] border-4 border-[#111]">
                    <div className="static-noise"></div>
                    <div className="scanlines"></div>
                    <div className="absolute inset-0 tv-glow pointer-events-none z-20"></div>
                    
                    {/* Screen Content */}
                    <div className="relative z-30 w-full h-full p-8 flex flex-col items-center justify-center text-center">
                        
                        {/* HEADER LOGO */}
                        <div className="mb-8 md:mb-12 relative">
                            <h1 className="font-retro text-6xl md:text-8xl text-zinc-100 text-flicker leading-none" style={{ textShadow: '4px 4px 0px #333' }}>
                                NOIR
                            </h1>
                            <div className="font-retro text-2xl md:text-3xl text-zinc-600 tracking-[0.5em] mt-2 bg-black px-2 inline-block">
                                CHRONICLES
                            </div>
                        </div>

                        {/* MENU CHANNELS */}
                        <div className="w-full max-w-md space-y-4">
                            
                            {/* MAIN MENU */}
                            {tvChannel === 'MENU' && (
                                <div className="flex flex-col gap-4 animate-fade-in">
                                    <TvButton onClick={prepareNewGame} label="NEW GAME" />
                                    
                                    {hasSave && (
                                        <>
                                            <TvButton onClick={handleLoad} label="CONTINUE TAPE" />
                                            <TvButton onClick={() => setTvChannel('TIMELINE')} label="VIEW TIMELINE" />
                                        </>
                                    )}
                                    
                                    <TvButton onClick={() => setTvChannel('CONFIG')} label="CONFIG CHANNEL" />
                                    
                                    {hasSave && (
                                        <div className="pt-4 border-t border-zinc-900 mt-2">
                                            <button 
                                                onClick={handleDeleteSave}
                                                className="text-red-900/50 hover:text-red-700 font-retro text-sm uppercase tracking-widest hover:underline cursor-pointer"
                                            >
                                                ERASE TAPE
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* SETUP MENU (New Game Storyline) */}
                            {tvChannel === 'SETUP' && (
                                <div className="flex flex-col gap-4 text-left animate-fade-in w-full bg-black/80 p-6 border border-zinc-800">
                                     <h3 className="font-retro text-zinc-500 text-xl border-b border-zinc-800 pb-2 mb-2">CASE FILE SETUP</h3>
                                     <div>
                                        <label className="block font-retro text-zinc-600 mb-1">EDIT PREMISE:</label>
                                        <textarea 
                                            value={premise}
                                            onChange={(e) => setPremise(e.target.value)}
                                            className="w-full h-32 bg-zinc-900 border border-zinc-800 p-3 font-serif text-sm text-zinc-300 focus:border-zinc-500 outline-none resize-none leading-relaxed"
                                        />
                                    </div>
                                    <div className="flex justify-between mt-2 pt-2 border-t border-zinc-900">
                                         <button onClick={() => setTvChannel('MENU')} className="font-retro text-zinc-600 hover:text-zinc-400">{'< CANCEL'}</button>
                                         <button onClick={startInvestigation} className="font-retro text-zinc-200 hover:text-white blink-cursor">
                                             {isProcessing ? "INITIALIZING..." : "BEGIN INVESTIGATION >"}
                                         </button>
                                    </div>
                                </div>
                            )}

                             {/* ERASE CONFIRMATION */}
                             {tvChannel === 'ERASE_CONFIRM' && (
                                <div className="flex flex-col gap-6 items-center animate-fade-in w-full bg-red-950/20 p-8 border border-red-900/50">
                                     <h3 className="font-retro text-red-500 text-2xl blink-cursor">WARNING</h3>
                                     <p className="font-retro text-zinc-400 text-lg">ERASE ALL DATA ON TAPE?</p>
                                     <div className="flex gap-4 w-full">
                                         <button onClick={() => setTvChannel('MENU')} className="flex-1 py-2 font-retro bg-zinc-900 hover:bg-zinc-800 text-zinc-400 border border-zinc-800">CANCEL</button>
                                         <button onClick={confirmDelete} className="flex-1 py-2 font-retro bg-red-900 hover:bg-red-800 text-black font-bold border border-red-500">ERASE</button>
                                     </div>
                                </div>
                            )}

                            {/* CONFIG MENU */}
                            {tvChannel === 'CONFIG' && (
                                <div className="flex flex-col gap-4 text-left animate-fade-in w-full bg-black/80 p-6 border border-zinc-800">
                                    <h3 className="font-retro text-zinc-500 text-xl border-b border-zinc-800 pb-2 mb-2">SYSTEM CONFIG</h3>
                                    
                                    <div className="mb-4">
                                        <label className="block font-retro text-zinc-600 mb-1">API KEY STATUS</label>
                                        {process.env.API_KEY ? (
                                            <div className="flex items-center gap-2 text-green-700 font-retro border border-green-900/30 bg-green-900/10 p-2">
                                                <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
                                                SYSTEM OVERRIDE: KEY DETECTED
                                            </div>
                                        ) : (
                                            <input 
                                                type="password"
                                                value={userApiKey}
                                                onChange={(e) => setUserApiKey(e.target.value)}
                                                placeholder="ENTER GEMINI API KEY..."
                                                className="w-full bg-zinc-900 border border-zinc-800 p-2 font-mono text-zinc-300 focus:border-zinc-500 outline-none"
                                            />
                                        )}
                                        <p className="text-[10px] text-zinc-700 font-mono mt-1">
                                            {process.env.API_KEY ? "Using environment key." : "Key required for connection."}
                                        </p>
                                    </div>

                                    <div className="flex justify-between mt-4">
                                        <button onClick={() => setTvChannel('MENU')} className="font-retro text-zinc-500 hover:text-zinc-300">{'< BACK'}</button>
                                    </div>
                                </div>
                            )}

                            {/* TIMELINE VIEW */}
                            {tvChannel === 'TIMELINE' && (
                                <div className="absolute inset-0 bg-[#0a0a0a] z-50 flex flex-col p-8 animate-fade-in">
                                    <div className="flex justify-between items-center mb-6 border-b border-zinc-800 pb-4">
                                        <h2 className="font-retro text-2xl text-zinc-400">CASE TIMELINE</h2>
                                        <button onClick={() => setTvChannel('MENU')} className="font-retro text-zinc-600 hover:text-zinc-200">CLOSE [X]</button>
                                    </div>

                                    {/* AI Summary Section */}
                                    <div className="mb-6 p-4 border border-zinc-800 bg-zinc-900/30">
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="text-zinc-500 font-retro tracking-widest text-sm">CASE SUMMARY</h3>
                                            <button 
                                                onClick={handleGenerateSummary}
                                                disabled={isGeneratingSummary}
                                                className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-1 hover:bg-zinc-700 disabled:opacity-50"
                                            >
                                                {isGeneratingSummary ? "COMPILING..." : "GENERATE SUMMARY"}
                                            </button>
                                        </div>
                                        {caseSummary ? (
                                            <div className="font-serif text-xs md:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                                                {caseSummary}
                                            </div>
                                        ) : (
                                            <div className="text-zinc-700 text-xs italic">No summary compiled.</div>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 overflow-y-auto scrollbar-hide space-y-6 pr-4">
                                        {(() => {
                                            // Get entries from state if active, or save if in menu
                                            let timelineEntries: DiaryEntry[] = entries;
                                            if (entries.length === 0) {
                                                try {
                                                    const saved = localStorage.getItem(SAVE_KEY);
                                                    if (saved) timelineEntries = JSON.parse(saved).entries;
                                                } catch(e) {}
                                            }

                                            if (timelineEntries.length === 0) return <div className="text-zinc-600 font-retro">NO DATA FOUND.</div>;

                                            return timelineEntries.map((entry, idx) => (
                                                <div key={idx} className={`flex gap-4 ${entry.isUserAction ? 'flex-row-reverse' : ''}`}>
                                                    <div className="min-w-[4px] bg-zinc-800 relative">
                                                        <div className={`absolute top-2 w-3 h-3 rounded-full -left-[4px] ${entry.isUserAction ? 'bg-zinc-600' : 'bg-zinc-800'}`}></div>
                                                    </div>
                                                    <div className={`flex-1 p-3 border ${entry.isUserAction ? 'border-zinc-800 bg-zinc-900/20' : 'border-transparent'}`}>
                                                        <div className="text-[10px] font-mono text-zinc-600 mb-1">{entry.timestamp}</div>
                                                        <div className="font-serif text-xs md:text-sm text-zinc-400 leading-relaxed">
                                                            {entry.text.length > 150 ? entry.text.substring(0, 150) + "..." : entry.text}
                                                        </div>
                                                    </div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}
                            
                            {errorMsg && (
                                <div className="mt-4 text-red-700 font-retro text-sm bg-red-900/10 p-2 border border-red-900/20">
                                    ERROR: {errorMsg}
                                </div>
                            )}

                        </div>
                    </div>
                </div>

                {/* TV Controls Decoration */}
                <div className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4">
                     <div className="w-2 h-2 rounded-full bg-red-900 animate-pulse shadow-[0_0_10px_red]"></div>
                     <div className="w-12 h-12 rounded-full border-4 border-[#111] bg-[#222] shadow-[2px_2px_5px_rgba(0,0,0,0.5)]"></div>
                     <div className="w-12 h-12 rounded-full border-4 border-[#111] bg-[#222] shadow-[2px_2px_5px_rgba(0,0,0,0.5)]"></div>
                     <div className="grid grid-cols-2 gap-1 w-12">
                        {[1,2,3,4,5,6].map(i => <div key={i} className="h-1 bg-[#111] rounded-full"></div>)}
                     </div>
                </div>
                
                {/* Brand Label */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-retro text-zinc-700 text-sm tracking-[0.5em] opacity-50">
                    ZENITH-VISION
                </div>

            </div>
        </div>
    );
  };

  const renderGameScreen = () => (
    <div className={`h-screen w-full relative z-10 ${shake ? 'shake-anim' : ''} fade-enter-active flex flex-col overflow-hidden`}>
      {/* Header - Simplified */}
      <header className="flex-shrink-0 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-900 z-30 flex items-center justify-between px-4 md:px-6 py-4 transition-all duration-300">
          <h2 className="text-zinc-600 text-xs tracking-[0.3em] font-bold hidden sm:block">NOIR CHRONICLES</h2>
          
          <div className="flex items-center gap-6">
              {renderStats()}
               <button 
                onClick={resetToMenu} 
                className="text-zinc-800 hover:text-red-500 transition-colors duration-300 text-[10px] md:text-xs uppercase tracking-wider pl-4 border-l border-zinc-800"
                title="Quit to Menu"
               >
                    [QUIT]
                </button>
          </div>
      </header>

      {/* Sub-Header Navigation */}
      <div className="flex-shrink-0 w-full z-20 flex justify-center py-4 bg-transparent pointer-events-none">
          <div className="bg-zinc-950/90 backdrop-blur-sm border border-zinc-800/50 px-4 py-2 rounded-full flex gap-4 pointer-events-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
               <button 
                  onClick={() => setActiveModal('inventory')}
                  className="text-zinc-400 hover:text-white transition-colors duration-300 text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 group px-2 py-1"
               >
                  <span className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-zinc-200 rounded-full transition-colors"></span>
                  Evidence
               </button>
               <button 
                  onClick={() => setActiveModal('characters')}
                  className="text-zinc-400 hover:text-white transition-colors duration-300 text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 group px-2 py-1"
               >
                   <span className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-zinc-200 rounded-full transition-colors"></span>
                  Characters
               </button>
                <button 
                  onClick={() => setActiveModal('storyline')}
                  className="text-zinc-400 hover:text-white transition-colors duration-300 text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 group px-2 py-1"
               >
                   <span className="w-1.5 h-1.5 bg-zinc-600 group-hover:bg-zinc-200 rounded-full transition-colors"></span>
                  Storyline
               </button>
               <button 
                  onClick={() => {
                      setActiveModal('news');
                      handleFetchNews();
                  }}
                  className="text-zinc-400 hover:text-white transition-colors duration-300 text-[10px] md:text-xs uppercase tracking-wider flex items-center gap-2 group px-2 py-1 border-l border-zinc-800 ml-2"
               >
                   <span className="w-1.5 h-1.5 bg-blue-900 group-hover:bg-blue-500 rounded-full transition-colors"></span>
                  Fetch News
               </button>
          </div>
      </div>
      
      {/* Modals */}
      {activeModal === 'inventory' && (
        <ModalOverlay title="Evidence & Items" onClose={() => setActiveModal(null)}>
           {inventory.length === 0 ? (
             <div className="text-zinc-600 italic text-center py-8">No evidence collected.</div>
           ) : (
             <ul className="space-y-4">
               {inventory.map((item, i) => (
                 <li key={i} className="flex justify-between items-center text-zinc-300 font-serif border-b border-zinc-900 pb-3 last:border-0 fade-enter-active">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600">
                        {i + 1}
                        </div>
                        <span>{item}</span>
                    </div>
                    <button 
                        onClick={() => {
                            setActiveModal(null);
                            handleUserAction(`Inspect ${item}`);
                        }}
                        className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-500 px-2 py-1"
                    >
                        Inspect
                    </button>
                 </li>
               ))}
             </ul>
           )}
        </ModalOverlay>
      )}

      {activeModal === 'characters' && (
        <ModalOverlay title="Dramatis Personae" onClose={() => setActiveModal(null)}>
           {characters.length === 0 ? (
             <div className="text-zinc-600 italic text-center py-8">You are alone in this city.</div>
           ) : (
             <div className="grid gap-6">
               {characters.map((char, i) => (
                 <div key={i} className="bg-zinc-900/30 p-4 border-l-2 border-zinc-800 hover:border-zinc-500 transition-colors duration-300 fade-enter-active">
                    <div className="flex justify-between items-baseline mb-1">
                      <h4 className="text-zinc-200 font-bold font-serif text-lg">{char.name}</h4>
                      <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 ${
                        char.status === 'Dead' ? 'bg-red-900/30 text-red-500' : 
                        char.status === 'Missing' ? 'bg-yellow-900/30 text-yellow-500' : 
                        'bg-zinc-800 text-zinc-400'
                      }`}>
                        {char.status}
                      </span>
                    </div>
                    <p className="text-zinc-500 text-sm italic leading-relaxed">{char.description}</p>
                 </div>
               ))}
             </div>
           )}
        </ModalOverlay>
      )}

      {activeModal === 'storyline' && (
        <ModalOverlay title="Case Storyline" onClose={() => setActiveModal(null)}>
            <div className="flex justify-between items-center mb-6">
                <button 
                    onClick={handleSave} 
                    className="text-zinc-800 hover:text-zinc-200 bg-zinc-100 hover:bg-zinc-800 transition-colors text-xs uppercase tracking-wider font-bold px-4 py-2 border border-zinc-200 hover:border-zinc-500"
                >
                    [SAVE PROGRESS]
                </button>
                 <button 
                    onClick={handleGenerateSummary}
                    disabled={isGeneratingSummary}
                    className="text-[10px] bg-zinc-800 text-zinc-400 px-3 py-2 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700"
                >
                    {isGeneratingSummary ? "ANALYZING..." : "GENERATE SUMMARY"}
                </button>
            </div>

             {/* Summary Section */}
             {caseSummary && (
                <div className="mb-6 p-4 border border-zinc-700 bg-zinc-900/50">
                    <h4 className="text-zinc-500 font-retro tracking-widest text-xs mb-2">INTELLIGENCE SUMMARY</h4>
                    <div className="font-serif text-xs md:text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {caseSummary}
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {entries.length === 0 ? (
                     <div className="text-zinc-600 italic text-center py-8">The pages are blank.</div>
                ) : (
                    entries.map((entry, idx) => (
                        <div key={idx} className={`flex gap-4 ${entry.isUserAction ? 'flex-row-reverse' : ''}`}>
                            <div className="min-w-[4px] bg-zinc-800 relative">
                                <div className={`absolute top-2 w-3 h-3 rounded-full -left-[4px] ${entry.isUserAction ? 'bg-zinc-600' : 'bg-zinc-800'}`}></div>
                            </div>
                            <div className={`flex-1 p-3 border ${entry.isUserAction ? 'border-zinc-800 bg-zinc-900/20' : 'border-transparent'}`}>
                                <div className="text-[10px] font-mono text-zinc-600 mb-1">{entry.timestamp}</div>
                                <div className="font-serif text-xs md:text-sm text-zinc-400 leading-relaxed">
                                    {entry.text}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </ModalOverlay>
      )}

      {activeModal === 'news' && (
          <ModalOverlay title="World Wire Service" onClose={() => setActiveModal(null)}>
              <div className="p-2">
                  <p className="text-zinc-500 text-xs mb-4 italic">Recent headlines relevant to the case premise.</p>
                  
                  {isFetchingNews ? (
                      <div className="flex items-center gap-2 text-zinc-400 animate-pulse">
                          <span className="w-2 h-2 bg-zinc-400 rounded-full"></span>
                          FETCHING WIRE DATA...
                      </div>
                  ) : (
                      <>
                        <div className="whitespace-pre-wrap font-serif text-zinc-300 leading-relaxed mb-6">
                            {newsContent}
                        </div>
                        {newsSources.length > 0 && (
                            <div className="border-t border-zinc-800 pt-4 mt-4">
                                <h4 className="text-[10px] uppercase text-zinc-600 mb-2 font-bold tracking-wider">SOURCES</h4>
                                <ul className="space-y-2">
                                    {newsSources.map((source, idx) => (
                                        <li key={idx}>
                                            <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-900 hover:text-blue-500 hover:underline truncate block">
                                                [{idx + 1}] {source.title}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                      </>
                  )}
              </div>
          </ModalOverlay>
      )}

      {recentAchievement && <AchievementToast achievement={recentAchievement} />}

      <div className="flex-1 overflow-y-auto px-6 max-w-3xl mx-auto w-full scrollbar-hide">
        <div className="pt-4 pb-4">
            {entries.map((entry, index) => (
            <div key={entry.id} className={`mb-10 transition-all duration-700 ease-out ${entry.isUserAction ? 'opacity-80 translate-x-2' : 'opacity-100 translate-x-0'}`}>
                
                {entry.isUserAction ? (
                    <div className="flex justify-end">
                        <div className="text-zinc-500 italic font-serif border-r border-zinc-800 pr-4 py-1 inline-block max-w-[90%] text-right text-lg hover:text-zinc-400 transition-colors duration-300">
                            "{entry.text.replace(/^> /, '')}"
                        </div>
                    </div>
                ) : (
                    <div className={`
                        text-zinc-300 font-serif leading-loose
                        ${settings.textSize === 'sm' ? 'text-sm' : ''}
                        ${settings.textSize === 'base' ? 'text-base' : ''}
                        ${settings.textSize === 'lg' ? 'text-lg' : ''}
                        ${settings.textSize === 'xl' ? 'text-xl' : ''}
                    `}>
                        {index === entries.length - 1 ? (
                            <TypewriterText text={entry.text} speed={settings.typingSpeed} />
                        ) : (
                            <span className="whitespace-pre-wrap">{entry.text}</span>
                        )}
                    </div>
                )}
            </div>
            ))}

            {isProcessing && (
            <div className="flex justify-start my-8 ml-2">
                <div className="flex items-center gap-1.5 text-zinc-700">
                    <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></span>
                    <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></span>
                    <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></span>
                </div>
            </div>
            )}
            <div ref={bottomRef} className="h-20" /> {/* Spacer for bottom input bar */}
        </div>
      </div>

      <div className="flex-shrink-0">
        <InputBar 
            onSubmit={handleUserAction} 
            isProcessing={isProcessing} 
            placeholder={isProcessing ? "Waiting..." : "What do you do?"}
        />
      </div>
    </div>
  );

  return (
    <div className="h-full w-full bg-transparent text-zinc-100 font-serif selection:bg-zinc-800 selection:text-white overflow-hidden">
      {gameState === GameState.START && renderTVScreen()}
      {gameState === GameState.LOADING_ANIMATION && renderLoadingScreen()}
      {gameState === GameState.PLAYING && renderGameScreen()}
      {gameState === GameState.ERROR && renderTVScreen()} {/* Fallback to TV on error */}
    </div>
  );
}

export default App;