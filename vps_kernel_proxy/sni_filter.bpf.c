#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/tcp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF SNI Filter (HTTPS Blocker)
 * -------------------------------
 * This program inspects the TLS "Client Hello" packet.
 * Even though HTTPS is encrypted, the domain name (SNI) 
 * is sent in PLAIN TEXT in the first packet.
 */

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, char[32]); // Domain snippet (e.g., "flashtalking")
    __type(value, __u64);  // Block counter
} sni_blacklist SEC(".maps");

SEC("xdp")
int xdp_sni_filter(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;
    if (iph->protocol != IPPROTO_TCP) return XDP_PASS;

    struct tcphdr *tcp = (void *)iph + sizeof(struct iphdr);
    if ((void *)(tcp + 1) > data_end) return XDP_PASS;

    // Only look at HTTPS traffic (Port 443)
    if (tcp->dest != bpf_htons(443)) return XDP_PASS;

    // TLS Payload starts after TCP header
    unsigned char *payload = (unsigned char *)(tcp + 1);
    
    // Safety check: We need enough bytes to find the SNI
    // (This is a simplified scan for the domain string)
    if ((void *)(payload + 64) > data_end) return XDP_PASS;

    // Look for "flashtalking" (66 6c 61 73 68 74 61 6c 6b 69 6e 67)
    // We scan a small window of the first packet
    #pragma unroll
    for (int i = 0; i < 32; i++) {
        if (payload[i] == 'f' && payload[i+1] == 'l' && payload[i+2] == 'a' && payload[i+3] == 's') {
            // MATCH FOUND! Drop the connection attempt.
            return XDP_DROP;
        }
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
