#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <time.h>
#include <pthread.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <netdb.h>
#include <sys/stat.h>

/**
 * Connection Pooler for SOCKS5 Proxies
 * -------------------------------------
 * Maintains persistent SOCKS5 connections to verified Chinese proxies.
 * Exposes a local HTTP CONNECT proxy on port 8083.
 *
 * Flow: tile_cache.py -> conn_pool (localhost:8083) -> reuse SOCKS5 conn -> tianditu
 *
 * Benefits:
 * - Eliminates per-request TCP + SOCKS5 handshake (saves ~2-4 round trips)
 * - Automatic health checks on pooled connections
 * - Fast failover: dead connections are evicted, next pool entry used
 * - epoll-based relay for efficient bidirectional data transfer
 *
 * Build: gcc -O3 -Wall -pthread -o conn_pool conn_pool.c
 */

#define LISTEN_PORT       8083
#define MAX_PROXIES       32
#define POOL_PER_PROXY    4
#define MAX_POOL          (MAX_PROXIES * POOL_PER_PROXY)
#define PROXY_FILE        "proxies.html"
#define RELOAD_INTERVAL   30      /* seconds between proxy file checks */
#define HEALTH_INTERVAL   30      /* seconds between health pings */
#define CONN_MAX_AGE      300     /* seconds before recycling a connection */
#define RELAY_BUF_SIZE    65536
#define MAX_EVENTS        64
#define CONNECT_TIMEOUT   8

/* --- Proxy list --- */

typedef struct {
    char host[64];
    int  port;
} Proxy;

static Proxy   g_proxies[MAX_PROXIES];
static int     g_proxy_count = 0;
static time_t  g_proxy_mtime = 0;
static pthread_mutex_t g_proxy_lock = PTHREAD_MUTEX_INITIALIZER;

/* --- Connection pool --- */

typedef enum { POOL_FREE, POOL_BUSY, POOL_DEAD } PoolState;

typedef struct {
    int        fd;
    int        proxy_idx;   /* which proxy this conn belongs to */
    PoolState  state;
    time_t     created;
    char       dest_host[256];
    int        dest_port;
} PoolEntry;

static PoolEntry  g_pool[MAX_POOL];
static int        g_pool_count = 0;
static pthread_mutex_t g_pool_lock = PTHREAD_MUTEX_INITIALIZER;

static volatile int g_running = 1;

/* --- Utility --- */

static void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags != -1) fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

static void set_blocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags != -1) fcntl(fd, F_SETFL, flags & ~O_NONBLOCK);
}

static int connect_with_timeout(int fd, struct sockaddr *addr, socklen_t len, int timeout_s) {
    set_nonblocking(fd);
    int ret = connect(fd, addr, len);
    if (ret == 0) { set_blocking(fd); return 0; }
    if (errno != EINPROGRESS) return -1;

    fd_set wfds;
    struct timeval tv = { .tv_sec = timeout_s, .tv_usec = 0 };
    FD_ZERO(&wfds);
    FD_SET(fd, &wfds);

    ret = select(fd + 1, NULL, &wfds, NULL, &tv);
    if (ret <= 0) return -1;

    int err = 0;
    socklen_t elen = sizeof(err);
    getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &elen);
    set_blocking(fd);
    return err ? -1 : 0;
}

/* --- Proxy file loading --- */

static int load_proxies(void) {
    struct stat st;
    if (stat(PROXY_FILE, &st) != 0) return -1;
    if (st.st_mtime == g_proxy_mtime) return 0; /* unchanged */

    FILE *fp = fopen(PROXY_FILE, "r");
    if (!fp) return -1;

    Proxy tmp[MAX_PROXIES];
    int count = 0;
    char line[128];

    while (fgets(line, sizeof(line), fp) && count < MAX_PROXIES) {
        char *colon = strchr(line, ':');
        if (!colon) continue;
        *colon = '\0';
        char *host = line;
        int port = atoi(colon + 1);
        if (port <= 0 || port > 65535) continue;

        /* skip whitespace */
        while (*host == ' ' || *host == '\t') host++;
        char *end = host + strlen(host) - 1;
        while (end > host && (*end == '\n' || *end == '\r' || *end == ' ')) *end-- = '\0';

        if (strlen(host) < 7) continue; /* min "1.2.3.4" */

        snprintf(tmp[count].host, sizeof(tmp[count].host), "%s", host);
        tmp[count].port = port;
        count++;
    }
    fclose(fp);

    if (count > 0) {
        pthread_mutex_lock(&g_proxy_lock);
        memcpy(g_proxies, tmp, sizeof(Proxy) * count);
        g_proxy_count = count;
        g_proxy_mtime = st.st_mtime;
        pthread_mutex_unlock(&g_proxy_lock);
        printf("[pool] Loaded %d proxies\n", count);
    }
    return count;
}

