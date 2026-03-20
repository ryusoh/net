#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <arpa/inet.h>
#include <sys/socket.h>

/**
 * Connectivity Spoofer
 * --------------------
 * Responds to Windows NCSI and Apple Captive Portal probes.
 * Ensures devices always show "Connected" status.
 */

#define PORT 80
#define BUFFER_SIZE 1024

const char *MS_RESPONSE = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 22\r\n\r\nMicrosoft Connect Test";
const char *APPLE_RESPONSE = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>";

void handle_client(int client_fd) {
    char buffer[BUFFER_SIZE];
    ssize_t n = read(client_fd, buffer, BUFFER_SIZE);
    if (n <= 0) {
        close(client_fd);
        return;
    }

    if (strstr(buffer, "msftconnecttest.com") || strstr(buffer, "connecttest.txt")) {
        if (write(client_fd, MS_RESPONSE, strlen(MS_RESPONSE)) < 0) perror("write ms");
        printf("[NCSI] Spoofed Windows Connectivity Check\n");
    } else if (strstr(buffer, "apple.com") || strstr(buffer, "hotspot-detect.html")) {
        if (write(client_fd, APPLE_RESPONSE, strlen(APPLE_RESPONSE)) < 0) perror("write apple");
        printf("[CNA] Spoofed Apple Connectivity Check\n");
    } else {
        // Default success for others (Android, etc.)
        const char *gen_204 = "HTTP/1.1 204 No Content\r\n\r\n";
        if (write(client_fd, gen_204, strlen(gen_204)) < 0) perror("write 204");
    }
    close(client_fd);
}

#ifndef TEST_MAIN
int main() {
    int server_fd, client_fd;
    struct sockaddr_in address;
    int opt = 1;
    int addrlen = sizeof(address);

    if ((server_fd = socket(AF_INET, SOCK_STREAM, 0)) == 0) exit(1);
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(PORT);

    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        perror("Bind failed. Try running with sudo.");
        exit(1);
    }
    listen(server_fd, 10);

    printf("[*] Connectivity Spoofer Active on port %d...\n", PORT);

    while (1) {
        client_fd = accept(server_fd, (struct sockaddr *)&address, (socklen_t*)&addrlen);
        handle_client(client_fd);
    }
    return 0;
}
#endif
