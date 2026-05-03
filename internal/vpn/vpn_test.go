package vpn

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestGenerateKeys(t *testing.T) {
	priv, pub, err := GenerateKeys()
	if err != nil {
		t.Fatalf("GenerateKeys failed: %v", err)
	}

	if len(priv) == 0 || len(pub) == 0 {
		t.Fatal("Keys are empty")
	}

	// Verify Base64
	_, err = base64.StdEncoding.DecodeString(priv)
	if err != nil {
		t.Errorf("Private key is not valid base64: %v", err)
	}
	_, err = base64.StdEncoding.DecodeString(pub)
	if err != nil {
		t.Errorf("Public key is not valid base64: %v", err)
	}
}

func TestGenerateClientConfig(t *testing.T) {
	cPriv, _, err := GenerateKeys()
	if err != nil {
		t.Fatalf("GenerateKeys for client failed: %v", err)
	}
	_, sPub, err := GenerateKeys()
	if err != nil {
		t.Fatalf("GenerateKeys for server failed: %v", err)
	}

	// Public key is embedded in config
	conf := GenerateClientConfig(cPriv, sPub, "1.2.3.4", "10.100.0.2/32")
	if !strings.Contains(conf, "PrivateKey = "+cPriv) {
		t.Error("Config missing PrivateKey")
	}
	if !strings.Contains(conf, "PublicKey = "+sPub) {
		t.Error("Config missing Public Key")
	}
	if !strings.Contains(conf, "Endpoint = 1.2.3.4:51820") {
		t.Error("Config missing Endpoint")
	}
	if !strings.Contains(conf, "Address = 10.100.0.2/32") {
		t.Error("Config missing client IP address")
	}
}

func TestGenerateQR(t *testing.T) {
	png, err := GenerateQR("test data", 256)
	if err != nil {
		t.Fatalf("GenerateQR failed: %v", err)
	}
	if len(png) == 0 {
		t.Fatal("QR code PNG is empty")
	}
	// Check PNG magic header
	if string(png[1:4]) != "PNG" {
		t.Error("QR code is not a valid PNG")
	}
}
