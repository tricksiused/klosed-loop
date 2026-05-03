package gcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"google.golang.org/api/compute/v1"
	"google.golang.org/api/option"
)

type CredentialFile struct {
	Type      string `json:"type"`
	ProjectID string `json:"project_id"`
}

// CredentialsFile is the path to the stored JSON key
func CredentialsFile() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".config", "klosedloop")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "gcp_credentials.json"), nil
}

// SaveCredentials writes the provided JSON key string to the config file
func SaveCredentials(jsonContent string) error {
	path, err := CredentialsFile()
	if err != nil {
		return err
	}
	// Basic validation
	var c CredentialFile
	if err := json.Unmarshal([]byte(jsonContent), &c); err != nil {
		return fmt.Errorf("invalid json: %w", err)
	}
	if c.Type != "service_account" {
		return fmt.Errorf("expected type 'service_account', got '%s'", c.Type)
	}

	return os.WriteFile(path, []byte(jsonContent), 0600)
}

// LoadProjectID reads the credentials file and returns the project ID
func LoadProjectID() (string, error) {
	path, err := CredentialsFile()
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	var c CredentialFile
	if err := json.Unmarshal(data, &c); err != nil {
		return "", err
	}
	return c.ProjectID, nil
}

// VerifyAuth checks if the stored credentials are valid by attempting to list regions.
func VerifyAuth(ctx context.Context) (bool, error) {
	projectID, err := LoadProjectID()
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}

	path, err := CredentialsFile()
	if err != nil {
		return false, err
	}

	// Create Client
	svc, err := compute.NewService(ctx, option.WithCredentialsFile(path))
	if err != nil {
		return false, fmt.Errorf("failed to create client: %w", err)
	}

	// Just check if we can verify the project exists or list regions
	// Projects.Get requires Cloud Resource Manager API usually?
	// Compute.Regions.List is safer for Compute Engine specific enabled check.
	_, err = svc.Regions.List(projectID).Do()
	if err != nil {
		return false, fmt.Errorf("api check failed: %w", err)
	}

	return true, nil
}
