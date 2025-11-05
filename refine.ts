export const config = { runtime: 'edge' };

const API_KEY = process.env.GATEWAY_KEY!;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return new Response('Only POST', { status: 405 });

    const key = req.headers.get('x-api-key');
    if (!key || key !== API_KEY) return new Response('Unauthorized', { status: 401 });

    const payload = await req.json();
    if (!payload?.icp || !Array.isArray(payload?.perguntas)) {
      return new Response(JSON.stringify({ error: 'icp e perguntas são obrigatórios' }), {
        status: 400, headers: { 'content-type': 'application/json' }
      });
    }

    const system = `Você é um curador SEO B2B. Faça escoring, dedup e priorização.`;
    const user = `
ICP: ${payload.icp}
Palavras-chave: ${(payload.palavras_chave||[]).join(', ')}
Contexto: ${JSON.stringify(payload.contexto||{})}
Perguntas (JSON):
${JSON.stringify(payload.perguntas)}

Tarefa:
1) Aplique escore 0-100 por pergunta com critérios e pesos.
2) Deduplicate: agrupe variações e mantenha a melhor (maior score).
3) Categorize por tema/categoria, ordene por score.
4) Normalize funil/objetivo quando ausentes.
5) Saída JSON estruturada.
`;

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      })
    });

    if (!openaiRes.ok) {
      const text = await openaiRes.text();
      return new Response(JSON.stringify({ error: 'LLM error', detail: text }), {
        status: 502, headers: { 'content-type': 'application/json' }
      });
    }

    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = { observacoes: content }; }

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { 'content-type': 'application/json' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Gateway error', detail: e?.message }), {
      status: 500, headers: { 'content-type': 'application/json' }
    });
  }
};
