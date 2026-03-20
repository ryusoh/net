#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <sys/stat.h>
#include <stdint.h>
#include <inttypes.h>

/**
 * Enhancement #3: Shared Memory IPC
 * ---------------------------------
 * Creates a lightning-fast data bridge in RAM.
 * Multiple tools (Proxy, Monitor, Tile Cache) can read/write 
 * to this segment with zero network overhead.
 */

#define SHM_NAME "/nas_network_stats"
#define SHM_SIZE 4096

typedef struct {
    uint64_t total_packets;
    uint64_t blocked_packets;
    uint64_t tiles_cached;
    char last_blocked_ip[16];
    uint32_t active_connections;
} NetworkStats;

#ifndef TEST_MAIN
int main(int argc, char *argv[]) {
    int shm_fd;
    NetworkStats *stats;

    // 1. Create/Open Shared Memory segment
    shm_fd = shm_open(SHM_NAME, O_CREAT | O_RDWR, 0666);
    if (shm_fd == -1) {
        perror("shm_open");
        return 1;
    }

    // 2. Set size (only if we are the creator/writer)
    if (argc > 1 && strcmp(argv[1], "writer") == 0) {
        if (ftruncate(shm_fd, SHM_SIZE) == -1) {
            // On some systems, ftruncate fails if already sized. We log but continue.
            perror("ftruncate (optional)");
        }
    }

    // 3. Map to process memory
    stats = mmap(0, SHM_SIZE, PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd, 0);
    if (stats == MAP_FAILED) {
        perror("mmap");
        return 1;
    }

    if (argc > 1 && strcmp(argv[1], "writer") == 0) {
        printf("[Writer] Initializing stats in Shared Memory...\n");
        stats->total_packets = 1000;
        stats->blocked_packets = 50;
        stats->tiles_cached = 1200;
        strncpy(stats->last_blocked_ip, "1.2.3.4", 16);
        printf("[Done] Shared Memory is now 'Live'.\n");
    } else {
        printf("--- [ NAS REAL-TIME STATS (via Shared Memory) ] ---\n");
        printf("Total Packets:   %" PRIu64 "\n", stats->total_packets);
        printf("Blocked Packets: %" PRIu64 "\n", stats->blocked_packets);
        printf("Tiles Cached:    %" PRIu64 "\n", stats->tiles_cached);
        printf("Last Block IP:   %s\n", stats->last_blocked_ip);
    }

    // Note: In a real system, we'd leave this open. 
    // For this demo, we detach.
    munmap(stats, SHM_SIZE);
    close(shm_fd);

    return 0;
}
#endif
