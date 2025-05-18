/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

//-------------------------------------
const ocrInstructions = `You are an expert in optical character recognition (OCR) and data extraction.  Your task is to analyze the provided image of a Croatian identity card and extract the following information.

Extract the following fields. If a field is not clearly visible or cannot be confidently determined, mark its value as "null".  Ensure that the extracted values are accurate and reflect the information present in the image.

*   Ime (First Name):
*   Prezime (Last Name):
*   Datum rodenja (Date of Birth) [YYYY-MM-DD]:
*   Broj osobne iskaznice (ID Card Number):

Return the extracted information as a JSON object with the field names as keys. Ensure that the JSON is valid and parsable.  Do not include any introductory or explanatory text outside the JSON.
Return ONLY a JSON object. The JSON should be formatted without any surrounding text, explanations, or code fences.
    
Return ONLY a valid JSON object that conforms to the following JSON Schema:

\`\`\`json
{
"type": "object",
"properties": {
    "ime": { "type": "string" },
    "prezime": { "type": "string" },
    "datumRodenja": { "type": "string", "format": "date" },
    "brojOsobneIskaznice": { "type": ["string", "null"] }
},
"required": ["ime", "prezime", "datumRodenja"]
}
\`\`\`

Here's an example of the JSON format I expect:

\`\`\`json
{{
    "ime": "John",
    "prezime": "Doe",
    "datumRodenja": "1990-01-01",
    "brojOsobneIskaznice": "AB1234567"
}}
\`\`\`

Encode croatian charachters with utf-8.

I need ONLY a JSON object. Do not include any surrounding text, code fences, or explanations. Just the JSON. I want the JSON object to contain the following keys: Ime, Prezime, Datum rodenja, Mjesto rodenja, Broj osobne iskaznice. Represent missing values as null. I repeat: ONLY the JSON object.
Just the JSON data.

`;

function extractJsonObject(inputString) {
	try {
	  // Find the first occurrence of '{'
	  const startIndex = inputString.indexOf('{');
  
	  // If no '{' is found, return null or handle the error as needed.
	  if (startIndex === -1) {
		throw Error("invalid json")
	  }

  
	  // Extract the substring starting from the first '{'
	  let jsonString = inputString.substring(startIndex);
	  
	  const lastClosingBraceIndex = jsonString.lastIndexOf('}');

	  if (lastClosingBraceIndex === -1) {
		throw Error("invalid json")
	  }
	  jsonString=jsonString.substring(0, lastClosingBraceIndex + 1);
	  // Attempt to parse the extracted string as JSON. This is crucial to validate
	  // that you've actually extracted a valid JSON object.  If it's not valid,
	  // the 'try...catch' will handle it.
	  JSON.parse(jsonString);
  
	  return jsonString;  // If parsing succeeds, it's a valid JSON string.
  
	} catch (error) {
	  // Handle potential JSON parsing errors (e.g., incomplete JSON, invalid characters).
	  console.error("Error parsing JSON:", error);
	  return null; // Or throw the error, depending on your error handling strategy.
	}
  }

   //-------------------------------------------------
  /**
   * Handle Request
   * @param {FetchEvent} event
   * @returns {Promise<Response>}
   */
  async function handleRequest(request, environment, context) {
	//const { request } = event
	//console.log(request)
  
	// Check if the request method is POST
	if (request.method !== 'POST') {
	  return new Response('Method Not Allowed.  Only POST requests are supported.', {
		status: 405,
		headers: {
		  'Allow': 'POST',
		  'Content-Type': 'text/plain'
		}
	  });
	}
  
	// Get Gemini API Key from Environment Variable
	const GEMINI_API_KEY = environment.MY_GEMINI_API_KEY; // Replace with your worker's environment variable name
	try {
		// Read the Base64 encoded image data from the request body
		const requestBody = await request.json(); // Expect JSON with "image" field
		const imageBase64WithPrefix = requestBody.image;
	
		// Check if imageBase64WithPrefix is present
		if (!imageBase64WithPrefix) {
		  return new Response(JSON.stringify({ error: "Missing 'image' field in request body" }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		  });
		}
	
		// Remove the "data:image/jpeg;base64," prefix if it exists
		let imageBase64 = imageBase64WithPrefix;
		const base64PrefixRegex = /^data:image\/(jpeg|png|gif);base64,/;
	
		if (base64PrefixRegex.test(imageBase64WithPrefix)) {
			imageBase64 = imageBase64WithPrefix.replace(base64PrefixRegex, '');
		}
	
		// Determine the image mime type from the prefix (if present) or assume jpeg
		let mimeType = 'image/jpeg';
		const match = imageBase64WithPrefix.match(/^data:(image\/(jpeg|png|gif));base64,/);
		if (match && match[2]) {
		  mimeType = `image/${match[2]}`;
		}
	
		// Construct the Gemini API request
		//const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${GEMINI_API_KEY}`;
		const apiUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`
		/*
		const requestBodyGemini = {
			contents: [{
				parts: [
					{
						text: "Extract the text from this image.  Return only the extracted text. No need for explanations."
					},
					{
						inlineData: {
						mimeType: mimeType,
						data: imageBase64
						}
					}
				]
			}]
		};
		*/

		
		const messages = [
			{
			  "role": "user",
			  "content": [
				{
				  "type": "text",
				  "text": ocrInstructions,
				},
				{
				  "type": "image_url",
				  "image_url": {
					"url": imageBase64WithPrefix
				  },
				},
			  ],
			}
		];
		
		//console.log("Messages", messages)
		const requestBodyGemini = {
			//model: "gemini-2.0-flash",
			//model: "gemini-2.5-pro-preview-05-06",
			model: "gemini-2.5-flash-preview-04-17",
			messages: messages
		}
	

		//console.log("body:", JSON.stringify(requestBodyGemini))

		const fetchOptions = {
			method: 'POST',
			headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${GEMINI_API_KEY}`
			},
			body: JSON.stringify(requestBodyGemini)
		};
	
		// Make the API Request
		const response = await fetch(apiUrl, fetchOptions);
		// Check for Errors
		if (!response.ok) {
		console.error('Gemini API error:', response.status, response.statusText);
		
		return new Response(JSON.stringify({ error: `Gemini API Error: ${response.status} ${response.statusText}` }), {
			status: response.status,
			headers: { 'Content-Type': 'application/json' }
		});
	}
  
	// Parse the Response
	const data = await response.json();

	const responseText = data.choices[0].message.content

	const cleaned = extractJsonObject(responseText)
	
	
	// Extract the generated text
	// Return the extracted text as JSON
	return new Response(cleaned, {
		headers: { 'Content-Type': 'application/json' },
	});
  
	} catch (error) {
	  console.error('Error:', error);
	  return new Response(JSON.stringify({ error: error.message }), {
		status: 500,
		headers: { 'Content-Type': 'application/json' },
	  });
	}
  }
  
  
  
export default {
	async fetch(request, environment, context) {
		//console.log(request)
		return await handleRequest(request, environment, context)
	}
}  
