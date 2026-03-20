#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/udp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * High-Speed Reverse DNS (PTR) Watcher
 * ------------------------------------
 * Monitors DNS traffic and identifies PTR queries 
 * used for local network discovery.
 */

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);   // Queried IP (from PTR string)
    __type(value, __u64); // Query Count
} ptr_queries SEC(".maps");

SEC("xdp")
int xdp_ptr_watcher(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;
    if (iph->protocol != IPPROTO_UDP) return XDP_PASS;

    struct udphdr *udp = (void *)iph + sizeof(struct iphdr);
    if ((void *)(udp + 1) > data_end) return XDP_PASS;

    if (udp->dest != bpf_htons(53)) return XDP_PASS;

    // Deep Packet Inspection for PTR record pattern: "in-addr.arpa"
    // "in-addr" in hex: 69 6e 2d 61 64 64 72
    unsigned char *payload = (unsigned char *)(udp + 1);
    if ((void *)(payload + 16) > data_end) return XDP_PASS;

    #pragma unroll
    for (int i = 0; i < 8; i++) {
        if (payload[i] == 'i' && payload[i+1] == 'n' && payload[i+2] == '-') {
            // Found a Reverse DNS query!
            __u32 dummy_key = 0; // Simplified for demo
            __u64 *count = bpf_map_lookup_elem(&ptr_queries, &dummy_key);
            if (count) {
                __sync_fetch_and_add(count, 1);
            } else {
                __u64 initial = 1;
                bpf_map_update_elem(&ptr_queries, &dummy_key, &initial, BPF_ANY);
            }
            break;
        }
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
