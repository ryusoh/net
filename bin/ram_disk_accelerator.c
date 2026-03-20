#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/mount.h>
#include <sys/stat.h>
#include <errno.h>

/**
 * NAS Build Accelerator #2: ram_disk_accelerator
 * ---------------------------------------------
 * Sets up a high-speed tmpfs (RAM Disk) for compilation.
 * Redirecting 'kernel_proxy' builds to this folder will
 * bypass slow NAS spinning disks.
 */

#define RAM_DISK_PATH "/tmp/nas_build_ram"
#define DISK_SIZE "128M"

int main(int argc, char *argv[]) {
    if (geteuid() != 0) {
        fprintf(stderr, "Error: This tool must be run as root (sudo).\n");
        return 1;
    }

    if (argc > 1 && strcmp(argv[1], "stop") == 0) {
        printf("[*] Unmounting RAM Disk from %s...\n", RAM_DISK_PATH);
        if (umount(RAM_DISK_PATH) == -1) {
            perror("umount failed");
            return 1;
        }
        printf("[Done] RAM cleaned up.\n");
        return 0;
    }

    // 1. Create directory
    struct stat st = {0};
    if (stat(RAM_DISK_PATH, &st) == -1) {
        mkdir(RAM_DISK_PATH, 0755);
    }

    // 2. Mount tmpfs
    printf("[*] Mounting %s RAM Disk at %s...\n", DISK_SIZE, RAM_DISK_PATH);
    if (mount("tmpfs", RAM_DISK_PATH, "tmpfs", 0, "size=" DISK_SIZE) == -1) {
        perror("mount failed");
        return 1;
    }

    printf("[SUCCESS] RAM Disk is ready. \n");
    printf("Pro-tip: Set your build output to %s for 10x speed.\n", RAM_DISK_PATH);

    return 0;
}
