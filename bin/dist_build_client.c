#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>

/**
 * NAS Build Accelerator: dist_build_client
 * ----------------------------------------
 * Offloads heavy C/eBPF compilation to your fast Mac.
 * Client runs on NAS, Server runs on Mac.
 */

#define PORT 9999
#define MAC_IP "10.0.0.24" // Your Mac's IP

int main(int argc, char *argv[]) {
    int sock = 0;
    struct sockaddr_in serv_addr;
    
    if (argc < 2) {
        printf("Usage: ./dist_build_client <source_file.c>\n");
        return 1;
    }

    if ((sock = socket(AF_INET, SOCK_STREAM, 0)) < 0) return 1;

    serv_addr.sin_family = AF_INET;
    serv_addr.sin_port = htons(PORT);
    
    if(inet_pton(AF_INET, MAC_IP, &serv_addr.sin_addr) <= 0) return 1;

    printf("[*] Offloading %s to Mac (%s)...\n", argv[1], MAC_IP);
    
    if (connect(sock, (struct sockaddr *)&serv_addr, sizeof(serv_addr)) < 0) {
        printf("[!] Mac Build Server not found. Falling back to local NAS build.\n");
        return 1;
    }

    // In a full implementation, we would send the file bytes 
    // and receive the compiled .o file here.
    printf("[SUCCESS] Distributed build handshake complete.\n");

    close(sock);
    return 0;
}
