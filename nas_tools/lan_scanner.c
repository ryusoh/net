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
    char vendor[32];
    char hostname[256];
    int  alive;
    double rtt_ms;      /* round-trip time in ms */
} Host;

/* --- OUI vendor lookup (first 3 bytes of MAC) --- */

typedef struct { unsigned char oui[3]; const char *vendor; } OUI_Entry;

static const OUI_Entry oui_table[] = {
    /* Apple */
    {{0x00,0x1B,0x63}, "Apple"},  {{0x3C,0x22,0xFB}, "Apple"},
    {{0xAC,0xDE,0x48}, "Apple"},  {{0xF0,0x18,0x98}, "Apple"},
    {{0x14,0x98,0x77}, "Apple"},  {{0xA4,0x83,0xE7}, "Apple"},
    {{0xDC,0xA9,0x04}, "Apple"},  {{0x88,0x66,0xA3}, "Apple"},
    {{0x78,0x7E,0x61}, "Apple"},  {{0xBC,0x52,0xB7}, "Apple"},
    {{0x38,0xF9,0xD3}, "Apple"},  {{0xF4,0x5C,0x89}, "Apple"},
    {{0xC8,0x69,0xCD}, "Apple"},  {{0xD0,0x81,0x7A}, "Apple"},
    {{0x70,0xDE,0xE2}, "Apple"},  {{0xA8,0x5C,0x2C}, "Apple"},
    {{0x98,0x01,0xA7}, "Apple"},  {{0x04,0x26,0x65}, "Apple"},
    {{0x1C,0x36,0xBB}, "Apple"},  {{0x54,0x26,0x96}, "Apple"},
    /* Samsung */
    {{0x00,0x1A,0x8A}, "Samsung"},  {{0xCC,0x07,0xAB}, "Samsung"},
    {{0xD0,0x22,0xBE}, "Samsung"},  {{0x34,0x23,0xBA}, "Samsung"},
    {{0x94,0x35,0x0A}, "Samsung"},  {{0xBC,0x72,0xB1}, "Samsung"},
    {{0x08,0xD4,0x6A}, "Samsung"},  {{0x78,0x47,0x1D}, "Samsung"},
    {{0xF4,0x7B,0x09}, "Samsung"},  {{0xC0,0xBD,0xD1}, "Samsung"},
    {{0xA0,0x82,0x1F}, "Samsung"},  {{0xEC,0x1F,0x72}, "Samsung"},
    /* Google/Pixel */
    {{0x3C,0x5A,0xB4}, "Google"},  {{0x54,0x60,0x09}, "Google"},
    {{0xF4,0xF5,0xE8}, "Google"},  {{0x94,0xEB,0x2C}, "Google"},
    /* Huawei */
    {{0x00,0x9A,0xCD}, "Huawei"},  {{0x48,0x46,0xFB}, "Huawei"},
    {{0xE0,0x24,0x7F}, "Huawei"},  {{0x88,0x28,0xB3}, "Huawei"},
    {{0xCC,0xA2,0x23}, "Huawei"},  {{0x04,0xF9,0x38}, "Huawei"},
    /* Xiaomi */
    {{0x28,0x6C,0x07}, "Xiaomi"},  {{0x64,0xCC,0x2E}, "Xiaomi"},
    {{0x78,0x11,0xDC}, "Xiaomi"},  {{0xFC,0x64,0xBA}, "Xiaomi"},
    {{0x50,0x64,0x2B}, "Xiaomi"},  {{0x7C,0x1D,0xD9}, "Xiaomi"},
    /* Intel */
    {{0x00,0x1B,0x21}, "Intel"},  {{0x3C,0x97,0x0E}, "Intel"},
    {{0x48,0x51,0xB7}, "Intel"},  {{0x80,0x86,0xF2}, "Intel"},
    {{0x8C,0x8D,0x28}, "Intel"},  {{0xA4,0xBB,0x6D}, "Intel"},
    /* Realtek (common on PCs/NICs) */
    {{0x00,0xE0,0x4C}, "Realtek"},  {{0x52,0x54,0x00}, "Realtek/QEMU"},
    /* TP-Link */
    {{0x50,0xC7,0xBF}, "TP-Link"},  {{0xEC,0x08,0x6B}, "TP-Link"},
    {{0x60,0xE3,0x27}, "TP-Link"},  {{0x14,0xEB,0xB6}, "TP-Link"},
    {{0xB0,0x4E,0x26}, "TP-Link"},  {{0xC0,0x06,0xC3}, "TP-Link"},
    /* ASUS */
    {{0x00,0x1A,0x92}, "ASUS"},  {{0xF4,0x6D,0x04}, "ASUS"},
    {{0x2C,0x56,0xDC}, "ASUS"},  {{0x04,0x92,0x26}, "ASUS"},
    /* Netgear */
    {{0x00,0x1E,0x2A}, "Netgear"},  {{0xC4,0x04,0x15}, "Netgear"},
    {{0x28,0xC6,0x8E}, "Netgear"},  {{0xA4,0x2B,0x8C}, "Netgear"},
    /* D-Link */
    {{0x00,0x1C,0xF0}, "D-Link"},  {{0xCC,0xB2,0x55}, "D-Link"},
    /* Synology */
    {{0x00,0x11,0x32}, "Synology"},
    /* Raspberry Pi */
    {{0xB8,0x27,0xEB}, "Raspberry Pi"},  {{0xDC,0xA6,0x32}, "Raspberry Pi"},
    {{0xE4,0x5F,0x01}, "Raspberry Pi"},
    /* Dell */
    {{0x00,0x14,0x22}, "Dell"},  {{0xF8,0xDB,0x88}, "Dell"},
    {{0x34,0x17,0xEB}, "Dell"},
    /* Lenovo */
    {{0x00,0x0A,0x27}, "Lenovo"},  {{0x28,0xD2,0x44}, "Lenovo"},
    {{0x98,0xFA,0x9B}, "Lenovo"},
    /* Microsoft (Surface, Xbox) */
    {{0x28,0x18,0x78}, "Microsoft"},  {{0x7C,0x1E,0x52}, "Microsoft"},
    {{0xC8,0x3F,0x26}, "Microsoft"},
    /* Cisco/Linksys */
    {{0x00,0x1A,0xA2}, "Cisco"},  {{0x00,0x22,0x6B}, "Cisco"},
    /* Amazon (Echo, Fire) */
    {{0xFC,0x65,0xDE}, "Amazon"},  {{0x74,0xC2,0x46}, "Amazon"},
    {{0xA0,0x02,0xDC}, "Amazon"},
    /* Sonos */
    {{0x00,0x0E,0x58}, "Sonos"},  {{0x94,0x9F,0x3E}, "Sonos"},
    /* HP */
    {{0x00,0x1A,0x4B}, "HP"},  {{0x3C,0xD9,0x2B}, "HP"},
    /* Ubiquiti */
    {{0x00,0x27,0x22}, "Ubiquiti"},  {{0x24,0x5A,0x4C}, "Ubiquiti"},
    {{0xFC,0xEC,0xDA}, "Ubiquiti"},  {{0x78,0x8A,0x20}, "Ubiquiti"},
    {{0x44,0xD9,0xE7}, "Ubiquiti"},  {{0x18,0xE8,0x29}, "Ubiquiti"},
    /* ZTE */
    {{0x00,0x1E,0x73}, "ZTE"},  {{0x58,0x19,0xF8}, "ZTE"},
};

