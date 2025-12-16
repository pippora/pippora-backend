// api/generate-portrait.js
// Backend with GPT-4 Vision + DALL-E 3 + Rate Limiting (CommonJS version)

// In-memory storage for rate limiting
const rateLimitStore = {
  emails: new Map(),
  ips: new Map()
};

// Whitelist of emails that bypass rate limits
const WHITELISTED_EMAILS = [
  // Add your test emails here tedvanderende@yahoo.com
];

function cleanupOldEntries(store) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (now > value.resetTime) {
      store.delete(key);
    }
  }
}

function checkRateLimit(identifier, store, limit, windowMs) {
  cleanupOldEntries(store);
  
  const now = Date.now();
  const record = store.get(identifier);
  
  if (!record) {
    store.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  
  if (now > record.resetTime) {
    store.set(identifier, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }
  
  if (record.count >= limit) {
    const resetIn = Math.ceil((record.resetTime - now) / 1000 / 60);
    return { allowed: false, remaining: 0, resetIn };
  }
  
  record.count++;
  return { allowed: true, remaining: limit - record.count };
}

module.exports = async (req, res) => {
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

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (!petImageBase64) {
      return res.status(400).json({ error: 'Pet image is required' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const mailerliteKey = process.env.MAILERLITE_API_KEY;
    const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === 'true';
    
    if (!openaiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // RATE LIMITING
    if (rateLimitEnabled) {
      const isWhitelisted = WHITELISTED_EMAILS.includes(email.toLowerCase());
      
      if (!isWhitelisted) {
        const emailLimit = checkRateLimit(
          email.toLowerCase(),
          rateLimitStore.emails,
          5,
          24 * 60 * 60 * 1000
        );
        
        if (!emailLimit.allowed) {
          return res.status(429).json({
            error: `Rate limit exceeded. You can generate ${emailLimit.remaining} more portraits. Try again in ${emailLimit.resetIn} minutes.`,
            rateLimitExceeded: true
          });
        }
        
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                        req.headers['x-real-ip'] || 
                        req.socket.remoteAddress;
        
        const ipLimit = checkRateLimit(
          clientIp,
          rateLimitStore.ips,
          7,
          24 * 60 * 60 * 1000
        );
        
        if (!ipLimit.allowed) {
          return res.status(429).json({
            error: `Too many requests from your location. Try again in ${ipLimit.resetIn} minutes.`,
            rateLimitExceeded: true
          });
        }
        
        console.log(`Rate limit status - Email: ${emailLimit.remaining}/5, IP: ${ipLimit.remaining}/7`);
      } else {
        console.log(`Whitelisted email: ${email}`);
      }
    }

    // STEP 1: Analyze with GPT-4 Vision
    console.log('Step 1: Analyzing pet image...');
    
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
      return res.status(500).json({ 
        error: 'Failed to analyze pet image: ' + visionData.error.message,
        step: 'vision',
        details: visionData.error
      });
    }

    if (!visionData.choices || !visionData.choices[0]) {
      console.error('Vision response missing data:', visionData);
      return res.status(500).json({ 
        error: 'Vision API returned unexpected response',
        step: 'vision',
        details: visionData
      });
    }

    const petDescription = visionData.choices[0].message.content;
    console.log('Pet description:', petDescription);

    // STEP 2: Generate with DALL-E 3
    console.log('Step 2: Generating portrait...');

    const dallePrompt = `Renaissance general portrait: ${petDescription}

Style: Classical oil painting (1500-1700s) with chiaroscuro lighting, painterly brushstrokes, warm tones, dramatic shadows.

Outfit: Ornate military coat with gold epaulettes, high collar, medals, velvet and brocade textures.

Background: Dark neutral Renaissance backdrop with subtle vignette.

Important: Keep the pet's exact species, breed, coloring, and features as described. Only add the Renaissance uniform and painting style. Regal, commanding mood.`;

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
      return res.status(500).json({ 
        error: 'Failed to generate portrait: ' + dalleData.error.message,
        step: 'dalle',
        details: dalleData.error
      });
    }

    if (!dalleData.data || !dalleData.data[0]) {
      console.error('DALL-E response missing data:', dalleData);
      return res.status(500).json({ 
        error: 'DALL-E API returned unexpected response',
        step: 'dalle',
        details: dalleData
      });
    }

    // STEP 3: Add to MailerLite
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
};
