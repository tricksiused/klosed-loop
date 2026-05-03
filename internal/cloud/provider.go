package cloud

import (
	"context"
)

// InstanceDetails holds common operational data
type InstanceDetails struct {
	InstanceID       string `json:"instance_id"`
	InstanceType     string `json:"instance_type"`
	PublicIP         string `json:"public_ip"`
	State            string `json:"state"`
	LaunchTime       string `json:"launch_time"` // ISO8601
	ImageID          string `json:"image_id"`
	AvailabilityZone string `json:"availability_zone"`
	CoreCount        int    `json:"core_count"`
	MemorySizeGB     string `json:"memory_size_gb"`
	Provider         string `json:"provider"`
}

// InstanceMetrics holds telemetry data
type InstanceMetrics struct {
	CPU        float64 `json:"cpu"`         // Percentage 0-100
	Memory     float64 `json:"memory"`      // Percentage 0-100 (Estimate/Null)
	NetworkIn  float64 `json:"network_in"`  // Bytes/sec
	NetworkOut float64 `json:"network_out"` // Bytes/sec
	Timestamp  string  `json:"timestamp"`
}

// Provider defines the interface that all cloud providers must implement
type Provider interface {
	// Name returns the provider name (AWS, GCP, etc)
	Name() string

	// VerifyAuth checks if the credentials are valid
	VerifyAuth(ctx context.Context) (bool, error)

	// VerifyPermissions checks if the provider has necessary permissions (returning missing perms list, identity string, error)
	VerifyPermissions(ctx context.Context, region string) ([]string, string, error)

	// Reload forces the provider to refresh its configuration (e.g. after profile switch)
	Reload(ctx context.Context) error

	// GetRegions returns a list of available/enabled regions
	GetRegions(ctx context.Context) ([]string, error)

	// ListActiveInstances searches for running instances managed by KlosedLoop
	ListActiveInstances(ctx context.Context) ([]InstanceDetails, error)

	// GetLatestMetrics returns the most recent telemetry data for an instance
	GetLatestMetrics(ctx context.Context, region, instanceID string) (*InstanceMetrics, error)

	// GetSpotPrice returns the current spot price estimate for the default instance type
	GetSpotPrice(ctx context.Context, region string) (string, error)

	// Launch starts a new instance.
	// clientPublicKeys: List of WireGuard public keys for peers
	// serverPrivateKey: The server's WireGuard private key
	// durationMinutes: Auto-termination timer (0 to disable)
	// progress: Callback for status updates
	Launch(ctx context.Context, region string, clientPublicKeys []string, serverPrivateKey string, durationMinutes int, progress func(string)) (instanceID, publicIP string, err error)

	// GetInstanceDetails fetches status of a running instance
	GetInstanceDetails(ctx context.Context, region, instanceID string) (*InstanceDetails, error)

	// Terminate stops and deletes the instance
	Terminate(ctx context.Context, region, instanceID string) error
}
