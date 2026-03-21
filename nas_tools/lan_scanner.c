#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <time.h>
#include <signal.h>
#include <pthread.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/ip_icmp.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/ioctl.h>
#include <net/if.h>
#include <ifaddrs.h>
#include <netdb.h>

#ifdef __linux__
#include <linux/if_arp.h>
#include <linux/if_packet.h>
#include <linux/if_ether.h>
#endif

/**
 * LAN Scanner
 * -----------
 * Discovers all devices on the local network using:
 * 1. ICMP ping sweep (find alive hosts)
 * 2. ARP table lookup (get MAC addresses)
 * 3. Reverse DNS (get hostnames)
 *
 * Features:
 * - Concurrent ping (threaded, scans /24 in ~3 seconds)
 * - Detects new/disappeared devices between scans
 * - JSON output mode for integration with other tools
 * - Periodic scan mode (daemon)
 *
 * Build: gcc -O3 -Wall -pthread -o lan_scanner lan_scanner.c
 * Usage: sudo ./lan_scanner              # one-shot scan
 *        sudo ./lan_scanner -w 60        # rescan every 60 seconds
 *        sudo ./lan_scanner -j           # JSON output
 *        sudo ./lan_scanner -i eth0      # specify interface
 */

#define MAX_HOSTS     256
#define PING_TIMEOUT  1       /* seconds */
#define SCAN_THREADS  32
#define ARP_FILE      "/proc/net/arp"

typedef struct {
    char ip[16];
    char mac[18];
    char hostname[256];
    int  alive;
    double rtt_ms;      /* round-trip time in ms */
} Host;

static Host g_hosts[MAX_HOSTS];
static int  g_host_count = 0;
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static volatile int g_running = 1;

static void sig_handler(int sig) {
    (void)sig;
    g_running = 0;
}

/* --- ICMP checksum --- */

static unsigned short icmp_checksum(void *data, int len) {
    unsigned short *buf = data;
    unsigned int sum = 0;
    for (; len > 1; len -= 2) sum += *buf++;
    if (len == 1) sum += *(unsigned char *)buf;
    sum = (sum >> 16) + (sum & 0xFFFF);
    sum += (sum >> 16);
    return (unsigned short)(~sum);
}

/* --- Ping a single host --- */

static double ping_host(const char *ip) {
    int fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_ICMP);
    if (fd < 0) {
        /* SOCK_DGRAM ICMP not available, try raw */
        fd = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);
        if (fd < 0) return -1;
    }

    struct timeval tv = { .tv_sec = PING_TIMEOUT, .tv_usec = 0 };
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    inet_pton(AF_INET, ip, &addr.sin_addr);

    /* Build ICMP echo request */
    struct {
        struct icmphdr hdr;
        char data[32];
    } pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.hdr.type = ICMP_ECHO;
    pkt.hdr.code = 0;
    pkt.hdr.un.echo.id = htons(getpid() & 0xFFFF);
    pkt.hdr.un.echo.sequence = htons(1);
    memset(pkt.data, 0x42, sizeof(pkt.data));
    pkt.hdr.checksum = icmp_checksum(&pkt, sizeof(pkt));

    struct timeval t0, t1;
    gettimeofday(&t0, NULL);

    ssize_t sent = sendto(fd, &pkt, sizeof(pkt), 0,
                          (struct sockaddr *)&addr, sizeof(addr));
    if (sent <= 0) { close(fd); return -1; }

    char recv_buf[256];
    struct sockaddr_in from;
    socklen_t from_len = sizeof(from);
    ssize_t n = recvfrom(fd, recv_buf, sizeof(recv_buf), 0,
                         (struct sockaddr *)&from, &from_len);
    close(fd);

    if (n <= 0) return -1;

    gettimeofday(&t1, NULL);
    double rtt = (t1.tv_sec - t0.tv_sec) * 1000.0 +
                 (t1.tv_usec - t0.tv_usec) / 1000.0;
    return rtt;
}

/* --- ARP table lookup (Linux) --- */

static void read_arp_table(void) {
#ifdef __linux__
    FILE *fp = fopen(ARP_FILE, "r");
    if (!fp) return;

    char line[512];
    fgets(line, sizeof(line), fp); /* skip header */

    while (fgets(line, sizeof(line), fp)) {
        char ip[16], mac[18];
        int hw_type, flags;
        char mask[16], device[32];

        if (sscanf(line, "%15s 0x%x 0x%x %17s %15s %31s",
                   ip, &hw_type, &flags, mac, mask, device) >= 4) {
            if (strcmp(mac, "00:00:00:00:00:00") == 0) continue;

            pthread_mutex_lock(&g_lock);
            for (int i = 0; i < g_host_count; i++) {
                if (strcmp(g_hosts[i].ip, ip) == 0) {
                    strncpy(g_hosts[i].mac, mac, sizeof(g_hosts[i].mac) - 1);
                    break;
                }
            }
            pthread_mutex_unlock(&g_lock);
        }
    }
    fclose(fp);
#endif
}