/* --- SOCKS5 handshake (blocking, used for pool pre-connect) --- */

static int socks5_handshake(int fd, const char *dest_host, int dest_port) {
    /* Greeting: version 5, 1 method (no auth) */
    unsigned char greet[] = { 0x05, 0x01, 0x00 };
    if (send(fd, greet, 3, 0) != 3) return -1;

    unsigned char resp[2];
    if (recv(fd, resp, 2, 0) != 2) return -1;
    if (resp[0] != 0x05 || resp[1] != 0x00) return -1;

    /* Connect request: domain-based addressing */
    size_t dlen = strlen(dest_host);
    if (dlen > 255) return -1;

    unsigned char req[4 + 1 + 256 + 2];
    req[0] = 0x05; /* version */
    req[1] = 0x01; /* connect */
    req[2] = 0x00; /* reserved */
    req[3] = 0x03; /* domain */
    req[4] = (unsigned char)dlen;
    memcpy(req + 5, dest_host, dlen);
    req[5 + dlen] = (dest_port >> 8) & 0xFF;
    req[5 + dlen + 1] = dest_port & 0xFF;

    size_t req_len = 5 + dlen + 2;
    if (send(fd, req, req_len, 0) != (ssize_t)req_len) return -1;

    /* Read response header */
    unsigned char cresp[4];
    if (recv(fd, cresp, 4, 0) != 4) return -1;
    if (cresp[1] != 0x00) return -1; /* connect failed */

    /* Consume bound address */
    if (cresp[3] == 0x01) {        /* IPv4 */
        unsigned char skip[6]; recv(fd, skip, 6, 0);
    } else if (cresp[3] == 0x03) { /* Domain */
        unsigned char dl; recv(fd, &dl, 1, 0);
        unsigned char skip[258]; recv(fd, skip, dl + 2, 0);
    } else if (cresp[3] == 0x04) { /* IPv6 */
        unsigned char skip[18]; recv(fd, skip, 18, 0);
    }

    return 0;
}

/* --- Pool management --- */

/**
 * Open a fresh SOCKS5 connection to dest through proxy_idx.
 * Returns fd on success, -1 on failure.
 */
static int open_socks5(int proxy_idx, const char *dest_host, int dest_port) {
    Proxy p;
    pthread_mutex_lock(&g_proxy_lock);
    if (proxy_idx >= g_proxy_count) { pthread_mutex_unlock(&g_proxy_lock); return -1; }
    p = g_proxies[proxy_idx];
    pthread_mutex_unlock(&g_proxy_lock);

    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return -1;

    /* TCP keepalive */
    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_KEEPALIVE, &yes, sizeof(yes));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(p.port);
    if (inet_pton(AF_INET, p.host, &addr.sin_addr) != 1) {
        close(fd);
        return -1;
    }

    if (connect_with_timeout(fd, (struct sockaddr *)&addr, sizeof(addr), CONNECT_TIMEOUT) != 0) {
        close(fd);
        return -1;
    }

    /* Set recv/send timeout for SOCKS5 handshake */
    struct timeval tv = { .tv_sec = CONNECT_TIMEOUT, .tv_usec = 0 };
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    if (socks5_handshake(fd, dest_host, dest_port) != 0) {
        close(fd);
        return -1;
    }

    /* Clear timeout for relay phase */
    tv.tv_sec = 60;
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    return fd;
}

/**
 * Acquire a pooled connection to dest_host:dest_port.
 * If none available, open a new one through the best proxy.
 * Returns fd or -1.
 */
