// api/generate-portrait.js
// This is your secure backend function that will run on Vercel

export default async function handler(req, res) {
  // Enable CORS so your WooCommerce site can call this
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, petType = 'pet' } = req.body;

    // Validate email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    // Get API key from environment variable (secure!)
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Create a detailed Renaissance-style portrait of a ${petType}. The ${petType} should be seamlessly blended into the body of a regal 18th-century military general wearing an ornate dark navy and gold embroidered uniform with epaulets, medals, and a high collar. Use soft, painterly textures and warm lighting reminiscent of classical oil paintings. The background should be a muted, cloudy gradient in warm beige, rose, and gold tones to resemble an aged painted backdrop. The ${petType}'s head must be realistically integrated into the uniform — matching lighting, shadows, and painterly brush strokes for perfect realism. Style: Renaissance / Oil Painting / Historical Portrait. Medium: Digital painting with visible brush strokes. Composition: Head and shoulders, centered, noble expression. Lighting: Warm, soft, golden hour tones.`,
        n: 1,
        size: "1024x1792",
        quality: "hd"
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // Log email for your records (optional - you can also save to a database)
    console.log('New lead:', email);

    // Return the generated image URL
    return res.status(200).json({
      success: true,
      imageUrl: data.data[0].url,
      email: email
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Failed to generate portrait' });
  }
}
