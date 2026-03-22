import { GoogleGenAI } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const getAssistantResponse = async (prompt: string, history: { role: string; parts: { text: string }[] }[]) => {
  const model = ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: history.concat([{ role: "user", parts: [{ text: prompt }] }]),
    config: {
      systemInstruction: SYSTEM_PROMPT,
    },
  });

  const response = await model;
  return response.text;
};
