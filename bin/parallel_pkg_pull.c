#include <stdio.h>
#include <curl/curl.h>
#include <stdlib.h>
#include <string.h>

/**
 * NAS Build Accelerator #3: parallel_pkg_pull
 * -------------------------------------------
 * Uses libcurl multi-interface to download dependencies 
 * in parallel, bypassing sequential apt-get bottlenecks.
 */

#define MAX_PARALLEL 4

static const char *urls[] = {
    "http://ports.ubuntu.com/pool/main/c/curl/libcurl4_8.5.0-2ubuntu10.8_arm64.deb",
    "http://ports.ubuntu.com/pool/main/l/llvm-toolchain-18/clang-18_18.1.3-1ubuntu1_arm64.deb",
    "http://ports.ubuntu.com/pool/main/b/bpf/libbpf-dev_1.3.0-2build2_arm64.deb"
};

int main() {
    CURLM *multi_handle;
    int still_running = 0;

    curl_global_init(CURL_GLOBAL_ALL);
    multi_handle = curl_multi_init();

    printf("[*] Starting Parallel Dependency Pull...\n");

    for (int i = 0; i < 3; i++) {
        CURL *eh = curl_easy_init();
        curl_easy_setopt(eh, CURLOPT_URL, urls[i]);
        curl_easy_setopt(eh, CURLOPT_PRIVATE, urls[i]);
        // Note: In production, we'd add file-write logic here
        curl_multi_add_handle(multi_handle, eh);
    }

    do {
        CURLMcode mc = curl_multi_perform(multi_handle, &still_running);
        if (still_running)
            curl_multi_wait(multi_handle, NULL, 0, 1000, NULL);
    } while (still_running);

    printf("[Done] All packages retrieved in parallel.\n");

    curl_multi_cleanup(multi_handle);
    curl_global_cleanup();
    return 0;
}
