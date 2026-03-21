/**
 * LAN Speed Test
 * --------------
 * Measures throughput between this machine and another device on the LAN.
 * One side runs as server, the other as client.
 * Resolves device names from ~/.config/lan/devices (saved by lan_scanner).
 *
 * Build: gcc -O3 -Wall -o speedtest speedtest.c -lpthread
 * Usage:
 *   Server:  ./speedtest -s                  # listen on default port
 *   Client:  ./speedtest nas                 # test speed to NAS
 *            ./speedtest router -t 10        # test for 10 seconds
 *            ./speedtest 10.0.0.2 -p 5200    # custom port
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <pthread.h>
#include <arpa/inet.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <errno.h>
#include "devices.h"

#define DEFAULT_PORT    5199
#define BUF_SIZE        (128 * 1024)   /* 128 KB chunks */
#define DEFAULT_SECS    5

static volatile int g_running = 1;

static void sig_handler(int sig) { (void)sig; g_running = 0; }

/* --- Formatting --- */

static const char *fmt_bytes(double bytes) {
    static char buf[64];
    if (bytes >= 1e9)      snprintf(buf, sizeof(buf), "%.2f GB", bytes / 1e9);
    else if (bytes >= 1e6) snprintf(buf, sizeof(buf), "%.2f MB", bytes / 1e6);
    else if (bytes >= 1e3) snprintf(buf, sizeof(buf), "%.2f KB", bytes / 1e3);
    else                   snprintf(buf, sizeof(buf), "%.0f B", bytes);
    return buf;
}

static const char *fmt_rate(double bytes_per_sec) {
    static char buf[64];
    double bits = bytes_per_sec * 8;
    if (bits >= 1e9)      snprintf(buf, sizeof(buf), "%.2f Gbps", bits / 1e9);
    else if (bits >= 1e6) snprintf(buf, sizeof(buf), "%.2f Mbps", bits / 1e6);
    else if (bits >= 1e3) snprintf(buf, sizeof(buf), "%.2f Kbps", bits / 1e3);
    else                  snprintf(buf, sizeof(buf), "%.0f bps", bits);
    return buf;
}

static double now_sec(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return tv.tv_sec + tv.tv_usec / 1e6;
}

/* --- Server mode --- */

/* Protocol:
 *   Client connects, sends 4-byte duration (network order).
 *   Phase 1 (upload): client sends data for <duration> seconds, then closes write half.
 *   Server reads and counts bytes, sends back 8-byte total (network order).
 *   Phase 2 (download): server sends data for <duration> seconds, then closes.
 *   Client reads and counts bytes.
 */

static void server_handle(int fd) {
    struct sockaddr_in peer;
    socklen_t plen = sizeof(peer);
    getpeername(fd, (struct sockaddr *)&peer, &plen);
    char peer_ip[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &peer.sin_addr, peer_ip, sizeof(peer_ip));
    printf("[server] Client connected: %s\n", peer_ip);

    /* Read duration */
    uint32_t net_dur;
    if (recv(fd, &net_dur, 4, MSG_WAITALL) != 4) { close(fd); return; }
    int duration = ntohl(net_dur);
    printf("[server] Test duration: %d seconds per direction\n", duration);

    /* Phase 1: receive upload from client */
    char *buf = malloc(BUF_SIZE);
    uint64_t upload_bytes = 0;
    double t0 = now_sec();

    while (1) {
        ssize_t n = recv(fd, buf, BUF_SIZE, 0);
        if (n <= 0) break;
        upload_bytes += n;
    }
    double upload_time = now_sec() - t0;
    printf("[server] Upload received: %s in %.1fs (%s)\n",
           fmt_bytes(upload_bytes), upload_time,
           fmt_rate(upload_bytes / upload_time));

    /* Send back byte count so client knows its upload speed */
    uint64_t net_bytes;
    memcpy(&net_bytes, &upload_bytes, sizeof(net_bytes));
    send(fd, &net_bytes, 8, 0);

    /* Phase 2: send download data to client */
    memset(buf, 0xAB, BUF_SIZE);
    double deadline = now_sec() + duration;
    uint64_t download_bytes = 0;

    while (now_sec() < deadline && g_running) {
        ssize_t n = send(fd, buf, BUF_SIZE, 0);
        if (n <= 0) break;
        download_bytes += n;
    }
    shutdown(fd, SHUT_WR);

    printf("[server] Download sent: %s in %ds\n",
           fmt_bytes(download_bytes), duration);

    free(buf);
    close(fd);
    printf("[server] Done.\n\n");
}

