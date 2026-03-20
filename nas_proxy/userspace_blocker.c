#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <arpa/inet.h>

#ifdef __linux__
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <netpacket/packet.h>
#include <net/if.h>
#endif

/**
 * NAS User-Space Blocker (Raw Sockets)
 * ------------------------------------
 * Pure Linux C implementation. Zero dependencies.
 * No libpcap required. No external headers required.
 */

const char *BLACKLIST[] = {"1.2.3.4", "8.8.8.8"};

#ifndef TEST_MAIN
int main(int argc, char *argv[]) {
#ifndef __linux__
    printf("[!] This tool requires a Linux kernel (Raw Sockets).\n");
    return 0;
#else
    int sock_raw;
    unsigned char *buffer = (unsigned char *)malloc(65536);

    // 1. Create a Raw Socket to sniff all traffic
    sock_raw = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));
    if (sock_raw < 0) {
        perror("Socket Error (Try running with sudo)");
        return 1;
    }

    printf("[*] NAS Pure-C Blocker active on Raw Socket...\n");

    while (1) {
        struct sockaddr saddr;
        int saddr_size = sizeof(saddr);
        ssize_t data_size = recvfrom(sock_raw, buffer, 65536, 0, &saddr, (socklen_t*)&saddr_size);

        if (data_size < 0) continue;

        // Parse IP Header
        struct ethhdr *eth = (struct ethhdr *)buffer;
        if (ntohs(eth->h_proto) == ETH_P_IP) {
            struct iphdr *iph = (struct iphdr *)(buffer + sizeof(struct ethhdr));
            struct in_addr src;
            src.s_addr = iph->saddr;
            char *src_ip = inet_ntoa(src);

            // Check Blacklist
            for (int i = 0; i < 2; i++) {
                if (strcmp(src_ip, BLACKLIST[i]) == 0) {
                    printf("[!] DETECTED blacklisted traffic from: %s\n", src_ip);
                }
            }
        }
    }

    close(sock_raw);
    return 0;
#endif  // __linux__
}
#endif  // TEST_MAIN