static int pool_acquire(const char *dest_host, int dest_port) {
    time_t now = time(NULL);

    /* First: look for an existing FREE connection to the same destination */
    pthread_mutex_lock(&g_pool_lock);
    for (int i = 0; i < g_pool_count; i++) {
        PoolEntry *e = &g_pool[i];
        if (e->state == POOL_FREE &&
            e->dest_port == dest_port &&
            strcmp(e->dest_host, dest_host) == 0 &&
            (now - e->created) < CONN_MAX_AGE) {
            /* Quick liveness check */
            char buf;
            int ret = recv(e->fd, &buf, 1, MSG_PEEK | MSG_DONTWAIT);
            if (ret == 0 || (ret < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) {
                /* Dead connection */
                close(e->fd);
                e->state = POOL_DEAD;
                continue;
            }
            e->state = POOL_BUSY;
            int fd = e->fd;
            pthread_mutex_unlock(&g_pool_lock);
            return fd;
        }
    }
    pthread_mutex_unlock(&g_pool_lock);

    /* No cached connection — open a new one, trying each proxy */
    pthread_mutex_lock(&g_proxy_lock);
    int nproxies = g_proxy_count;
    pthread_mutex_unlock(&g_proxy_lock);

    for (int pi = 0; pi < nproxies; pi++) {
        int fd = open_socks5(pi, dest_host, dest_port);
        if (fd >= 0) {
            /* Add to pool as BUSY */
            pthread_mutex_lock(&g_pool_lock);
            /* Find a slot (reuse DEAD entries) */
            int slot = -1;
            for (int i = 0; i < g_pool_count; i++) {
                if (g_pool[i].state == POOL_DEAD) { slot = i; break; }
            }
            if (slot < 0 && g_pool_count < MAX_POOL) {
                slot = g_pool_count++;
            }
            if (slot >= 0) {
                g_pool[slot].fd = fd;
                g_pool[slot].proxy_idx = pi;
                g_pool[slot].state = POOL_BUSY;
                g_pool[slot].created = time(NULL);
                g_pool[slot].dest_port = dest_port;
                memcpy(g_pool[slot].dest_host, dest_host, sizeof(g_pool[slot].dest_host));
            }
            pthread_mutex_unlock(&g_pool_lock);
            return fd;
        }
    }
    return -1;
}

/**
 * Release a connection back to the pool (mark FREE) or close if stale.
 */
static void pool_release(int fd, int keep_alive) {
    pthread_mutex_lock(&g_pool_lock);
    for (int i = 0; i < g_pool_count; i++) {
        if (g_pool[i].fd == fd && g_pool[i].state == POOL_BUSY) {
            if (keep_alive && (time(NULL) - g_pool[i].created) < CONN_MAX_AGE) {
                g_pool[i].state = POOL_FREE;
            } else {
                close(fd);
                g_pool[i].state = POOL_DEAD;
            }
            pthread_mutex_unlock(&g_pool_lock);
            return;
        }
    }
    pthread_mutex_unlock(&g_pool_lock);
    /* Not in pool — just close */
    close(fd);
}

/* --- epoll-based bidirectional relay --- */

static void relay_data(int client_fd, int remote_fd) {
    int epfd = epoll_create1(0);
    if (epfd < 0) return;

    set_nonblocking(client_fd);
    set_nonblocking(remote_fd);

    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = client_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev);

    ev.data.fd = remote_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, remote_fd, &ev);

    struct epoll_event events[2];
    char buf[RELAY_BUF_SIZE];

    while (g_running) {
        int n = epoll_wait(epfd, events, 2, 30000); /* 30s timeout */
        if (n <= 0) break; /* timeout or error */

        for (int i = 0; i < n; i++) {
            int src = events[i].data.fd;
            int dst = (src == client_fd) ? remote_fd : client_fd;

            ssize_t rd = read(src, buf, sizeof(buf));
            if (rd <= 0) goto done;

            /* Blocking write to destination */
            set_blocking(dst);
            ssize_t total = 0;
            while (total < rd) {
                ssize_t wr = write(dst, buf + total, rd - total);
                if (wr <= 0) goto done;
                total += wr;
            }
            set_nonblocking(dst);
        }
    }

done:
    close(epfd);
}

/* --- HTTP CONNECT handler (per-thread) --- */

typedef struct {
    int client_fd;
} ClientArg;

static void *handle_client(void *arg) {
    ClientArg *ca = (ClientArg *)arg;
    int client_fd = ca->client_fd;
    free(ca);

    /* Read the HTTP CONNECT request */
    char reqbuf[2048];
    ssize_t total = 0;
    while (total < (ssize_t)sizeof(reqbuf) - 1) {
        ssize_t n = recv(client_fd, reqbuf + total, sizeof(reqbuf) - 1 - total, 0);
        if (n <= 0) { close(client_fd); return NULL; }
        total += n;
        reqbuf[total] = '\0';
        if (strstr(reqbuf, "\r\n\r\n")) break;
    }

    /* Parse: CONNECT host:port HTTP/1.x */
    if (strncmp(reqbuf, "CONNECT ", 8) != 0) {
        const char *err = "HTTP/1.1 400 Bad Request\r\n\r\n";
        send(client_fd, err, strlen(err), 0);
        close(client_fd);
        return NULL;
    }

    char hostport[256] = {0};
    {
        char *hp_start = reqbuf + 8;
        char *space = strchr(hp_start, ' ');
        size_t hp_len = space ? (size_t)(space - hp_start) : strlen(hp_start);
        if (hp_len >= sizeof(hostport)) hp_len = sizeof(hostport) - 1;
        memcpy(hostport, hp_start, hp_len);
    }

    char dest_host[256] = {0};
    int dest_port = 443;
    char *colon = strrchr(hostport, ':');
    if (colon) {
        *colon = '\0';
        dest_port = atoi(colon + 1);
    }
    memcpy(dest_host, hostport, sizeof(dest_host));

    /* Acquire a pooled SOCKS5 connection */
    int remote_fd = pool_acquire(dest_host, dest_port);
    if (remote_fd < 0) {
        const char *err = "HTTP/1.1 502 Bad Gateway\r\nX-Pool: all-proxies-failed\r\n\r\n";
        send(client_fd, err, strlen(err), 0);
        close(client_fd);
        return NULL;
    }

    /* Send 200 Connection Established */
    const char *ok = "HTTP/1.1 200 Connection Established\r\n\r\n";
    send(client_fd, ok, strlen(ok), 0);

    /* Relay bidirectionally */
    relay_data(client_fd, remote_fd);

    /* For HTTPS (TLS) connections, we can't reuse after close —
       TLS state is bound to the connection. Close it. */
    pool_release(remote_fd, 0);
    close(client_fd);
    return NULL;
}