/* --- Reverse DNS lookup --- */

static void resolve_hostname(Host *h) {
    struct sockaddr_in sa;
    memset(&sa, 0, sizeof(sa));
    sa.sin_family = AF_INET;
    inet_pton(AF_INET, h->ip, &sa.sin_addr);

    char host[256];
    if (getnameinfo((struct sockaddr *)&sa, sizeof(sa),
                    host, sizeof(host), NULL, 0, NI_NAMEREQD) == 0) {
        strncpy(h->hostname, host, sizeof(h->hostname) - 1);
    }
}

/* --- Detect local subnet --- */

static int detect_subnet(const char *iface, char *base_ip, int base_ip_size) {
    struct ifaddrs *ifaddr, *ifa;
    if (getifaddrs(&ifaddr) != 0) return -1;

    for (ifa = ifaddr; ifa; ifa = ifa->ifa_next) {
        if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET) continue;
        if (ifa->ifa_flags & IFF_LOOPBACK) continue;

        /* If interface specified, match it */
        if (iface && strcmp(ifa->ifa_name, iface) != 0) continue;

        struct sockaddr_in *sa = (struct sockaddr_in *)ifa->ifa_addr;
        char ip[16];
        inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));

        /* Extract base (first 3 octets) */
        char *last_dot = strrchr(ip, '.');
        if (!last_dot) continue;

        size_t prefix_len = last_dot - ip;
        if (prefix_len >= (size_t)base_ip_size) continue;

        memcpy(base_ip, ip, prefix_len);
        base_ip[prefix_len] = '\0';

        freeifaddrs(ifaddr);
        printf("[scanner] Detected subnet: %s.0/24 (%s)\n", base_ip, ifa->ifa_name);
        return 0;
    }

    freeifaddrs(ifaddr);
    return -1;
}

/* --- Threaded ping sweep --- */

typedef struct {
    char base_ip[16];
    int start;
    int end;
} ScanRange;

static void *scan_worker(void *arg) {
    ScanRange *r = (ScanRange *)arg;

    for (int i = r->start; i < r->end; i++) {
        char ip[16];
        snprintf(ip, sizeof(ip), "%s.%d", r->base_ip, i);

        double rtt = ping_host(ip);
        if (rtt >= 0) {
            pthread_mutex_lock(&g_lock);
            if (g_host_count < MAX_HOSTS) {
                Host *h = &g_hosts[g_host_count++];
                strncpy(h->ip, ip, sizeof(h->ip) - 1);
                h->mac[0] = '\0';
                h->hostname[0] = '\0';
                h->alive = 1;
                h->rtt_ms = rtt;
            }
            pthread_mutex_unlock(&g_lock);
        }
    }

    free(r);
    return NULL;
}

static void scan_subnet(const char *base_ip) {
    pthread_mutex_lock(&g_lock);
    g_host_count = 0;
    pthread_mutex_unlock(&g_lock);

    int per_thread = 256 / SCAN_THREADS;
    pthread_t threads[SCAN_THREADS];

    for (int t = 0; t < SCAN_THREADS; t++) {
        ScanRange *r = malloc(sizeof(ScanRange));
        strncpy(r->base_ip, base_ip, sizeof(r->base_ip) - 1);
        r->base_ip[sizeof(r->base_ip) - 1] = '\0';
        r->start = t * per_thread;
        r->end = (t == SCAN_THREADS - 1) ? 256 : (t + 1) * per_thread;
        pthread_create(&threads[t], NULL, scan_worker, r);
    }

    for (int t = 0; t < SCAN_THREADS; t++) {
        pthread_join(threads[t], NULL);
    }

    /* Enrich with ARP + DNS */
    read_arp_table();
    for (int i = 0; i < g_host_count; i++) {
        resolve_hostname(&g_hosts[i]);
    }
}

/* --- IP sort comparator --- */

static int ip_cmp(const void *a, const void *b) {
    const Host *ha = (const Host *)a;
    const Host *hb = (const Host *)b;
    struct in_addr ia, ib;
    inet_pton(AF_INET, ha->ip, &ia);
    inet_pton(AF_INET, hb->ip, &ib);
    return ntohl(ia.s_addr) < ntohl(ib.s_addr) ? -1 : 1;
}

/* --- Output --- */

