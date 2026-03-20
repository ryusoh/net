#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mount.h>
#include <sys/stat.h>

/**
 * NAS Build Accelerator: fs_overdrive
 * -----------------------------------
 * Moves the Docker build context into a high-speed tmpfs (RAM).
 * This eliminates HDD latency during the 'Copying build context' phase.
 */

#define SOURCE_DIR "."
#define OVERDRIVE_DIR "/tmp/nas_docker_overdrive"

int main(int argc, char *argv[]) {
    if (geteuid() != 0) {
        fprintf(stderr, "Error: Must run as root (sudo).\n");
        return 1;
    }

#ifdef __linux__
    if (argc > 1 && strcmp(argv[1], "stop") == 0) {
        printf("[*] fs_overdrive: Cleaning up RAM disk...\n");
        umount(OVERDRIVE_DIR);
        rmdir(OVERDRIVE_DIR);
        return 0;
    }

    // 1. Create RAM Disk
    mkdir(OVERDRIVE_DIR, 0755);
    printf("[*] fs_overdrive: Mounting 256MB RAM Disk...\n");
    if (mount("tmpfs", OVERDRIVE_DIR, "tmpfs", 0, "size=256M") == -1) {
        perror("mount failed");
        return 1;
    }

    // 2. Fast Copy files to RAM
    printf("[*] fs_overdrive: Mirroring source to RAM...\n");
    char cmd[512];
    sprintf(cmd, "cp -r %s/* %s/", SOURCE_DIR, OVERDRIVE_DIR);
    system(cmd);

    printf("[SUCCESS] Overdrive active at %s\n", OVERDRIVE_DIR);
    printf("Next build will run at memory speeds.\n");
#else
    printf("[!] fs_overdrive is Linux-only.\n");
#endif

    return 0;
}
