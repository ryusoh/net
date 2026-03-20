#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

/**
 * NAS Proxy Scraper
 * -----------------
 * Fetches SOCKS5 proxy lists from multiple sources for maximum
 * coverage of Chinese-exit proxies.
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

int fetch_proxy_list(const char *url, const char *output_file) {
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

        struct curl_slist *headers = NULL;
        headers = curl_slist_append(headers, "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
        headers = curl_slist_append(headers, "Accept-Language: en-US,en;q=0.9");

        curl_easy_setopt(curl_handle, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl_handle, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
        curl_easy_setopt(curl_handle, CURLOPT_FOLLOWLOCATION, 1L);
        curl_easy_setopt(curl_handle, CURLOPT_SSL_VERIFYPEER, 0L);
        curl_easy_setopt(curl_handle, CURLOPT_TIMEOUT, 15L);

        res = curl_easy_perform(curl_handle);

        if (res != CURLE_OK) {
            fprintf(stderr, "[ERROR] Fetch failed for %s: %s\n", url, curl_easy_strerror(res));
        } else {
            if (strstr(chunk.memory, "cf-challenge") || strstr(chunk.memory, "Ray ID")) {
                printf("[!] BLOCKED by Cloudflare for %s\n", url);
            } else {
                printf("[SUCCESS] Retrieved %lu bytes from %s\n", (long)chunk.size, url);
                /* Append to output file */
                FILE *fp = fopen(output_file, "a");
                if (fp) {
                    fwrite(chunk.memory, 1, chunk.size, fp);
                    fprintf(fp, "\n");
                    fclose(fp);
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

    const char *output = "proxies.html";

    /* Truncate the output file first */
    FILE *fp = fopen(output, "w");
    if (fp) fclose(fp);

    printf("[*] Running NAS Proxy Scraper (multi-source SOCKS5)...\n");

    /* Multiple SOCKS5 sources for broader Chinese proxy coverage */
    fetch_proxy_list("https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/socks5.txt", output);
    fetch_proxy_list("https://raw.githubusercontent.com/hookzof/socks5_list/master/proxy.txt", output);
    fetch_proxy_list("https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/socks5.txt", output);

    printf("[*] All sources fetched. Run updater.py to health-check and deploy.\n");

    curl_global_cleanup();
    return 0;
}
