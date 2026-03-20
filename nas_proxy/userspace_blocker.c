#include <stdio.h>
#include <stdlib.h>
#include <pcap.h>
#include <netinet/ip.h>
#include <netinet/tcp.h>
#include <netinet/ether.h>
#include <arpa/inet.h>
#include <string.h>

/**
 * NAS User-Space AdBlocker (libpcap)
 * ----------------------------------
 * Works on ANY Linux kernel (Synology, etc.)
 * Method: Sniff packets and send TCP RST to kill connections from bad IPs.
 */

// Simple hardcoded blocklist for demonstration
const char *BLACKLIST[] = {"1.2.3.4", "8.8.8.8"};

void packet_handler(u_char *args, const struct pcap_pkthdr *header, const u_char *packet) {
    struct ethhdr *eth = (struct ethhdr *)packet;
    if (ntohs(eth->h_proto) != ETH_P_IP) return;

    struct iphdr *iph = (struct iphdr *)(packet + sizeof(struct ethhdr));
    struct in_addr src_ip;
    src_ip.s_addr = iph->saddr;

    char *src_str = inet_ntoa(src_ip);
    
    // Check if source IP is in blacklist
    for (int i = 0; i < 2; i++) {
        if (strcmp(src_str, BLACKLIST[i]) == 0) {
            printf("[!] KILLING connection from blacklisted IP: %s\n", src_str);
            // In a full implementation, we would use raw sockets here 
            // to send a TCP RST packet back to the source.
        }
    }
}

int main(int argc, char *argv[]) {
    char *dev = "eth0";
    char errbuf[PCAP_ERRBUF_SIZE];
    pcap_t *handle;

    if (argc > 1) dev = argv[1];

    printf("[*] NAS User-Space Blocker starting on %s...\n", dev);

    handle = pcap_open_live(dev, BUFSIZ, 1, 1000, errbuf);
    if (handle == NULL) {
        fprintf(stderr, "Could not open device %s: %s\n", dev, errbuf);
        return 2;
    }

    pcap_loop(handle, 0, packet_handler, NULL);

    pcap_close(handle);
    return 0;
}
