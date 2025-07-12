import { NextResponse } from 'next/server';

export async function POST(req) {
  const body = await req.json();
  const { text } = body;

  if (!text) {
    return NextResponse.json({ error: 'Missing text input' }, { status: 400 });
  }

  const apiKey = process.env.CLAUDE_API_KEY;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Please extract the following structured fields from this Hebrew task sentence:

- title (without date/time or category)
- category (choose from one of the known categories: לקבוע סדרה, דוחות, תשלומים, להתקשר, תוכנית טיפול, אחר)
- date (ISO format: YYYY-MM-DD)
- time (24h format: HH:mm)

If anything is missing, leave it empty.

Sentence: "${text}"

Return only JSON: { "title": "...", "category": "...", "date": "...", "time": "..." }`
        }
      ]
    })
  });

  const data = await response.json();
  const rawText = data?.content?.[0]?.text || '';

  try {
    const json = JSON.parse(rawText);
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to parse Claude response', raw: rawText }, { status: 500 });
  }
}
