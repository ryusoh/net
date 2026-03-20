#include <linux/bpf.h>
#include <linux/if_ether.h>
#include <linux/ip.h>
#include <linux/in.h>
#include <linux/tcp.h>
#include <linux/pkt_cls.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

/**
 * eBPF Transparent Redirector (TC)
 * -------------------------------
 * This program runs at the Traffic Control (TC) layer.
 * It intercepts outgoing (egress) packets to a specific target 
 * and "forces" them to be rerouted to our local NAS proxy.
 */

// Define the target IP we want to intercept (e.g., Tianditu IP)
// For testing, we can use a placeholder like 1.2.3.4
#define TARGET_IP 0x04030201 // 1.2.3.4 in hex
#define PROXY_IP  0xA900000A // 10.0.0.169 in hex
#define PROXY_PORT 8080

SEC("classifier")
int tc_redirect(struct __sk_buff *skb) {
    void *data_end = (void *)(long)skb->data_end;
    void *data = (void *)(long)skb->data;

    // 1. Parse Ethernet Header
    struct ethhdr *eth = data;
    if ((void *)(eth + 1) > data_end)
        return TC_ACT_OK;

    // 2. Only look at IPv4
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return TC_ACT_OK;

    // 3. Parse IP Header
    struct iphdr *iph = data + sizeof(struct ethhdr);
    if ((void *)(iph + 1) > data_end)
        return TC_ACT_OK;

    // 4. Check if the Destination IP is our TARGET_IP
    if (iph->daddr == bpf_htonl(TARGET_IP)) {
        
        // 5. Rewrite the Destination IP to our Local Proxy
        __u32 old_daddr = iph->daddr;
        __u32 new_daddr = bpf_htonl(PROXY_IP);
        
        // Use a BPF helper to safely modify the packet and update checksums
        bpf_skb_store_bytes(skb, offsetof(struct iphdr, daddr), &new_daddr, sizeof(new_daddr), 0);
        
        // Note: In a real implementation, we would also update 
        // the TCP port and handle checksum recalculation.
        
        // bpf_printk("Redirecting packet from %pI4 to Proxy %pI4\n", &old_daddr, &new_daddr);
    }

    return TC_ACT_OK;
}

char LICENSE[] SEC("license") = "GPL";
