import { generateText } from "ai"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { message, history } = await request.json()

    const { text } = await generateText({
      model: "openai/gpt-4o-mini",
      system: `You are a helpful AI assistant for a construction company management system. 
      You help users analyze documents, extract information, summarize content, and answer questions about construction projects.
      Be professional, concise, and helpful. Focus on construction-related topics like safety reports, building plans, compliance, and project management.`,
      prompt: message,
    })

    return NextResponse.json({ response: text })
  } catch (error) {
    console.error("[v0] AI Assistant error:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
