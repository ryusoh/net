#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/udp.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF Deep Packet Inspection (DPI) - DNS Watcher
 * ----------------------------------------------
 * This is "Layer 7" magic in a "Layer 2" hook (XDP).
 * It looks inside the payload of UDP packets to find DNS queries
 * for specific domains like "tianditu".
 */

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 256);
    __type(key, char[16]); // Domain snippet
    __type(value, __u64);  // Hit counter
} dns_hits SEC(".maps");

SEC("xdp")
int xdp_dns_watch(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    // 1. Parse Ethernet
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    // 2. Parse IP
    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;
    if (iph->protocol != IPPROTO_UDP) return XDP_PASS;

    // 3. Parse UDP
    struct udphdr *udp = (void *)iph + sizeof(struct iphdr);
    if ((void *)(udp + 1) > data_end) return XDP_PASS;

    // 4. Check if it's DNS traffic (Port 53)
    if (udp->dest != bpf_htons(53)) return XDP_PASS;

    // 5. Deep Packet Inspection (DPI)
    // We look for the string "tianditu" in the DNS payload.
    // "tianditu" in hex: 74 69 61 6e 64 69 74 75
    unsigned char *payload = (unsigned char *)(udp + 1);
    
    // We must stay within data_end for safety
    if ((void *)(payload + 8) > data_end) return XDP_PASS;

    // Simple pattern match for "tianditu"
    if (payload[0] == 't' && payload[1] == 'i' && payload[2] == 'a' && payload[3] == 'n') {
        char key[16] = "tianditu";
        __u64 *count = bpf_map_lookup_elem(&dns_hits, &key);
        if (count) {
            __sync_fetch_and_add(count, 1);
        } else {
            __u64 initial = 1;
            bpf_map_update_elem(&dns_hits, &key, &initial, BPF_ANY);
        }
        // bpf_printk("DNS Query for Tianditu detected in Kernel!\n");
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
