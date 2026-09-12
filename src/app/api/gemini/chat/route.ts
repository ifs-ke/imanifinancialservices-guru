// src/app/api/gemini/chat/route.ts
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Gemini API key is not configured on the server." },
        { status: 500 }
      );
    }

    const { message, chatHistory = [], context = {} } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message parameter is required." },
        { status: 400 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    // Structure previous history into Gemini format
    const contents = chatHistory.map((h: any) => {
      const role = h.senderRole === "assistant" ? "model" : "user";
      return {
        role,
        parts: [{ text: h.message }]
      };
    });

    // Add current user message with grounding context
    const contextStr = context 
      ? `\n\n[Weekly Review Context:\n- Period: ${context.periodLabel || 'N/A'}\n- Journal Notes: ${context.journal || 'None'}\n- Transactions Count: ${context.transactionsCount || 0}\n- Comments Count: ${context.commentsCount || 0}]`
      : "";

    contents.push({
      role: "user",
      parts: [{ text: `${message}${contextStr}` }]
    });

    const responseStream = await ai.models.generateContentStream({
      model: "gemini-3.8-flash",
      contents,
      config: {
        systemInstruction: "You are an expert AI Financial Advisor at IFS-Guru. Your goal is to guide users through their weekly review, analyze their transaction expenses, highlight savings wins, and provide constructive, highly actionable financial strategy advice in Kenya (currency in KES). Keep responses clear, concise, objective, and empathetic.",
      }
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
              controller.enqueue(encoder.encode(text));
            }
          }
          controller.close();
        } catch (err: any) {
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("[API /api/gemini/chat] Unexpected error:", error);
    return NextResponse.json(
      { error: error?.message || "An unexpected error occurred." },
      { status: 500 }
    );
  }
}
