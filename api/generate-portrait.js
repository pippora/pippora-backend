// api/generate-portrait.js
// Backend with GPT-4 Vision + DALL-E 3 integration

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, petImageBase64 } = req.body;

    // Validate inputs
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!petImageBase64) {
      return res.status(400).json({ error: 'Pet image is required' });
    }

    // Get API keys from environment variables
    const openaiKey = process.env.OPENAI_API_KEY;
    const mailerliteKey = process.env.MAILERLITE_API_KEY;
    
    if (!openaiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // STEP 1: Analyze the pet image with GPT-4 Vision
    console.log('Step 1: Analyzing pet image with Vision...');
    
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this pet photo in detail. Describe: 1) The animal species and breed (if identifiable), 2) Fur/coat color and patterns, 3) Distinctive facial features, markings, or characteristics, 4) Eye color, 5) Ear shape and position, 6) Overall appearance and expression. Be specific and detailed - this description will be used to recreate the pet accurately in an artwork."
              },
              {
                type: "image_url",
                image_url: {
                  url: petImageBase64
                }
              }
            ]
          }
        ],
        max_tokens: 300
      })
    });

    const visionData = await visionResponse.json();

    if (visionData.error) {
      console.error('Vision API error:', visionData.error);
      return res.status(500).json({ error: 'Failed to analyze pet image: ' + visionData.error.message });
    }

    const petDescription = visionData.choices[0].message.content;
    console.log('Pet description:', petDescription);

    // STEP 2: Generate Renaissance portrait with DALL-E 3 using the detailed description
    console.log('Step 2: Generating Renaissance portrait...');

    const dallePrompt = `Create a Renaissance-era pet portrait based on this description: ${petDescription}

CRITICAL: Keep the pet's exact features as described - same species, breed, coloring, markings, facial features, and expression.

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

Do NOT alter the pet's species, breed, coloring, or distinctive features. Only add the Renaissance general uniform and painting style.`;

    const dalleResponse = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: dallePrompt,
        n: 1,
        size: "1024x1792",
        quality: "hd"
      })
    });

    const dalleData = await dalleResponse.json();

    if (dalleData.error) {
      console.error('DALL-E error:', dalleData.error);
      return res.status(500).json({ error: 'Failed to generate portrait: ' + dalleData.error.message });
    }

    // STEP 3: Add email to MailerLite
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
        console.error('MailerLite error:', mlError);
      }
    }

    console.log('Success! Portrait generated for:', email);

    // Return the generated image URL
    return res.status(200).json({
      success: true,
      imageUrl: dalleData.data[0].url,
      petDescription: petDescription,
      email: email
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'An unexpected error occurred: ' + error.message });
  }
}
