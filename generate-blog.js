// api/generate-blog.js
// AI Blog Post Generator Backend

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      topic,
      keywords,
      wordCount,
      tone,
      internalLinks,
      peopleAlsoAsk,
      relatedSearches,
      includeIntro
    } = req.body;

    // Validate inputs
    if (!topic || !keywords) {
      return res.status(400).json({ error: 'Topic and keywords are required' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Build the prompt
    const keywordsArray = keywords.split(',').map(k => k.trim());
    const paaQuestions = peopleAlsoAsk ? peopleAlsoAsk.split('\n').filter(q => q.trim()) : [];
    const relatedTerms = relatedSearches ? relatedSearches.split(',').map(t => t.trim()) : [];
    const links = internalLinks ? internalLinks.split('\n').filter(l => l.trim()) : [];

    let prompt = `You are an expert SEO blog writer. Write a comprehensive, engaging blog post with the following specifications:

TOPIC: ${topic}

PRIMARY KEYWORDS: ${keywordsArray.join(', ')}

TARGET WORD COUNT: ${wordCount || 2000} words

TONE: ${tone || 'Professional and informative'}

STRUCTURE REQUIREMENTS:
1. SEO-optimized title (include primary keyword, make it compelling)
2. Meta description (150-160 characters, include primary keyword)
3. URL slug (lowercase, hyphens, keyword-rich)
4. Introduction (${includeIntro ? 'MAXIMUM 500 words - this will be used separately' : '300-400 words'})
5. Main body with H2 and H3 headings
6. Conclusion with strong call-to-action

`;

    if (paaQuestions.length > 0) {
      prompt += `\nPEOPLE ALSO ASK QUESTIONS (answer these as H2 sections):
${paaQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

`;
    }

    if (relatedTerms.length > 0) {
      prompt += `\nRELATED SEARCH TERMS (incorporate naturally):
${relatedTerms.join(', ')}

`;
    }

    if (links.length > 0) {
      prompt += `\nINTERNAL LINKS TO INCLUDE (add contextually, not forced):
${links.join('\n')}

`;
    }

    prompt += `\nSEO OPTIMIZATION RULES:
- Use primary keywords naturally (2-3% density)
- Include keywords in: title, first paragraph, H2 headings, conclusion
- Use semantic variations and related terms
- Write for humans first, search engines second
- Include actionable takeaways
- Use short paragraphs (2-4 sentences)
- Add transition words for readability

FORMAT:
Return the blog post in this exact structure:

---TITLE---
[Your SEO title here]

---META---
[Your meta description here]

---SLUG---
[your-url-slug-here]

---INTRO---
[Introduction section - ${includeIntro ? 'MAX 500 words' : '300-400 words'}]

---BODY---
[Main content with H2 and H3 headings in markdown format]

---CONCLUSION---
[Conclusion with call-to-action]

---IMAGES---
[Suggest 3-5 relevant image ideas with alt text]

Write naturally and engagingly. Provide real value to readers.`;

    console.log('Generating blog post for topic:', topic);

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert SEO content writer who creates comprehensive, engaging blog posts optimized for search engines while maintaining natural, human readability.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('OpenAI error:', data.error);
      return res.status(500).json({ 
        error: 'Failed to generate blog post: ' + data.error.message 
      });
    }

    const blogContent = data.choices[0].message.content;

    // Parse the structured response
    const sections = {
      title: blogContent.match(/---TITLE---\n(.*?)\n\n---/s)?.[1]?.trim() || '',
      meta: blogContent.match(/---META---\n(.*?)\n\n---/s)?.[1]?.trim() || '',
      slug: blogContent.match(/---SLUG---\n(.*?)\n\n---/s)?.[1]?.trim() || '',
      intro: blogContent.match(/---INTRO---\n(.*?)\n\n---/s)?.[1]?.trim() || '',
      body: blogContent.match(/---BODY---\n(.*?)\n\n---/s)?.[1]?.trim() || '',
      conclusion: blogContent.match(/---CONCLUSION---\n(.*?)\n\n---/s)?.[1]?.trim() || '',
      images: blogContent.match(/---IMAGES---\n(.*?)$/s)?.[1]?.trim() || ''
    };

    console.log('Blog post generated successfully');

    return res.status(200).json({
      success: true,
      ...sections,
      fullContent: blogContent,
      wordCount: blogContent.split(/\s+/).length
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ 
      error: 'An unexpected error occurred: ' + error.message 
    });
  }
};
