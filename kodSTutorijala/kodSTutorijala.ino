/*********
  Rui Santos
  Complete project details at https://RandomNerdTutorials.com/esp32-cam-take-photo-display-web-server/
  
  IMPORTANT!!! 
   - Select Board "AI Thinker ESP32-CAM"
   - GPIO 0 must be connected to GND to upload a sketch
   - After connecting GPIO 0 to GND, press the ESP32-CAM on-board RESET button to put your board in flashing mode
  
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
*********/

#include "WiFi.h"
#include "esp_camera.h"
#include "esp_timer.h"
#include "img_converters.h"
#include "Arduino.h"
#include "soc/soc.h"           // Disable brownour problems
#include "soc/rtc_cntl_reg.h"  // Disable brownour problems
#include "driver/rtc_io.h"
#include <ESPAsyncWebServer.h>
#include <SPIFFS.h>
#include <FS.h>
#include <HTTPClient.h>
#include <Base64-X.h>

// Replace with your network credentials
const char* ssid = "A1-NE6037-BBCF20";
const char* password = "mYx%8gBS";

// Create AsyncWebServer object on port 80
AsyncWebServer server(80);

boolean takeNewPhoto = false;
boolean ocitaj = false;

// Photo File Name to save in SPIFFS
#define FILE_PHOTO "/photo.jpg"
#define BASE64_PHOTO "/base64.json"

// OV2640 camera module pins (CAMERA_MODEL_AI_THINKER)
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

void streamFileAsBase64(const char* filePath);

const char* serverUrl = "http://evidencija.uslugaizdoma.online/image";
const size_t chunkSize = 2048;
const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE HTML><html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { text-align:center; }
    .vert { margin-bottom: 10%; }
    .hori{ margin-bottom: 0%; }
  </style>
</head>
<body>
  <div id="container">
    <h2>ESP32-CAM Last Photo</h2>
    <p>It might take more than 5 seconds to capture a photo.</p>
    <p>
      <button onclick="rotatePhoto();">ROTATE</button>
      <button onclick="capturePhoto()">CAPTURE PHOTO</button>
      <button onclick="location.reload();">REFRESH PAGE</button>
      <button onclick="ocitajSliku();">Ocitaj sliku</button>
    </p>
  </div>
  <div><img src="saved-photo" id="photo" width="70%"></div>
</body>
<script>
  var deg = 0;
  function capturePhoto() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', "/capture", true);
    xhr.send();
  }
  function ocitajSliku() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', "/ocitaj", true);
    xhr.send();
  }

  function rotatePhoto() {
    var img = document.getElementById("photo");
    deg += 90;
    if(isOdd(deg/90)){ document.getElementById("container").className = "vert"; }
    else{ document.getElementById("container").className = "hori"; }
    img.style.transform = "rotate(" + deg + "deg)";
  }
  function isOdd(n) { return Math.abs(n % 2) == 1; }
</script>
</html>)rawliteral";

void setup() {
  // Serial port for debugging purposes
  Serial.begin(74880);

  // Connect to Wi-Fi
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  if (!SPIFFS.begin(true)) {
    Serial.println("An Error has occurred while mounting SPIFFS");
    ESP.restart();
  }
  else {
    delay(500);
    Serial.println("SPIFFS mounted successfully");
  }

  // Print ESP32 Local IP Address
  Serial.print("IP Address: http://");
  Serial.println(WiFi.localIP());

  // Turn-off the 'brownout detector'
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  // OV2640 camera module
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_UXGA;
    config.jpeg_quality = 10;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_SVGA;
    config.jpeg_quality = 12;
    config.fb_count = 1;
  }
  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x", err);
    ESP.restart();
  }

  // Route for root / web page
  server.on("/", HTTP_GET, [](AsyncWebServerRequest * request) {
    request->send(200, "text/html", index_html);
  });

  server.on("/capture", HTTP_GET, [](AsyncWebServerRequest * request) {
    takeNewPhoto = true;
    request->send(200, "text/plain", "Taking Photo");
  });

  server.on("/saved-photo", HTTP_GET, [](AsyncWebServerRequest * request) {
    request->send(SPIFFS, FILE_PHOTO, "image/jpg", false);
  });

  server.on("/ocitaj", HTTP_GET, [](AsyncWebServerRequest * request) {
    ocitaj = true;
    request->send(200, "text/plain", "Taking Photo");
  });


  // Start server
  server.begin();
  Serial.println("---------------------");
  
  Serial.println("------------------------");
  Serial.println(esp_get_free_heap_size());
  Serial.println("------------------------");
}

void loop() {
  if (takeNewPhoto) {
    capturePhotoSaveSpiffs();
    takeNewPhoto = false;
  }
  if (ocitaj) {
    ocitajSliku();
    ocitaj = false;
  }

  delay(1);
}

// Check if photo capture was successful
bool checkPhoto( fs::FS &fs ) {
  File f_pic = fs.open( FILE_PHOTO );
  unsigned int pic_sz = f_pic.size();
  return ( pic_sz > 100 );
}

