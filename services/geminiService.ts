import { GoogleGenAI, Chat, Type } from "@google/genai";
import { CharacterStats, StoryResponse, GameCharacter, DiaryEntry } from "../types";

let chatSession: Chat | null = null;
let aiInstance: GoogleGenAI | null = null;

const SYSTEM_INSTRUCTION = `
You are the Game Master of a noir mystery text adventure.
Role: Interactive Narrator.
Tone: Gritty, atmospheric, second-person ("You").

MECHANICS:
1. **Inventory**: Track items. Add if picked up, remove if used/lost.
2. **Stats**: Health (Physical), Resolve (Mental), Suspicion (Covertness).
3. **Characters**: Track EVERY NPC the player meets. Update their status (Alive/Dead/Missing) and description based on interactions.
4. **Achievements**: Award achievements for specific milestones (e.g., "First Clue", "Near Death", "Solved Puzzle", "Murder Witness").

CRITICAL OUTPUT RULE:
Always respond with valid JSON.
Structure:
{
  "narrative": "Story text...",
  "stats": { ... },
  "inventory": ["Item1"],
  "characters": [{ "name": "Detective Joe", "description": "Grizzled partner.", "status": "Alive" }],
  "new_achievements": [{ "id": "first_blood", "title": "First Blood", "description": "You witnessed a murder." }] (Optional, only if unlocked this turn)
}
`;

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    narrative: { type: Type.STRING, description: "The story segment." },
    stats: {
      type: Type.OBJECT,
      properties: {
        health: { type: Type.INTEGER },
        resolve: { type: Type.INTEGER },
        suspicion: { type: Type.INTEGER },
      },
      required: ["health", "resolve", "suspicion"],
    },
    inventory: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of items currently carried."
    },
    characters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          description: { type: Type.STRING },
          status: { type: Type.STRING, enum: ["Alive", "Dead", "Missing", "Unknown"] }
        },
        required: ["name", "description", "status"]
      },
      description: "List of known characters."
    },
    new_achievements: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["id", "title", "description"]
      },
      description: "Achievements unlocked in this specific turn."
    }
  },
  required: ["narrative", "stats", "inventory", "characters"],
};

// Helper to safely parse JSON from AI response
const safeJsonParse = (text: string): StoryResponse | null => {
  try {
    let cleanText = text.trim();
    if (cleanText.includes("```")) {
       cleanText = cleanText.replace(/```json/g, "").replace(/```/g, "");
    }
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(cleanText);
  } catch (error) {
    console.warn("JSON Parse failed on text:", text);
    return null;
  }
};

export const initializeGemini = (apiKey: string) => {
  if (!apiKey) {
    console.error("API Key is missing!");
    return;
  }
  aiInstance = new GoogleGenAI({ apiKey });
};

export const startNewStory = async (premise: string): Promise<StoryResponse> => {
  if (!aiInstance) {
    throw new Error("Gemini not initialized.");
  }

  chatSession = aiInstance.chats.create({
    model: 'gemini-2.5-flash',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.8, 
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA
    },
  });

  try {
    const prompt = `START GAME. Premise: "${premise}". Initialize stats (100/100/0). Give 1 starting item. Initialize character list (maybe just the protagonist or a key contact).`;
    const response = await chatSession.sendMessage({ message: prompt });
    
    if (response.text) {
      const parsed = safeJsonParse(response.text);
      if (parsed) return parsed;
    }
    throw new Error("Invalid AI response");
  } catch (error) {
    console.error("Failed to start story:", error);
    return {
        narrative: "The city is quiet tonight. Too quiet. (System Error)",
        stats: { health: 100, resolve: 100, suspicion: 0 },
        inventory: ["(Unknown)"],
        characters: []
    };
  }
};

export const generateNextEntry = async (userAction: string, currentStats: CharacterStats, currentInventory: string[], currentCharacters: GameCharacter[]): Promise<StoryResponse> => {
  if (!chatSession) {
    throw new Error("Game session not active.");
  }

  try {
    const finalAction = userAction.trim() === "" ? "I wait." : userAction;
    
    const prompt = `
    Context:
    - Stats: HP:${currentStats.health}, PSY:${currentStats.resolve}, SUS:${currentStats.suspicion}
    - Inventory: ${JSON.stringify(currentInventory)}
    - Known Characters: ${JSON.stringify(currentCharacters.map(c => c.name))}

    Action: "${finalAction}"
    `;
    
    const response = await chatSession.sendMessage({ message: prompt });
    
    if (response.text) {
      const parsed = safeJsonParse(response.text);
      if (parsed) return parsed;
    }
    throw new Error("Invalid AI response");
  } catch (error) {
    console.error("Failed to generate entry:", error);
     return {
        narrative: "The shadows lengthen... (AI Connection Error)",
        stats: currentStats,
        inventory: currentInventory,
        characters: currentCharacters
    };
  }
};

export const generateCaseSummary = async (entries: DiaryEntry[]): Promise<string> => {
    if (!aiInstance) return "Signal weak. Cannot compile summary.";

    try {
        const storyText = entries
            .slice(-20) // Summarize last 20 entries to keep context fresh and token count low
            .map(e => `${e.isUserAction ? '> Player' : 'Narrator'}: ${e.text}`)
            .join('\n');
            
        const prompt = `
        You are a Noir Detective's assistant.
        Analyze the following case log and provide a gritty, concise summary (max 3 bullet points) of the current situation, clues, and immediate danger.
        
        LOG:
        ${storyText}
        `;

        const response = await aiInstance.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt
        });

        return response.text || "No summary available.";
    } catch (e) {
        console.error("Summary failed", e);
        return "Unable to compile case file.";
    }
};

export const fetchWorldNews = async (premise: string) => {
  if (!aiInstance) throw new Error("AI not initialized");

  const prompt = `Find 3-5 real-world recent news headlines or historical events that thematically align with this story premise: "${premise}".
  If the premise implies a specific era (e.g., 1940s), find news from that era.
  If it's modern, find current news about crime, mysteries, or relevant topics.
  Format as a short, punchy list.`;

  const response = await aiInstance.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    }
  });

  return {
    text: response.text,
    sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => chunk.web)
      .filter((w: any) => w) || []
  };
};