/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

  /**
   * Handle Request
   * @param {FetchEvent} event
   * @returns {Promise<Response>}
   */
  async function handleRequest(request, environment, context) {
	//const { request } = event;
	console.log("in handle request")
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
	console.log(GEMINI_API_KEY)
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

		console.log("Image len:", imageBase64WithPrefix.length)
		const messages = [
			{
			  "role": "user",
			  "content": [
				{
				  "type": "text",
				  "text": "Extract the text from this Croatian ID card.  Return only the extracted text. No need for explanations.",
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
		console.log(response)
		return new Response(JSON.stringify({ error: `Gemini API Error: ${response.status} ${response.statusText}` }), {
			status: response.status,
			headers: { 'Content-Type': 'application/json' }
		});
	}
  
	// Parse the Response
	const data = await response.json();

	console.log("Received response!")
	console.log(data.choices[0].message)
	const responseText = data.choices[0].message
	// Extract the generated text
	// Return the extracted text as JSON
	return new Response(JSON.stringify({ text: responseText }), {
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
		console.log("inda worker, long time no see")
		//console.log(request)
		return await handleRequest(request, environment, context)
	}
}  
