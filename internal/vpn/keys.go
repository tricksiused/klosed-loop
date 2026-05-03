package vpn

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/curve25519"
)

// GenerateKeys returns a new Curve25519 Private and Public Key as Base64 encoded strings.
// It follows WireGuard's key generation procedure (clamping).
func GenerateKeys() (privateKey string, publicKey string, err error) {
	var private [32]byte
	_, err = rand.Read(private[:])
	if err != nil {
		return "", "", fmt.Errorf("failed to generate random bytes: %w", err)
	}

	// Clamp the private key as per Curve25519 spec for WireGuard
	private[0] &= 248
	private[31] &= 127
	private[31] |= 64

	public, err := curve25519.X25519(private[:], curve25519.Basepoint)
	if err != nil {
		return "", "", fmt.Errorf("failed to derive public key: %w", err)
	}

	return base64.StdEncoding.EncodeToString(private[:]), base64.StdEncoding.EncodeToString(public), nil
}
