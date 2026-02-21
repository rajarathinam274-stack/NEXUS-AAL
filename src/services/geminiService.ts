import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface WorkflowStep {
  name: string;
  description: string;
  agentType: 'orchestrator' | 'data' | 'communication' | 'integration' | 'analysis' | 'validation' | 'recovery';
  action: string;
  params: any;
}

export interface WorkflowPlan {
  name: string;
  description: string;
  steps: WorkflowStep[];
}

export async function generateWorkflowPlan(prompt: string): Promise<WorkflowPlan> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Parse this natural language workflow description into a structured execution plan: "${prompt}"`,
      config: {
        systemInstruction: `You are the Nexus AI Orchestrator. Your job is to break down user requests into executable steps for specialized agents.
        Available Agents:
        - data: Database CRUD operations
        - communication: Email, Slack, notifications
        - integration: External API calls
        - analysis: Data processing & insights
        - validation: Data validation & compliance
        - recovery: Error handling (rarely used in initial plan)

        Output MUST be a JSON object matching the WorkflowPlan interface.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  description: { type: Type.STRING },
                  agentType: { type: Type.STRING, enum: ['data', 'communication', 'integration', 'analysis', 'validation', 'recovery'] },
                  action: { type: Type.STRING },
                  params: { type: Type.OBJECT }
                },
                required: ['name', 'description', 'agentType', 'action', 'params']
              }
            }
          },
          required: ['name', 'description', 'steps']
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("Empty response from AI");
    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating workflow plan:", error);
    throw error;
  }
}

export async function executeAgentStep(step: WorkflowStep, context: any): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Execute this step: ${JSON.stringify(step)}. Context from previous steps: ${JSON.stringify(context)}`,
      config: {
        systemInstruction: `You are a specialized AI agent of type "${step.agentType}". 
        Simulate the execution of the requested action: "${step.action}" with params: ${JSON.stringify(step.params)}.
        Provide a realistic result object. If it's a communication step, describe what was sent. If data, describe what was stored.
        Return JSON with 'success' (boolean) and 'result' (object) or 'error' (string).`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN },
            result: { type: Type.OBJECT },
            error: { type: Type.STRING }
          },
          required: ['success']
        }
      }
    });

    const text = response.text;
    if (!text) return { success: false, error: "Empty response from agent" };
    return JSON.parse(text);
  } catch (error: any) {
    console.error("Error executing agent step:", error);
    return { success: false, error: error.message || "Unknown error during agent execution" };
  }
}