static int run_server(int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("socket"); return 1; }

    int one = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(port);

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        close(fd);
        return 1;
    }
    listen(fd, 2);

    printf("[server] Listening on port %d (Ctrl+C to stop)\n", port);

    while (g_running) {
        struct sockaddr_in client;
        socklen_t clen = sizeof(client);
        int cfd = accept(fd, (struct sockaddr *)&client, &clen);
        if (cfd < 0) {
            if (errno == EINTR) continue;
            break;
        }
        server_handle(cfd);
    }

    close(fd);
    return 0;
}

/* --- Client mode --- */

static int run_client(const char *host, int port, int duration) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) { perror("socket"); return 1; }

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    inet_pton(AF_INET, host, &addr.sin_addr);

    printf("[speedtest] Connecting to %s:%d...\n", host, port);
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("connect");
        close(fd);
        return 1;
    }
    printf("[speedtest] Connected. Testing %d seconds per direction.\n\n", duration);

    /* Send duration */
    uint32_t net_dur = htonl(duration);
    send(fd, &net_dur, 4, 0);

    char *buf = malloc(BUF_SIZE);
    memset(buf, 0xCD, BUF_SIZE);

    /* Phase 1: upload */
    printf("[upload]   ");
    fflush(stdout);
    double t0 = now_sec();
    double deadline = t0 + duration;
    uint64_t upload_bytes = 0;

    while (now_sec() < deadline && g_running) {
        ssize_t n = send(fd, buf, BUF_SIZE, 0);
        if (n <= 0) break;
        upload_bytes += n;

        double elapsed = now_sec() - t0;
        if (elapsed > 0) {
            printf("\r[upload]   %s  %s  ",
                   fmt_bytes(upload_bytes), fmt_rate(upload_bytes / elapsed));
            fflush(stdout);
        }
    }
    shutdown(fd, SHUT_WR);

    /* Read server's byte count confirmation */
    uint64_t confirmed;
    recv(fd, &confirmed, 8, MSG_WAITALL);
    double upload_time = now_sec() - t0;
    printf("\r[upload]   %s in %.1fs  =>  %s\n",
           fmt_bytes(upload_bytes), upload_time,
           fmt_rate(upload_bytes / upload_time));

    /* Phase 2: download */
    printf("[download] ");
    fflush(stdout);
    t0 = now_sec();
    uint64_t download_bytes = 0;

    while (1) {
        ssize_t n = recv(fd, buf, BUF_SIZE, 0);
        if (n <= 0) break;
        download_bytes += n;

        double elapsed = now_sec() - t0;
        if (elapsed > 0) {
            printf("\r[download] %s  %s  ",
                   fmt_bytes(download_bytes), fmt_rate(download_bytes / elapsed));
            fflush(stdout);
        }
    }
    double download_time = now_sec() - t0;
    printf("\r[download] %s in %.1fs  =>  %s\n",
           fmt_bytes(download_bytes), download_time,
           fmt_rate(download_bytes / download_time));

    /* Summary */
    printf("\n--- %s speed test ---\n", host);
    printf("Upload:    %s\n", fmt_rate(upload_bytes / upload_time));
    printf("Download:  %s\n", fmt_rate(download_bytes / download_time));

    free(buf);
    close(fd);
    return 0;
}

/* --- Main --- */

int main(int argc, char *argv[]) {
    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);

    int server_mode = 0;
    int port = DEFAULT_PORT;
    int duration = DEFAULT_SECS;
    const char *target = NULL;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-s") == 0 || strcmp(argv[i], "--server") == 0)
            server_mode = 1;
        else if (strcmp(argv[i], "-p") == 0 && i + 1 < argc)
            port = atoi(argv[++i]);
        else if (strcmp(argv[i], "-t") == 0 && i + 1 < argc)
            duration = atoi(argv[++i]);
        else if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            printf("Usage:\n");
            printf("  Server: %s -s [-p port]\n", argv[0]);
            printf("  Client: %s <device|IP> [-t seconds] [-p port]\n", argv[0]);
            printf("\nOptions:\n");
            printf("  -s          Run as server (receiver)\n");
            printf("  -t seconds  Test duration per direction (default: %d)\n", DEFAULT_SECS);
            printf("  -p port     Port (default: %d)\n", DEFAULT_PORT);
            return 0;
        } else if (!target)
            target = argv[i];
    }

    if (server_mode)
        return run_server(port);

    if (!target) {
        fprintf(stderr, "Usage: %s <device|IP> or %s -s\n", argv[0], argv[0]);
        return 1;
    }

    /* Resolve device name */
    Device devs[MAX_DEVICES];
    int dev_count = devices_load(devs, MAX_DEVICES);
    const Device *d = devices_find(devs, dev_count, target);
    if (d) {
        printf("[speedtest] Resolved '%s' -> %s\n", d->name, d->ip);
        target = d->ip;
    }

    return run_client(target, port, duration);
}
