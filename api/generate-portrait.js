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

    // Get API keys from environment variables (secure!)
    const openaiKey = process.env.OPENAI_API_KEY;
    const mailerliteKey = process.env.MAILERLITE_API_KEY;
    
    if (!openaiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Create a detailed Renaissance-style portrait painting. IMPORTANT: The subject must be a ${petType} (keep the exact same animal species as described). The ${petType}'s face and features should look natural and realistic for that specific type of animal - do not change it into a different animal. 

The ${petType} should be wearing the uniform of a regal 18th-century military general: ornate dark navy and gold embroidered jacket with epaulets, medals, and a high collar. Use soft, painterly textures and warm lighting reminiscent of classical oil paintings. 

The background should be a muted, cloudy gradient in warm beige, rose, and gold tones to resemble an aged painted backdrop. 

The ${petType}'s head must be realistically integrated into the uniform with proper proportions - matching lighting, shadows, and painterly brush strokes for perfect realism. The animal should maintain its natural appearance and species characteristics.

Style: Renaissance oil painting, historical portrait
Composition: Head and shoulders, centered, noble dignified pose
Lighting: Warm, soft, golden hour tones
Important: Do not transform the animal into a different species - keep it as the original ${petType} described.`,
        n: 1,
        size: "1024x1792",
        quality: "hd"
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    // Add email to MailerLite (if API key is configured)
    if (mailerliteKey) {
      try {
        await fetch('https://connect.mailerlite.com/api/subscribers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mailerliteKey}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            email: email,
            groups: ['169718727485425367'],
            fields: {
              source: 'Renaissance Pet Portrait Generator'
            }
          })
        });
        console.log('Email added to MailerLite:', email);
      } catch (mlError) {
        // Don't fail the whole request if MailerLite fails
        console.error('MailerLite error:', mlError);
      }
    }

    // Log email for your records
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