static void print_table(void) {
    qsort(g_hosts, g_host_count, sizeof(Host), ip_cmp);

    printf("\n%-16s %-18s %8s  %s\n", "IP", "MAC", "RTT(ms)", "Hostname");
    printf("%-16s %-18s %8s  %s\n", "──────────────", "─────────────────", "───────", "────────────────");

    for (int i = 0; i < g_host_count; i++) {
        Host *h = &g_hosts[i];
        printf("%-16s %-18s %7.1f  %s\n",
               h->ip,
               h->mac[0] ? h->mac : "(unknown)",
               h->rtt_ms,
               h->hostname[0] ? h->hostname : "");
    }
    printf("\n[scanner] %d hosts found\n", g_host_count);
}

static void print_json(void) {
    qsort(g_hosts, g_host_count, sizeof(Host), ip_cmp);

    printf("[\n");
    for (int i = 0; i < g_host_count; i++) {
        Host *h = &g_hosts[i];
        printf("  {\"ip\":\"%s\",\"mac\":\"%s\",\"rtt\":%.1f,\"hostname\":\"%s\"}%s\n",
               h->ip,
               h->mac[0] ? h->mac : "",
               h->rtt_ms,
               h->hostname[0] ? h->hostname : "",
               i < g_host_count - 1 ? "," : "");
    }
    printf("]\n");
}

/* --- Main --- */

int main(int argc, char *argv[]) {
    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);

    int json_mode = 0;
    int watch_interval = 0;
    const char *iface = NULL;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "-j") == 0 || strcmp(argv[i], "--json") == 0) {
            json_mode = 1;
        } else if (strcmp(argv[i], "-w") == 0 || strcmp(argv[i], "--watch") == 0) {
            if (i + 1 < argc) watch_interval = atoi(argv[++i]);
            else watch_interval = 60;
        } else if (strcmp(argv[i], "-i") == 0 || strcmp(argv[i], "--interface") == 0) {
            if (i + 1 < argc) iface = argv[++i];
        } else if (strcmp(argv[i], "-h") == 0 || strcmp(argv[i], "--help") == 0) {
            printf("Usage: %s [-j] [-w seconds] [-i interface]\n", argv[0]);
            printf("  -j, --json         JSON output\n");
            printf("  -w, --watch N      Rescan every N seconds\n");
            printf("  -i, --interface X  Use specific network interface\n");
            return 0;
        }
    }

    char base_ip[16];
    if (detect_subnet(iface, base_ip, sizeof(base_ip)) != 0) {
        fprintf(stderr, "[scanner] Could not detect subnet. Use -i to specify interface.\n");
        return 1;
    }

    /* Track previous scan for change detection */
    Host prev_hosts[MAX_HOSTS];
    int prev_count = 0;

    do {
        struct timeval t0, t1;
        gettimeofday(&t0, NULL);

        scan_subnet(base_ip);

        gettimeofday(&t1, NULL);
        double elapsed = (t1.tv_sec - t0.tv_sec) + (t1.tv_usec - t0.tv_usec) / 1000000.0;

        if (json_mode) {
            print_json();
        } else {
            print_table();
            printf("[scanner] Scan completed in %.1fs\n", elapsed);
        }

        /* Detect changes if watching */
        if (watch_interval > 0 && prev_count > 0) {
            /* Find new devices */
            for (int i = 0; i < g_host_count; i++) {
                int found = 0;
                for (int j = 0; j < prev_count; j++) {
                    if (strcmp(g_hosts[i].ip, prev_hosts[j].ip) == 0) {
                        found = 1;
                        break;
                    }
                }
                if (!found) {
                    printf("[NEW] %s %s %s\n", g_hosts[i].ip,
                           g_hosts[i].mac[0] ? g_hosts[i].mac : "",
                           g_hosts[i].hostname[0] ? g_hosts[i].hostname : "");
                }
            }

            /* Find disappeared devices */
            for (int j = 0; j < prev_count; j++) {
                int found = 0;
                for (int i = 0; i < g_host_count; i++) {
                    if (strcmp(g_hosts[i].ip, prev_hosts[j].ip) == 0) {
                        found = 1;
                        break;
                    }
                }
                if (!found) {
                    printf("[GONE] %s %s %s\n", prev_hosts[j].ip,
                           prev_hosts[j].mac[0] ? prev_hosts[j].mac : "",
                           prev_hosts[j].hostname[0] ? prev_hosts[j].hostname : "");
                }
            }
        }

        /* Save current scan for next comparison */
        memcpy(prev_hosts, g_hosts, sizeof(Host) * g_host_count);
        prev_count = g_host_count;

        if (watch_interval > 0) {
            for (int s = 0; s < watch_interval && g_running; s++) sleep(1);
        }

    } while (watch_interval > 0 && g_running);

    return 0;
}
