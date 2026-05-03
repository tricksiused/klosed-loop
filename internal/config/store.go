package config

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/ini.v1"
)

// DefaultProfile is the AWS profile name to use/save.
const DefaultProfile = "default"

// GetCredentialsPath returns the standard location for AWS credentials.
func GetCredentialsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".aws", "credentials"), nil
}

// Profile represents an AWS credential profile.
type Profile struct {
	Name         string `json:"name"`
	AccessKey    string `json:"access_key"`
	SecretKey    string `json:"secret_key"`
	SessionToken string `json:"session_token,omitempty"`
}

// ListProfiles returns all profile names from the AWS credentials file.
func ListProfiles() ([]string, error) {
	path, err := GetCredentialsPath()
	if err != nil {
		return nil, err
	}
	cfg, err := ini.Load(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var profiles []string
	for _, section := range cfg.Sections() {
		if section.Name() != ini.DefaultSection {
			profiles = append(profiles, section.Name())
		}
	}
	return profiles, nil
}

// SaveProfile writes the credentials to a specific profile section.
func SaveProfile(name, accessKeyID, secretAccessKey, sessionToken string) error {
	path, err := GetCredentialsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return fmt.Errorf("failed to create .aws directory: %w", err)
	}

	cfg, err := ini.Load(path)
	if err != nil {
		cfg = ini.Empty()
	}

	sec, err := cfg.NewSection(name)
	if err != nil {
		sec = cfg.Section(name)
	}

	sec.Key("aws_access_key_id").SetValue(accessKeyID)
	sec.Key("aws_secret_access_key").SetValue(secretAccessKey)
	if sessionToken != "" {
		sec.Key("aws_session_token").SetValue(sessionToken)
	} else {
		sec.DeleteKey("aws_session_token")
	}

	if err := cfg.SaveTo(path); err != nil {
		return fmt.Errorf("failed to save credentials file: %w", err)
	}
	return nil
}

// DeleteProfile removes a profile from the credentials file.
func DeleteProfile(name string) error {
	path, err := GetCredentialsPath()
	if err != nil {
		return err
	}
	cfg, err := ini.Load(path)
	if err != nil {
		return err
	}
	cfg.DeleteSection(name)
	return cfg.SaveTo(path)
}

// LoadProfileCredentials reads credentials for a specific profile.
func LoadProfileCredentials(profile string) (string, string, string, error) {
	path, err := GetCredentialsPath()
	if err != nil {
		return "", "", "", err
	}

	cfg, err := ini.Load(path)
	if err != nil {
		return "", "", "", err
	}

	sec := cfg.Section(profile)
	return sec.Key("aws_access_key_id").String(), sec.Key("aws_secret_access_key").String(), sec.Key("aws_session_token").String(), nil
}

// Deprecated: Use LoadProfileCredentials("default") instead.
func LoadCredentials() (string, string, string, error) {
	return LoadProfileCredentials(DefaultProfile)
}

// DeviceConfig holds a single device's WireGuard config and QR code for persistence.
type DeviceConfig struct {
	Name   string `json:"name"`
	Config string `json:"config"`
	QRCode string `json:"qr_code"`
}

// Session holds the active VPN state.
type Session struct {
	InstanceID      string
	Provider        string
	Region          string
	Config          string
	ServerIP        string
	SessionStart    string // RFC3339 string
	PricePerHour    float64
	DurationMinutes int // 0 = unlimited
	AllConfigs      []DeviceConfig
}

// ... lines 135-227 omitted ...

type HistoryEntry struct {
	ID           string  `json:"id"`
	Provider     string  `json:"provider"`
	Region       string  `json:"region"`
	InstanceType string  `json:"instance_type"`
	PublicIP     string  `json:"public_ip"` // ADDED
	StartTime    string  `json:"start_time"`
	EndTime      string  `json:"end_time"`
	Duration     string  `json:"duration"`
	Cost         float64 `json:"cost"`
	Status       string  `json:"status"`
}

