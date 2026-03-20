#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/tcp.h>
#include <linux/pkt_cls.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF-based SNAT (Source Network Address Translation)
 * ----------------------------------------------------
 * Translates internal client IPs to the NAS external IP.
 * Hook: TC (Traffic Control) Egress for translation, 
 *       TC Ingress for reverse translation.
 */

#define NAS_IP 0xA900000A // 10.0.0.169 in hex

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);   // Client IP + Port hash
    __type(value, __u32); // Original Client IP
} snat_map SEC(".maps");

SEC("classifier")
int tc_snat_egress(struct __sk_buff *skb) {
    void *data_end = (void *)(long)skb->data_end;
    void *data = (void *)(long)skb->data;

    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end) return TC_ACT_OK;
    if (eth->h_proto != bpf_htons(ETH_P_IP)) return TC_ACT_OK;

    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end) return TC_ACT_OK;

    // Only translate if source is NOT the NAS itself
    if (iph->saddr != bpf_htonl(NAS_IP)) {
        __u32 old_src = iph->saddr;
        __u32 new_src = bpf_htonl(NAS_IP);

        // Store original IP for reverse translation
        bpf_map_update_elem(&snat_map, &new_src, &old_src, BPF_ANY);

        // Rewrite Source IP to NAS IP
        bpf_skb_store_bytes(skb, offsetof(struct ethhdr, h_proto) + offsetof(struct iphdr, saddr), &new_src, sizeof(new_src), 0);
        
        // bpf_printk("SNAT: %pI4 -> %pI4\n", &old_src, &new_src);
    }

    return TC_ACT_OK;
}

char LICENSE[] SEC("license") = "GPL";