static const char *oui_lookup(const char *mac) {
    if (!mac || strlen(mac) < 8) return NULL;
    unsigned int b0, b1, b2;
    if (sscanf(mac, "%x:%x:%x", &b0, &b1, &b2) != 3) return NULL;
    for (size_t i = 0; i < sizeof(oui_table) / sizeof(oui_table[0]); i++) {
        if (oui_table[i].oui[0] == b0 &&
            oui_table[i].oui[1] == b1 &&
            oui_table[i].oui[2] == b2)
            return oui_table[i].vendor;
    }
    return NULL;
}

static Host g_hosts[MAX_HOSTS];
static int  g_host_count = 0;
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static volatile int g_running = 1;
static char g_self_ip[16] = {0};

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

    /* Build ICMP echo request (portable across Linux/macOS) */
    struct {
        struct icmp hdr;
        char data[32];
    } pkt;
    memset(&pkt, 0, sizeof(pkt));
    pkt.hdr.icmp_type = ICMP_ECHO;
    pkt.hdr.icmp_code = 0;
    pkt.hdr.icmp_id = htons(getpid() & 0xFFFF);
    pkt.hdr.icmp_seq = htons(1);
    memset(pkt.data, 0x42, sizeof(pkt.data));
    pkt.hdr.icmp_cksum = icmp_checksum(&pkt, sizeof(pkt));

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
    if (!fgets(line, sizeof(line), fp)) { fclose(fp); return; }

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
                    snprintf(g_hosts[i].mac, sizeof(g_hosts[i].mac), "%s", mac);
                    const char *v = oui_lookup(mac);
                    if (v) snprintf(g_hosts[i].vendor, sizeof(g_hosts[i].vendor), "%s", v);
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
        snprintf(h->hostname, sizeof(h->hostname), "%s", host);
    }
}