// ... GetConfigPath unchanged ...

// OverriddenConfigPath allows tests to use a different file.
var OverriddenConfigPath string

// GetConfigPath returns the path for application state.
func GetConfigPath() (string, error) {
	if OverriddenConfigPath != "" {
		return OverriddenConfigPath, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".klosedloop", "config.ini"), nil
}

// SaveSession persists the active session state.
func SaveSession(s Session) error {
	path, err := GetConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	cfg, err := ini.Load(path)
	if err != nil {
		cfg = ini.Empty()
	}

	sec := cfg.Section("session")
	sec.Key("id").SetValue(s.InstanceID)
	sec.Key("provider").SetValue(s.Provider) // ADDED
	sec.Key("region").SetValue(s.Region)
	// Base64 encode config to avoid multiline issues in INI
	sec.Key("config").SetValue(base64.StdEncoding.EncodeToString([]byte(s.Config)))
	sec.Key("server_ip").SetValue(s.ServerIP)
	sec.Key("start_time").SetValue(s.SessionStart)
	sec.Key("price").SetValue(fmt.Sprintf("%f", s.PricePerHour))
	sec.Key("duration").SetValue(fmt.Sprintf("%d", s.DurationMinutes))

	if len(s.AllConfigs) > 0 {
		data, err := json.Marshal(s.AllConfigs)
		if err == nil {
			sec.Key("all_configs").SetValue(base64.StdEncoding.EncodeToString(data))
		}
	}

	return cfg.SaveTo(path)
}

// LoadSession retrieves the active session state.
func LoadSession() (Session, error) {
	path, err := GetConfigPath()
	if err != nil {
		return Session{}, err
	}

	cfg, err := ini.Load(path)
	if err != nil {
		return Session{}, err
	}

	sec := cfg.Section("session")
	instanceID := sec.Key("id").String()
	if instanceID == "" {
		// Fallback to old key if migrating?
		instanceID = sec.Key("instance_id").String()
	}
	if instanceID == "" {
		return Session{}, nil // No active session
	}

	provider := sec.Key("provider").String() // ADDED
	region := sec.Key("region").String()
	configStr := ""
	if encoded := sec.Key("config").String(); encoded != "" {
		decoded, _ := base64.StdEncoding.DecodeString(encoded) // Assuming sticking to base64 for multiline safety
		configStr = string(decoded)
	}

	startTime := sec.Key("start_time").String()
	price, _ := sec.Key("price").Float64()
	duration, _ := sec.Key("duration").Int()
	serverIP := sec.Key("server_ip").String()

	var allConfigs []DeviceConfig
	if encoded := sec.Key("all_configs").String(); encoded != "" {
		if decoded, err := base64.StdEncoding.DecodeString(encoded); err == nil {
			_ = json.Unmarshal(decoded, &allConfigs)
		}
	}

	return Session{
		InstanceID:      instanceID,
		Provider:        provider,
		Region:          region,
		Config:          configStr,
		ServerIP:        serverIP,
		SessionStart:    startTime,
		PricePerHour:    price,
		DurationMinutes: duration,
		AllConfigs:      allConfigs,
	}, nil
}

// ClearSession removes session data.
func ClearSession() error {
	path, err := GetConfigPath()
	if err != nil {
		return err
	}
	cfg, err := ini.Load(path)
	if err != nil {
		return nil
	}
	cfg.DeleteSection("session")
	return cfg.SaveTo(path)
}

// --- HISTORY ---

// storeMu protects concurrent access to the config file
var storeMu sync.RWMutex

// LoadHistory returns the list of past sessions (safe for concurrent reads)
func LoadHistory() ([]HistoryEntry, error) {
	storeMu.RLock()
	defer storeMu.RUnlock()
	return loadHistory()
}

