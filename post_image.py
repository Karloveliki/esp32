import requests
import base64
import json
import mimetypes

def encode_image(image_path):
    """Encodes an image to Base64 format.

    Args:
        image_path: The path to the image file.

    Returns:
        A string containing the Base64 encoded image data with the mime type prefix.
    """

    try:
        with open(image_path, "rb") as image_file:
            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            mime_type = mimetypes.guess_type(image_path)[0]
            if mime_type:
                return f"data:{mime_type};base64,{encoded_string}"
            else:
                print("Could not automatically detect mime type.  Assuming image/jpeg.")
                return f"data:image/jpeg;base64,{encoded_string}" # default mime type
    except FileNotFoundError:
        print(f"Error: Image file not found at path: {image_path}")
        return None
    except Exception as e:
        print(f"Error encoding image: {e}")
        return None

def post_image_to_worker(worker_url, image_path):
    """Posts a Base64 encoded image to a Cloudflare Worker.

    Args:
        worker_url: The URL of the Cloudflare Worker.
        image_path: The path to the image file.

    Returns:
        The JSON response from the Cloudflare Worker, or None if an error occurred.
    """
    base64_image = encode_image(image_path)

    if base64_image is None:
        print("Image encoding failed. Aborting.")
        return None

    payload = {"image": base64_image}
    headers = {"Content-Type": "application/json"}

    try:
        response = requests.post(worker_url, data=json.dumps(payload), headers=headers)
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except json.JSONDecodeError:
        print("Error decoding JSON response from worker.")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

if __name__ == "__main__":
    #worker_url = "https://esp32.perkovickarlo5.workers.dev/"  # Replace with your Cloudflare Worker URL
    worker_url = "http://localhost:8787"
    image_path = "proba_slike.jpg"  # Replace with the path to your image file

    result = post_image_to_worker(worker_url, image_path)

    if result:
        print("Worker Response:")
        print(json.dumps(result, indent=2))  # Pretty print the JSON
    else:
        print("Failed to get a valid response from the worker.")