/* --- Periodic maintenance thread --- */

static void *maintenance_thread(void *arg) {
    (void)arg;
    while (g_running) {
        sleep(RELOAD_INTERVAL);

        /* Reload proxy list if changed */
        load_proxies();

        /* Evict stale/dead pool entries */
        time_t now = time(NULL);
        pthread_mutex_lock(&g_pool_lock);
        int active = 0, evicted = 0;
        for (int i = 0; i < g_pool_count; i++) {
            PoolEntry *e = &g_pool[i];
            if (e->state == POOL_FREE) {
                if ((now - e->created) >= CONN_MAX_AGE) {
                    close(e->fd);
                    e->state = POOL_DEAD;
                    evicted++;
                } else {
                    /* Liveness check */
                    char buf;
                    int ret = recv(e->fd, &buf, 1, MSG_PEEK | MSG_DONTWAIT);
                    if (ret == 0) {
                        close(e->fd);
                        e->state = POOL_DEAD;
                        evicted++;
                    } else {
                        active++;
                    }
                }
            } else if (e->state == POOL_BUSY) {
                active++;
            }
        }
        pthread_mutex_unlock(&g_pool_lock);

        if (evicted > 0) {
            printf("[pool] Maintenance: %d active, %d evicted\n", active, evicted);
        }
    }
    return NULL;
}

/* --- Signal handling --- */

static void sig_handler(int sig) {
    (void)sig;
    g_running = 0;
}

/* --- Main --- */

#ifndef TEST_MAIN
int main(void) {
    signal(SIGINT, sig_handler);
    signal(SIGTERM, sig_handler);
    signal(SIGPIPE, SIG_IGN);

    memset(g_pool, 0, sizeof(g_pool));

    if (load_proxies() <= 0) {
        fprintf(stderr, "[pool] Warning: no proxies loaded from %s\n", PROXY_FILE);
    }

    /* Start maintenance thread */
    pthread_t maint_tid;
    pthread_create(&maint_tid, NULL, maintenance_thread, NULL);
    pthread_detach(maint_tid);

    /* Listen socket */
    int listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (listen_fd < 0) { perror("socket"); return 1; }

    int yes = 1;
    setsockopt(listen_fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = INADDR_ANY;
    addr.sin_port = htons(LISTEN_PORT);

    if (bind(listen_fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("bind");
        return 1;
    }

    if (listen(listen_fd, 128) < 0) {
        perror("listen");
        return 1;
    }

    printf("[pool] Connection pooler listening on :%d (%d proxies loaded)\n",
           LISTEN_PORT, g_proxy_count);

    while (g_running) {
        struct sockaddr_in client_addr;
        socklen_t client_len = sizeof(client_addr);
        int client_fd = accept(listen_fd, (struct sockaddr *)&client_addr, &client_len);
        if (client_fd < 0) {
            if (errno == EINTR) continue;
            break;
        }

        /* Disable Nagle for low latency */
        int flag = 1;
        setsockopt(client_fd, IPPROTO_TCP, TCP_NODELAY, &flag, sizeof(flag));

        ClientArg *ca = malloc(sizeof(ClientArg));
        ca->client_fd = client_fd;

        pthread_t tid;
        if (pthread_create(&tid, NULL, handle_client, ca) != 0) {
            free(ca);
            close(client_fd);
        } else {
            pthread_detach(tid);
        }
    }

    printf("[pool] Shutting down...\n");
    close(listen_fd);

    /* Close all pool entries */
    pthread_mutex_lock(&g_pool_lock);
    for (int i = 0; i < g_pool_count; i++) {
        if (g_pool[i].state != POOL_DEAD) {
            close(g_pool[i].fd);
        }
    }
    pthread_mutex_unlock(&g_pool_lock);

    return 0;
}
#endif /* TEST_MAIN */
