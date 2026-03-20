#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

/**
 * NAS Proxy Scraper
 * -----------------
 * Bypasses 403 Forbidden and CORS errors by fetching 
 * proxy lists from the NAS backend instead of the browser.
 */

struct MemoryStruct {
  char *memory;
  size_t size;
};

static size_t WriteMemoryCallback(void *contents, size_t size, size_t nmemb, void *userp) {
  size_t realsize = size * nmemb;
  struct MemoryStruct *mem = (struct MemoryStruct *)userp;

  char *ptr = realloc(mem->memory, mem->size + realsize + 1);
  if(!ptr) return 0;

  mem->memory = ptr;
  memcpy(&(mem->memory[mem->size]), contents, realsize);
  mem->size += realsize;
  mem->memory[mem->size] = 0;

  return realsize;
}

int fetch_proxy_list(const char *url) {
    CURL *curl_handle;
    CURLcode res;
    struct MemoryStruct chunk;

    chunk.memory = malloc(1);
    chunk.size = 0;

    curl_handle = curl_easy_init();
    if (curl_handle) {
        curl_easy_setopt(curl_handle, CURLOPT_URL, url);
        curl_easy_setopt(curl_handle, CURLOPT_WRITEFUNCTION, WriteMemoryCallback);
        curl_easy_setopt(curl_handle, CURLOPT_WRITEDATA, (void *)&chunk);
        
        // Advanced Browser Mimicry
        struct curl_slist *headers = NULL;
        headers = curl_slist_append(headers, "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
        headers = curl_slist_append(headers, "Accept-Language: en-US,en;q=0.9");
        headers = curl_slist_append(headers, "Cache-Control: max-age=0");
        headers = curl_slist_append(headers, "Sec-Ch-Ua: \"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"");
        headers = curl_slist_append(headers, "Sec-Ch-Ua-Mobile: ?0");
        headers = curl_slist_append(headers, "Sec-Fetch-Dest: document");
        headers = curl_slist_append(headers, "Sec-Fetch-Mode: navigate");
        headers = curl_slist_append(headers, "Sec-Fetch-Site: none");
        headers = curl_slist_append(headers, "Sec-Fetch-User: ?1");
        headers = curl_slist_append(headers, "Upgrade-Insecure-Requests: 1");
        
        curl_easy_setopt(curl_handle, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl_handle, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
        curl_easy_setopt(curl_handle, CURLOPT_FOLLOWLOCATION, 1L);
        curl_easy_setopt(curl_handle, CURLOPT_SSL_VERIFYPEER, 0L);

        res = curl_easy_perform(curl_handle);

        if (res != CURLE_OK) {
            fprintf(stderr, "[ERROR] Fetch failed: %s\n", curl_easy_strerror(res));
        } else {
            // Check if we hit a Cloudflare challenge
            if (strstr(chunk.memory, "cf-challenge") || strstr(chunk.memory, "Ray ID")) {
                printf("[!] BLOCKED by Cloudflare. Challenge detected.\n");
            } else {
                printf("[SUCCESS] Retrieved %lu bytes from %s\n", (long)chunk.size, url);
                FILE *fp = fopen("proxies.html", "w");
                if (fp) {
                    fwrite(chunk.memory, 1, chunk.size, fp);
                    fclose(fp);
                    printf("[*] Saved proxy list to proxies.html\n");
                }
            }
        }
        curl_slist_free_all(headers);
        curl_easy_cleanup(curl_handle);
        free(chunk.memory);
    }
    return 0;
}

int main() {
    curl_global_init(CURL_GLOBAL_ALL);
    
    printf("[*] Running NAS Proxy Scraper (Reliability Focus)...\n");
    // Using a more reliable, frequently updated Chinese proxy source
    fetch_proxy_list("https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt");
    
    curl_global_cleanup();
    return 0;
}
