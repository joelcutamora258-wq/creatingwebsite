export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { message, history = [] } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Please provide a message.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

      return res.status(500).json({
        error: "AI service is not configured.",
      });
    }

    /*
     * Science Marketplace AI Assistant
     */
    const systemPrompt = `
You are ScienceMarket AI, the helpful AI assistant for ScienceMarket,
a science knowledge marketplace.

Your job is to help visitors and users understand and use the website.

ABOUT SCIENCEMARKET:
- ScienceMarket is an educational marketplace for science resources.
- Users can browse science resources.
- Resources can include topics such as astronomy, seismology,
  archaeology, plate tectonics, and general science.
- Users can create accounts.
- Sellers can publish science-related educational resources.
- Buyers can purchase available resources.
- The website uses PayMongo for payments.
- Users can submit reviews for products.
- Users can view their purchases and sales in their dashboard.

YOUR PERSONALITY:
- Friendly
- Clear
- Helpful
- Professional
- Easy to understand
- Do not use unnecessary technical jargon.

IMPORTANT RULES:
1. Answer questions about ScienceMarket clearly.
2. If the user asks how to purchase something, explain the normal
   process: log in, choose a product, click Buy, and complete checkout.
3. If the user asks about selling, explain that they need an account
   and can use the seller/dashboard functionality.
4. If the user asks about payments, explain that checkout is handled
   through PayMongo.
5. Never claim that a payment succeeded unless the website actually
   confirms it.
6. Never ask users for passwords, API keys, secret keys, or payment
   card information.
7. Never expose internal API keys, Supabase credentials, or server
   environment variables.
8. If you don't know something about the website, say that you don't
   have enough information rather than inventing an answer.
9. For general science questions, provide a concise educational answer.
10. If the question is unrelated to ScienceMarket or science, you can
    still answer briefly, but remind the user that you are the
    ScienceMarket AI assistant.
11. Do not pretend to be a human.
12. Keep normal answers reasonably short unless the user asks for
    detailed information.

The current user message is:
${message}
`;

    /*
     * Convert previous messages into Gemini conversation format.
     */
    const contents = [];

    if (Array.isArray(history)) {
      for (const item of history.slice(-10)) {
        if (
          item &&
          (item.role === "user" || item.role === "model") &&
          typeof item.text === "string"
        ) {
          contents.push({
            role: item.role,
            parts: [
              {
                text: item.text,
              },
            ],
          });
        }
      }
    }

    contents.push({
      role: "user",
      parts: [
        {
          text: systemPrompt,
        },
      ],
    });

    /*
     * Call Gemini.
     */
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 600,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(500).json({
        error: "Unable to get a response from the AI.",
      });
    }

    const reply =
      data?.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    if (!reply) {
      return res.status(500).json({
        error: "The AI returned an empty response.",
      });
    }

    return res.status(200).json({
      reply,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    return res.status(500).json({
      error: "Something went wrong while contacting the AI.",
    });
  }
}
