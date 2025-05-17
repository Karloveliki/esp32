/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

addEventListener('fetch', event => {
	event.respondWith(handleRequest(event));
  });
  
  /**
   * Handle Request
   * @param {FetchEvent} event
   * @returns {Promise<Response>}
   */
  async function handleRequest(event) {
	const { request } = event;
  
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
	const GEMINI_API_KEY = MY_GEMINI_API_KEY; // Replace with your worker's environment variable name
  
	try {
	  // Read the image data from the request body (as a Blob)
	  const imageBlob = await request.blob();
  
	  // Convert the Blob to a Base64 encoded string
	  const imageBase64 = await blobToBase64(imageBlob);
  
	  // Construct the Gemini API request
	  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${GEMINI_API_KEY}`;
  
	  const requestBody = {
		contents: [{
		  parts: [
			{
			  text: "Extract the text from this image.  Return only the text. No additional explanations needed."
			},
			{
			  inlineData: {
				mimeType: imageBlob.type,  // e.g., "image/jpeg", "image/png"
				data: imageBase64.split(',')[1]  // Remove the "data:image/jpeg;base64," prefix
			  }
			}
		  ]
		}]
	  };
  
  
	  const fetchOptions = {
		method: 'POST',
		headers: {
		  'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
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
  
	  // Extract the generated text
	  let extractedText = "";
  
	  if (data && data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
		extractedText = data.candidates[0].content.parts[0].text;
	  } else {
		console.warn("Unexpected Gemini API response format:", data);
		extractedText = "No text found in the image or error parsing response.";
	  }
  
  
	  // Return the extracted text as JSON
	  return new Response(JSON.stringify({ text: extractedText }), {
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
  
  
  /**
   * Helper function to convert a Blob to a Base64 string.
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  async function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
	  const reader = new FileReader();
	  reader.onloadend = () => resolve(reader.result);
	  reader.onerror = reject;
	  reader.readAsDataURL(blob);
	});
  }