// loadHistory reads history without acquiring any lock (caller must hold at least RLock)
func loadHistory() ([]HistoryEntry, error) {
	path, err := GetConfigPath()
	if err != nil {
		return nil, err
	}
	cfg, err := ini.Load(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []HistoryEntry{}, nil
		}
		return nil, err
	}

	var history []HistoryEntry
	sec := cfg.Section("history")
	data := sec.Key("data").String()
	if data != "" {
		if err := json.Unmarshal([]byte(data), &history); err != nil {
			return nil, err
		}
	}
	return history, nil
}

// AddHistoryEntry adds a record to the history list
func AddHistoryEntry(entry HistoryEntry) error {
	storeMu.Lock()
	defer storeMu.Unlock()

	history, err := loadHistory()
	if err != nil {
		history = []HistoryEntry{}
	}

	history = append([]HistoryEntry{entry}, history...)

	if len(history) > 50 {
		history = history[:50]
	}

	return saveHistoryList(history)
}

// DeleteHistoryEntry removes a record by ID
func DeleteHistoryEntry(id string) error {
	storeMu.Lock()
	defer storeMu.Unlock()

	history, err := loadHistory()
	if err != nil {
		return err
	}

	var newHistory []HistoryEntry
	for _, h := range history {
		if h.ID != id {
			newHistory = append(newHistory, h)
		}
	}

	return saveHistoryList(newHistory)
}

func saveHistoryList(list []HistoryEntry) error {
	path, err := GetConfigPath()
	if err != nil {
		return err
	}
	cfg, err := ini.Load(path)
	if err != nil {
		cfg = ini.Empty()
	}

	data, err := json.Marshal(list)
	if err != nil {
		return err
	}

	cfg.Section("history").Key("data").SetValue(string(data))
	return cfg.SaveTo(path)
}

// Preferences holds user defaults.
type Preferences struct {
	DefaultRegion   string   `json:"default_region"`
	DefaultDuration int      `json:"default_duration"`
	Devices         []string `json:"devices"`
	ActiveProfile   string   `json:"active_profile"`
}

// SavePreferences persists user preferences.
func SavePreferences(p Preferences) error {
	path, err := GetConfigPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	cfg, err := ini.Load(path)
	if err != nil {
		cfg = ini.Empty()
	}

	sec := cfg.Section("preferences")
	sec.Key("default_region").SetValue(p.DefaultRegion)
	sec.Key("default_duration").SetValue(fmt.Sprintf("%d", p.DefaultDuration))
	sec.Key("active_profile").SetValue(p.ActiveProfile)

	// Serialize devices to JSON string
	if len(p.Devices) == 0 {
		p.Devices = []string{"Device 1", "Device 2", "Device 3", "Device 4", "Device 5"} // Default
	}
	devJSON, _ := json.Marshal(p.Devices)
	sec.Key("devices").SetValue(string(devJSON))

	return cfg.SaveTo(path)
}

// LoadPreferences retrieves user preferences.
func LoadPreferences() (Preferences, error) {
	path, err := GetConfigPath()
	if err != nil {
		return Preferences{}, err
	}

	cfg, err := ini.Load(path)
	if err != nil {
		if os.IsNotExist(err) {
			// Return default immediately if no file
			return Preferences{
				Devices:       []string{"Device 1", "Device 2", "Device 3", "Device 4", "Device 5"},
				ActiveProfile: "default",
			}, nil
		}
		return Preferences{}, err
	}

	sec := cfg.Section("preferences")
	duration, _ := sec.Key("default_duration").Int()
	activeProfile := sec.Key("active_profile").String()
	if activeProfile == "" {
		activeProfile = "default"
	}

	// Parse Devices
	var devices []string
	devStr := sec.Key("devices").String()
	if devStr != "" {
		json.Unmarshal([]byte(devStr), &devices)
	}
	if len(devices) == 0 {
		devices = []string{"Device 1", "Device 2", "Device 3", "Device 4", "Device 5"}
	}

	return Preferences{
		DefaultRegion:   sec.Key("default_region").String(),
		DefaultDuration: duration,
		Devices:         devices,
		ActiveProfile:   activeProfile,
	}, nil
}
