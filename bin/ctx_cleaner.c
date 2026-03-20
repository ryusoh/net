#define _XOPEN_SOURCE 500
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ftw.h>
#include <unistd.h>
#include <sys/stat.h>

/**
 * NAS Build Accelerator #1: ctx_cleaner
 * ------------------------------------
 * High-speed parallel file scrubber. 
 * Quickly identifies and reports junk files that slow down 
 * Docker context copying on slow NAS HDDs.
 */

int display_info(const char *fpath, const struct stat *sb, int tflag, struct FTW *ftwbuf) {
    // Only look for heavy directories that should be ignored
    if (tflag == FTW_D) {
        if (strstr(fpath, "node_modules") || strstr(fpath, ".git") || strstr(fpath, "tiles")) {
            printf("[SCRUB] Heavy Directory Found: %s (%lld bytes)\n", fpath, (long long)sb->st_size);
            // In a production version, we would mark these for exclusion 
            // from the Docker build context via an auto-generated .dockerignore
        }
    }
    return 0;
}

int main(int argc, char *argv[]) {
    int flags = FTW_PHYS; // Don't follow symlinks

    printf("[*] Starting High-Speed Context Scan...\n");
    if (nftw((argc < 2) ? "." : argv[1], display_info, 20, flags) == -1) {
        perror("nftw");
        return 1;
    }

    printf("[Done] Scan complete. Use .dockerignore to exclude reported paths.\n");
    return 0;
}
