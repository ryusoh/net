#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF IP Reputation Monitor (XDP)
 * -------------------------------
 * This program builds a real-time "heat map" of network activity.
 * It tracks how many packets are going to/from every IP address 
 * and identifies those with a "bad reputation".
 */

struct ip_stats {
    __u64 packet_count;
    __u64 byte_count;
    __u64 last_seen;
};

// Map 1: The "Heat Map" - Tracks every IP we talk to
struct {
    __uint(type, BPF_MAP_TYPE_LRU_HASH); // LRU ensures we don't run out of memory
    __uint(max_entries, 10000);
    __type(key, __u32);   // IP Address
    __type(value, struct ip_stats);
} stats_map SEC(".maps");

// Map 2: The "Watchlist" - IPs flagged by our AI or community lists
struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);   // IP Address
    __type(value, __u32); // Reputation Score (0-100)
} watchlist_map SEC(".maps");

SEC("xdp")
int xdp_reputation_monitor(struct xdp_md *ctx) {
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return XDP_PASS;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return XDP_PASS;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return XDP_PASS;

    __u32 ip = iph->daddr; // Monitor destination IPs
    __u64 now = bpf_ktime_get_ns();

    // 1. Update the Heat Map
    struct ip_stats *stats = bpf_map_lookup_elem(&stats_map, &ip);
    if (stats) {
        stats->packet_count++;
        stats->byte_count += (data_end - data);
        stats->last_seen = now;
    } else {
        struct ip_stats new_stats = {1, (data_end - data), now};
        bpf_map_update_elem(&stats_map, &ip, &new_stats, BPF_ANY);
    }

    // 2. Check the Watchlist
    __u32 *score = bpf_map_lookup_elem(&watchlist_map, &ip);
    if (score && *score > 50) {
        // High-risk IP detected!
        // In a real app, we could trigger a user-space alert here.
        // bpf_printk("ALERT: Packet to High-Risk IP %pI4 (Score: %d)\n", &ip, *score);
    }

    return XDP_PASS;
}

char LICENSE[] SEC("license") = "GPL";
