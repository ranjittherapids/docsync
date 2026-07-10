import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { auth, requireDocumentAccess } from "@/lib/auth";
import { aiRequestSchema } from "@/lib/validation";

const PROMPTS = {
  summarize:
    "Summarize the following document in 2-3 concise paragraphs. Focus on key points only.",
  improve:
    "Improve the writing quality of the following text. Fix grammar, enhance clarity, and maintain the original meaning. Return only the improved text.",
  title:
    "Suggest a short, descriptive title (max 8 words) for the following document. Return only the title, nothing else.",
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = aiRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }

  const { documentId, action, content } = parsed.data;

  try {
    await requireDocumentAccess(documentId, session.user.id);

    if (!content.trim()) {
      return NextResponse.json(
        { error: "Document is empty" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // Fallback mock responses when no API key configured
      const mockResponses: Record<string, string> = {
        summarize: `This document contains ${content.split(/\s+/).length} words. Key themes include collaborative editing, offline synchronization, and version control. Configure OPENAI_API_KEY for real AI responses.`,
        improve: content,
        title: content.slice(0, 40).trim() + (content.length > 40 ? "..." : ""),
      };
      return NextResponse.json({ result: mockResponses[action] });
    }

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      system: PROMPTS[action],
      prompt: content.slice(0, 8000),
      maxOutputTokens: 500,
    });

    return NextResponse.json({ result: text.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
