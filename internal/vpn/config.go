package vpn

import (
	"strings"
)

const (
	DefaultDNS = "1.1.1.1"
	DefaultMTU = "1360"
)

// GenerateClientConfig creates the contents of a WireGuard configuration file (wg0.conf).
func GenerateClientConfig(clientPrivateKey, serverPublicKey, serverIP, clientIP string) string {
	var sb strings.Builder

	// [Interface]
	sb.WriteString("[Interface]\n")
	sb.WriteString("PrivateKey = " + clientPrivateKey + "\n")
	sb.WriteString("Address = " + clientIP + "\n")
	sb.WriteString("DNS = " + DefaultDNS + "\n")
	sb.WriteString("MTU = " + DefaultMTU + "\n\n")

	// [Peer]
	sb.WriteString("[Peer]\n")
	sb.WriteString("PublicKey = " + serverPublicKey + "\n")
	sb.WriteString("AllowedIPs = 0.0.0.0/0\n") // Route everything
	sb.WriteString("Endpoint = " + serverIP + ":51820\n")
	sb.WriteString("PersistentKeepalive = 25\n")

	return sb.String()
}