// Capture Photo and Save it to SPIFFS
void capturePhotoSaveSpiffs( void ) {
  camera_fb_t * fb = NULL; // pointer
  bool ok = 0; // Boolean indicating if the picture has been taken correctly

  do {
    // Take a photo with the camera
    Serial.println("Taking a photo...");

    fb = esp_camera_fb_get();
    if (!fb) {
      Serial.println("Camera capture failed");
      return;
    }

    // Photo file name
    Serial.printf("Picture file name: %s\n", FILE_PHOTO);
    File file = SPIFFS.open(FILE_PHOTO, FILE_WRITE);

    // Insert the data in the photo file
    if (!file) {
      Serial.println("Failed to open file in writing mode");
    }
    else {
      file.write(fb->buf, fb->len); // payload (image), payload length
      Serial.print("The picture has been saved in ");
      Serial.print(FILE_PHOTO);
      Serial.print(" - Size: ");
      Serial.print(file.size());
      Serial.println(" bytes");
    }
    // Close the file
    file.close();

    // spremanje slike u base64 encodingu iz fb->buf u drugu datoteku FILE_PHOTO.base64
    File f =SPIFFS.open(BASE64_PHOTO, FILE_WRITE);
    
    if (!f) {
      Serial.println("Failed to open file in writing mode");
    }
    else{
      //int velicina=konacnaVelicina(fb->len)+10;
      Base64Class Base64;
      int encodedLength = Base64.encodedLength(fb->len);
      char *char_ptr = (char*)malloc(encodedLength * sizeof(char)+10);

      Base64.encode(char_ptr,(char*)(fb->buf), fb->len);
      char prelude[] = "{\"image\": \""; 
      char postlude[]= "\"}";
      f.write((const uint8_t *)prelude,strlen(prelude));
      f.write((const uint8_t *)char_ptr, encodedLength);
      f.write((const uint8_t *)postlude,strlen(postlude));
      f.close();
      free(char_ptr);
    }
    esp_camera_fb_return(fb);

    // check if file has been correctly saved in SPIFFS
    ok = checkPhoto(SPIFFS);
  } while ( !ok );
}

// sliku iz spfissa posalji workeru i pricekaj rezultat, te ga ispis
void ocitajSliku() {  
  Serial.println("Ocitavamje slike u tijeku ...");
  streamFileAsBase64(FILE_PHOTO);
  Serial.println("Slika je ocitana.");
}

int konacnaVelicina( int fileSize){
  int remainder=fileSize%3;
  int naEnkodiranPlus=0;
  if (remainder != 0){
    naEnkodiranPlus=naEnkodiranPlus+4;
  }
  int velicina=(fileSize/3)*4+naEnkodiranPlus;
  return velicina;
}

void streamFileAsBase64(const char* filePath){
   HTTPClient http;
  /* File file = SPIFFS.open(imagePath, "r");

   if (!file) {
    Serial.println("Failed to open image file for reading!");
    return;
  }
  */
 

}

/*
void streamFileAsBase64X(const char* filePath) {
  File file = SPIFFS.open(filePath, "r");
  if (!file) {
    Serial.println("Failed to open file for reading");
    return;
  }

  size_t fileSize = file.size();
  Serial.print("File size: ");
  Serial.println(fileSize);

  HTTPClient http;
  WiFiClient client;

  http.begin(client,serverUrl);
  http.addHeader("Content-Type", "application/octet-stream"); // Or "text/plain" or something compatible

  // Start the POST request
  

  WiFiClient* stream = http.startStream();

  if (!stream) {
    Serial.println("Failed to get stream");
    http.end();
    file.close();
    return;
  }
   if (stream) {
      Serial.println("Connected to server, sending request...");

      // Manually construct and send the request
      String request = "POST  /image HTTP/1.1\r\n";
      request += "Host: evidencija.uslugaizdoma.online\r\n";
      request += "Content-Type: application/json\r\n";
      request += "Content-Length: 0\r\n"; //  Important if no body
      request += "Connection: close\r\n"; // Consider using "keep-alive" if making repeated requests
      request += "\r\n"; // Crucial to signal the end of the header

      
   }
  uint8_t* chunkBuffer = new uint8_t[chunkSize];
  if (!chunkBuffer) {
    Serial.println("Failed to allocate memory for chunk buffer");
    http.end();
    file.close();
    return;
  }

  size_t bytesRead;
  while ((bytesRead = file.readBytes(chunkBuffer, chunkSize)) > 0) {
      // Encode chunk to base64
      size_t encodedLength = base64_enc_len(bytesRead);
      char* encodedChunk = new char[encodedLength + 1]; // +1 for NULL
      if (!encodedChunk) {
          Serial.println("Failed to allocate memory for encoded chunk");
          delete[] chunkBuffer;
          http.end();
          file.close();
          return;
      }

      int encodedBytes = base64_encode(encodedChunk, (char*)chunkBuffer, bytesRead); // cast to (char*)
      if (encodedBytes < 0) {
          Serial.println("Encoding failed!");
          delete[] chunkBuffer;
          delete[] encodedChunk;
          http.end();
          file.close();
          return;
      }
      encodedChunk[encodedBytes] = '\0';
int koko[10000];
      // Send the encoded chunk directly to the stream
      stream->print(encodedChunk);

      String response = "";
      while (stream->available()) {
        response += (char)stream->read();
      }
      Serial.println("Response:");
      Serial.println(response);

      // Clean up
      http.end(); // Close connection and release resources
      stream->stop();

      delete[] encodedChunk;  // Free the encoded chunk
      yield();  // Yield to the ESP32's background tasks
  }
  else {
      Serial.println("Failed to connect to server.");
      http.end();
    }
  } else {
    Serial.println("WiFi disconnected");
  }

  delete[] chunkBuffer;
  file.close();
  //http.endRequest(); // Signal the end of the request

 // int httpResponseCode = http.responseStatusCode();
  if (httpResponseCode > 0) {
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("Error code: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}
*/


