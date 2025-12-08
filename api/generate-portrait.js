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
        prompt: `Create a Renaissance-era pet portrait using the uploaded pet photo for the head. Keep the pet's face, markings, and expression exactly as shown in the uploaded image. Place the head naturally onto a historically accurate Renaissance general's body.

The outfit should include:
– ornate embroidered military coat
– gold trims and shoulder epaulettes
– a high collar
– rich textures like velvet, brocade or leather
– subtle metallic armor elements (optional, if stylistically appropriate)

Match lighting, chiaroscuro lighting, shadows, and color tones so the pet's head blends seamlessly with the painted Renaissance-style body.

The final artwork should look like a classical oil painting from the 1500–1700s, with dramatic lighting, painterly brushstrokes, deep shadows, and warm tones.

Composition:
– Bust or half-body portrait
– Neutral or dark textured Renaissance backdrop
– Slight vignette around edges for depth

Mood: regal, powerful, commanding — as if the pet is a noble general in a historical portrait.

Do NOT alter the pet's species or face shape. Only replace the body and outfit with a Renaissance general uniform.

Important: The subject is a ${petType}.`,
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
