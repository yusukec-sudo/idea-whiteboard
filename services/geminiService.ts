
import { GoogleGenAI, Type } from "@google/genai";
import { AIResponse, Node, Edge } from "../types";

// APIキーを取得する関数（localStorageを優先）
const getApiKey = () => {
  return localStorage.getItem('GEMINI_API_KEY') || process.env.APIKEY || process.env.API_KEY || "";
};

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    newNodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          parentId: { type: Type.STRING, nullable: true },
          title: { type: Type.STRING },
          note: { type: Type.STRING }
        },
        required: ["id", "title"]
      }
    },
    newEdges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING },
          target: { type: Type.STRING }
        },
        required: ["source", "target"]
      }
    },
    summaryCards: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "summary"]
      }
    },
    missingPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  }
};

export async function callGeminiAction(
  action: 'expand' | 'organize' | 'summary' | 'missing',
  theme: string,
  nodes: Node[],
  edges: Edge[],
  selectedNodeId?: string
): Promise<AIResponse> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("APIキーが設定されていません。右上の設定から入力してください。");
  }

  const ai = new GoogleGenAI({ apiKey });
  const nodeContext = nodes.map(n => `ID: ${n.id}, Parent: ${n.parentId}, Title: ${n.title}`).join('\n');
  const targetNode = nodes.find(n => n.id === selectedNodeId);

  let prompt = "";
  switch (action) {
    case 'expand':
      prompt = `
        Context: You are an idea assistant.
        Theme: ${theme}
        Existing Map:
        ${nodeContext}
        Task: Expand the branches. ${targetNode ? `Add 3-5 sub-points specifically under node "${targetNode.title}" (ID: ${targetNode.id}).` : "Add 5 key perspectives to the overall map."}
        Rules:
        - Generate unique IDs for new nodes.
        - parentId must be an existing node ID.
      `;
      break;
    case 'organize':
      prompt = `
        Context: You are an expert organizer.
        Theme: ${theme}
        Nodes:
        ${nodeContext}
        Task: Group similar ideas under new category nodes. 
        Return a structure that rearranges parentId for existing nodes or creates new grouping nodes.
      `;
      break;
    case 'summary':
      prompt = `
        Context: You are a business strategist.
        Theme: ${theme}
        Full Map Data:
        ${nodeContext}
        Task: Synthesize everything into exactly 3 distinct, high-quality project proposals or concepts.
      `;
      break;
    case 'missing':
      prompt = `
        Context: You are a critical thinker.
        Theme: ${theme}
        Current State:
        ${nodeContext}
        Task: Identify 5 crucial missing perspectives or risks that haven't been considered yet.
      `;
      break;
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        systemInstruction: "You are an AI scribe for a mind mapping tool. You must respond ONLY with JSON according to the schema provided. Do not include any text outside the JSON."
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result as AIResponse;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}
