package vpn

import (
	"fmt"

	qrcode "github.com/skip2/go-qrcode"
)

// GenerateQR returns a PNG byte slice of the VPN configuration QR code.
// The size parameter determines the pixel size (e.g., 256 for 256x256).
func GenerateQR(config string, size int) ([]byte, error) {
	png, err := qrcode.Encode(config, qrcode.Medium, size)
	if err != nil {
		return nil, fmt.Errorf("failed to encode QR code: %w", err)
	}
	return png, nil
}
