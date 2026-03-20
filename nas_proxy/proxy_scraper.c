#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <curl/curl.h>

/**
 * NAS Proxy Scraper - Chinese Exit Proxies
 * -----------------------------------------
 * Fetches from APIs that return ONLY recently-verified,
 * China-located proxies (not raw GitHub graveyards).
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

int fetch_proxy_list(const char *url, const char *output_file, const char *label) {
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
        headers = curl_slist_append(headers, "Accept: text/plain,application/json,*/*;q=0.8");
        headers = curl_slist_append(headers, "Accept-Language: en-US,en;q=0.9");

        curl_easy_setopt(curl_handle, CURLOPT_HTTPHEADER, headers);
        curl_easy_setopt(curl_handle, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
        curl_easy_setopt(curl_handle, CURLOPT_FOLLOWLOCATION, 1L);
        curl_easy_setopt(curl_handle, CURLOPT_SSL_VERIFYPEER, 0L);
        curl_easy_setopt(curl_handle, CURLOPT_TIMEOUT, 20L);

        res = curl_easy_perform(curl_handle);

        if (res != CURLE_OK) {
            fprintf(stderr, "[ERROR] %s: %s\n", label, curl_easy_strerror(res));
        } else {
            long http_code = 0;
            curl_easy_getinfo(curl_handle, CURLINFO_RESPONSE_CODE, &http_code);
            if (http_code == 200 && chunk.size > 10) {
                printf("[SUCCESS] %s: %lu bytes\n", label, (long)chunk.size);
                FILE *fp = fopen(output_file, "a");
                if (fp) {
                    fwrite(chunk.memory, 1, chunk.size, fp);
                    fprintf(fp, "\n");
                    fclose(fp);
                }
            } else {
                printf("[WARN] %s: HTTP %ld, %lu bytes\n", label, http_code, (long)chunk.size);
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

    /* Truncate output file */
    FILE *fp = fopen(output, "w");
    if (fp) fclose(fp);

    printf("[*] Fetching verified Chinese proxies from live APIs...\n\n");

    /* ProxyScrape API - returns plain text IP:PORT, pre-verified, country-filtered */
    fetch_proxy_list(
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=10000&country=cn",
        output, "ProxyScrape SOCKS5/CN");

    fetch_proxy_list(
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks4&timeout=10000&country=cn",
        output, "ProxyScrape SOCKS4/CN");

    fetch_proxy_list(
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=http&timeout=10000&country=cn",
        output, "ProxyScrape HTTP/CN");

    /* Fallback: broader lists (not country-filtered, but recently verified) */
    fetch_proxy_list(
        "https://api.proxyscrape.com/v2/?request=displayproxies&protocol=socks5&timeout=5000&country=all",
        output, "ProxyScrape SOCKS5/ALL (fallback)");

    printf("\n[*] Done. Run updater.py to health-check against tianditu.\n");

    curl_global_cleanup();
    return 0;
}