/* --- Detect local subnet --- */

static int detect_subnet(const char *iface, char *base_ip, int base_ip_size) {
    struct ifaddrs *ifaddr, *ifa;
    if (getifaddrs(&ifaddr) != 0) return -1;

    /* When no interface specified, pick the best candidate:
       skip loopback, link-local (169.254.x.x), and virtual/docker interfaces */
    char best_ip[16] = {0};
    char best_iface[32] = {0};
    int best_score = -1;

    for (ifa = ifaddr; ifa; ifa = ifa->ifa_next) {
        if (!ifa->ifa_addr || ifa->ifa_addr->sa_family != AF_INET) continue;
        if (ifa->ifa_flags & IFF_LOOPBACK) continue;

        /* If interface specified, match it */
        if (iface && strcmp(ifa->ifa_name, iface) != 0) continue;

        struct sockaddr_in *sa = (struct sockaddr_in *)ifa->ifa_addr;
        char ip[16];
        inet_ntop(AF_INET, &sa->sin_addr, ip, sizeof(ip));

        unsigned int addr = ntohl(sa->sin_addr.s_addr);
        unsigned char first = (addr >> 24) & 0xFF;
        unsigned char second = (addr >> 16) & 0xFF;

        /* Skip link-local 169.254.x.x */
        if (first == 169 && second == 254) continue;

        /* Score interfaces: prefer real LAN interfaces */
        int score = 0;

        /* Private ranges (10.x, 192.168.x, 172.16-31.x) get high score */
        if (first == 10) score = 100;
        else if (first == 192 && second == 168) score = 100;
        else if (first == 172 && second >= 16 && second <= 31) score = 100;
        else score = 50; /* public IP, less likely on LAN */

        /* Penalize virtual/docker interfaces */
        const char *name = ifa->ifa_name;
        if (strncmp(name, "docker", 6) == 0 ||
            strncmp(name, "veth", 4) == 0 ||
            strncmp(name, "br-", 3) == 0 ||
            strncmp(name, "virbr", 5) == 0) {
            score -= 80;
        }

        /* Prefer common physical names */
        if (strncmp(name, "eth0", 4) == 0 ||
            strncmp(name, "en", 2) == 0 ||
            strncmp(name, "br0", 3) == 0 ||
            strncmp(name, "bond", 4) == 0) {
            score += 10;
        }

        if (iface || score > best_score) {
            best_score = score;
            snprintf(best_ip, sizeof(best_ip), "%s", ip);
            snprintf(best_iface, sizeof(best_iface), "%s", name);
            if (iface) break; /* exact match requested */
        }
    }

    if (best_score >= 0) {
        char *last_dot = strrchr(best_ip, '.');
        if (last_dot) {
            size_t prefix_len = last_dot - best_ip;
            if (prefix_len < (size_t)base_ip_size) {
                memcpy(base_ip, best_ip, prefix_len);
                base_ip[prefix_len] = '\0';
                snprintf(g_self_ip, sizeof(g_self_ip), "%s", best_ip);
                freeifaddrs(ifaddr);
                printf("[scanner] Detected subnet: %s.0/24 (%s)\n", base_ip, best_iface);
                return 0;
            }
        }
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
        char ip[32];
        snprintf(ip, sizeof(ip), "%s.%d", r->base_ip, i);

        double rtt = ping_host(ip);
        if (rtt >= 0) {
            pthread_mutex_lock(&g_lock);
            if (g_host_count < MAX_HOSTS) {
                Host *h = &g_hosts[g_host_count++];
                memcpy(h->ip, ip, sizeof(h->ip));
                h->ip[sizeof(h->ip) - 1] = '\0';
                h->mac[0] = '\0';
                h->vendor[0] = '\0';
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
        snprintf(r->base_ip, sizeof(r->base_ip), "%s", base_ip);
        r->start = t * per_thread;
        r->end = (t == SCAN_THREADS - 1) ? 256 : (t + 1) * per_thread;
        pthread_create(&threads[t], NULL, scan_worker, r);
    }

    for (int t = 0; t < SCAN_THREADS; t++) {
        pthread_join(threads[t], NULL);
    }

    /* Enrich with ARP + DNS + vendor */
    read_arp_table();
    for (int i = 0; i < g_host_count; i++) {
        resolve_hostname(&g_hosts[i]);
        if (g_hosts[i].mac[0] && !g_hosts[i].vendor[0]) {
            const char *v = oui_lookup(g_hosts[i].mac);
            if (v) snprintf(g_hosts[i].vendor, sizeof(g_hosts[i].vendor), "%s", v);
        }
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

    printf("\n%-16s %-18s %-16s %8s  %s\n", "IP", "MAC", "Vendor", "RTT(ms)", "Hostname");
    printf("%-16s %-18s %-16s %8s  %s\n",
           "──────────────", "─────────────────", "──────────────", "───────", "────────────────");

    int shown = 0;
    for (int i = 0; i < g_host_count; i++) {
        Host *h = &g_hosts[i];
        int is_self = (g_self_ip[0] && strcmp(h->ip, g_self_ip) == 0);

        /* Only show hosts with a real MAC, or the scanner itself */
        if (!h->mac[0] && !is_self) continue;

        const char *label = "";
        if (is_self) label = "(this device)";
        else if (h->hostname[0]) label = h->hostname;

        printf("%-16s %-18s %-16s %7.1f  %s\n",
               h->ip,
               h->mac[0] ? h->mac : "--",
               h->vendor[0] ? h->vendor : "",
               h->rtt_ms,
               label);
        shown++;
    }
    printf("\n[scanner] %d devices found (%d responded to ping)\n", shown, g_host_count);
}

static void print_json(void) {
    qsort(g_hosts, g_host_count, sizeof(Host), ip_cmp);

    /* Collect indices of hosts to show */
    int indices[MAX_HOSTS], shown = 0;
    for (int i = 0; i < g_host_count; i++) {
        int is_self = (g_self_ip[0] && strcmp(g_hosts[i].ip, g_self_ip) == 0);
        if (g_hosts[i].mac[0] || is_self)
            indices[shown++] = i;
    }

    printf("[\n");
    for (int s = 0; s < shown; s++) {
        Host *h = &g_hosts[indices[s]];
        int is_self = (g_self_ip[0] && strcmp(h->ip, g_self_ip) == 0);
        printf("  {\"ip\":\"%s\",\"mac\":\"%s\",\"vendor\":\"%s\",\"rtt\":%.1f,\"hostname\":\"%s\",\"self\":%s}%s\n",
               h->ip,
               h->mac[0] ? h->mac : "",
               h->vendor[0] ? h->vendor : "",
               h->rtt_ms,
               h->hostname[0] ? h->hostname : "",
               is_self ? "true" : "false",
               s < shown - 1 ? "," : "");
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
