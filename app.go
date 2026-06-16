package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"klosedloop/internal/aws"
	"klosedloop/internal/cloud"
	"klosedloop/internal/config"
	"klosedloop/internal/gcp"
	"klosedloop/internal/logger"
	"klosedloop/internal/vpn"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx              context.Context
	providers        map[string]cloud.Provider
	activeProvider   cloud.Provider
	activeCloud      string
	currentRegion    string
	connecting       bool
	forceQuit        bool
	autoDestroyTimer *time.Timer
	cancelMonitor    context.CancelFunc
	mu               sync.Mutex
}

// NewApp creates a new App application struct
func NewApp() *App {
	// Initialize providers
	awsProvider := aws.NewProvider()
	gcpProvider := gcp.NewProvider()

	return &App{
		providers: map[string]cloud.Provider{
			awsProvider.Name(): awsProvider,
			gcpProvider.Name(): gcpProvider,
		},
		activeProvider: awsProvider, // Default
		activeCloud:    "AWS",
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Check for active session and restore Provider
	sess, err := config.LoadSession()
	if err == nil && sess.InstanceID != "" && sess.Provider != "" {
		logger.Write(fmt.Sprintf("Restoring active session for provider: %s", sess.Provider))
		a.activeCloud = sess.Provider
		if p, ok := a.providers[sess.Provider]; ok {
			a.activeProvider = p
		}
		// TODO: Validate if instance is actually running?
		// For now, restoring the provider allows the UI (and Disconnect) to function correctly.
	}

	// Restore active profile env var (Legacy / Default behavior)
	if a.activeCloud == "AWS" {
		prefs, err := config.LoadPreferences()
		if err == nil && prefs.ActiveProfile != "" {
			os.Setenv("AWS_PROFILE", prefs.ActiveProfile)
		}
	}

	// Checking for Orphans in background
	go func() {
		// Wait a moment for UI to load
		time.Sleep(2 * time.Second)
		orphans := a.CheckForOrphans()
		if len(orphans) > 0 {
			runtime.EventsEmit(ctx, "orphans-detected", orphans)
		}
	}()
}

// CheckForOrphans scans all providers for untracked running instances
func (a *App) CheckForOrphans() []cloud.InstanceDetails {
	var orphans []cloud.InstanceDetails

	// Check if we have an active session to exclude
	sess, _ := config.LoadSession()

	// Scan all providers
	for name, p := range a.providers {
		// Verify Auth first to avoid errors
		if valid, _ := p.VerifyAuth(a.ctx); !valid {
			continue
		}

		list, err := p.ListActiveInstances(a.ctx)
		if err == nil {
			for i := range list {
				inst := list[i]
				// If this instance is the current active session, skip it
				// For AWS, ID matches. For GCP, ID is just name usually or name/zone.
				// We should match robustly.
				if sess.InstanceID != "" && (inst.InstanceID == sess.InstanceID || strings.HasSuffix(sess.InstanceID, inst.InstanceID)) {
					continue
				}
				inst.Provider = name
				orphans = append(orphans, inst)
			}
		}
	}
	return orphans
}

// TerminateInstance stops a specific instance
func (a *App) TerminateInstance(provider, region, instanceID string) error {
	if p, ok := a.providers[provider]; ok {
		return p.Terminate(a.ctx, region, instanceID)
	}
	return fmt.Errorf("provider not found")
}

// PingInstance checks latency to a specific IP (or 8.8.8.8)
// Returns latency in milliseconds, or -1 if unreachable
func (a *App) PingInstance(ip string) int {
	if ip == "" {
		return -1
	}

	// Simple shell ping (Mac/Linux specific flags)
	// -c 1: count 1
	// -W 2: wait max 2 seconds
	out, err := exec.Command("ping", "-c", "1", "-W", "2", ip).Output()
	if err != nil {
		return -1
	}

	// Parse "time=32.1 ms" from output
	// macOS output: "64 bytes from ... : icmp_seq=0 ttl=57 time=32.123 ms"
	output := string(out)
	if strings.Contains(output, "time=") {
		parts := strings.Split(output, "time=")
		if len(parts) > 1 {
			valStr := strings.Split(parts[1], " ")[0] // "32.123"
			val, err := strconv.ParseFloat(valStr, 64)
			if err == nil {
				return int(val)
			}
		}
	}
	// Fallback if parsing fails but command succeeded (less likely)
	return 0
}

// SetProvider switches the active cloud provider
func (a *App) SetProvider(name string) string {
	a.mu.Lock()
	defer a.mu.Unlock()
	if p, ok := a.providers[name]; ok {
		a.activeProvider = p
		a.activeCloud = name
		return "OK"
	}
	return "Provider not found"
}

// GetProviders returns list of available providers
func (a *App) GetProviders() []string {
	keys := make([]string, 0, len(a.providers))
	for k := range a.providers {
		keys = append(keys, k)
	}
	return keys
}

// GetPrice fetches spot price for a region using active provider
func (a *App) GetPrice(region string) string {
	price, err := a.activeProvider.GetSpotPrice(a.ctx, region)
	if err != nil {
		return "N/A"
	}
	return price
}

// GetRegions returns list of enabled regions for active provider
func (a *App) GetRegions() ([]string, error) {
	return a.activeProvider.GetRegions(a.ctx)
}

// PeerConfig holds configuration for a single device
type PeerConfig struct {
	Name   string `json:"name"`
	Config string `json:"config"`
	QRCode string `json:"qr_code"`
}

// ConnectionResult holds data for the frontend
type ConnectionResult struct {
	Configs []PeerConfig `json:"configs"`
}

// Connect launches the instance
func (a *App) Connect(region string, durationMinutes int) (*ConnectionResult, error) {
	// Guard: prevent concurrent Connect calls
	a.mu.Lock()
	if a.connecting {
		a.mu.Unlock()
		return nil, fmt.Errorf("a connection is already in progress")
	}
	a.connecting = true
	a.currentRegion = region
	a.mu.Unlock()

	// All I/O runs without the mutex so Disconnect can proceed concurrently.
	if err := logger.StartSession(); err != nil {
		fmt.Printf("Failed to start logger: %v\n", err)
	}
	logger.Write(fmt.Sprintf("Starting session in region: %s (%s). Duration: %d mins", region, a.activeCloud, durationMinutes))

	// 1. Keys for Devices
	runtime.EventsEmit(a.ctx, "connect-status", "Generating Keys for Devices...")
	sPriv, sPub, err := vpn.GenerateKeys()
	if err != nil {
		a.mu.Lock()
		a.connecting = false
		a.mu.Unlock()
		return nil, err
	}

	prefs, err := config.LoadPreferences()
	devices := prefs.Devices
	if err != nil || len(devices) == 0 {
		devices = []string{"Primary Device"}
	}

	var clientPubKeys []string

	type deviceKeys struct {
		Name string
		Priv string
		Pub  string
	}
	var dKeys []deviceKeys

	for _, name := range devices {
		priv, pub, err := vpn.GenerateKeys()
		if err != nil {
			a.mu.Lock()
			a.connecting = false
			a.mu.Unlock()
			return nil, err
		}
		dKeys = append(dKeys, deviceKeys{Name: name, Priv: priv, Pub: pub})
		clientPubKeys = append(clientPubKeys, pub)
	}

	// 2. Launch (up to 120 s) — mutex not held so Disconnect can run
	progressCallback := func(msg string) {
		runtime.EventsEmit(a.ctx, "connect-status", msg)
		logger.Write(msg)
	}

	id, serverIP, err := a.activeProvider.Launch(a.ctx, region, clientPubKeys, sPriv, durationMinutes, progressCallback)

	// Fetch spot price while still outside lock (network call)
	priceStr, _ := a.activeProvider.GetSpotPrice(a.ctx, region)

	// Fetch instance type dynamically using GetInstanceDetails
	instanceType := "t3.micro" // Default fallback
	if err == nil {
		details, detErr := a.activeProvider.GetInstanceDetails(a.ctx, region, id)
		if detErr == nil && details != nil && details.InstanceType != "" {
			instanceType = details.InstanceType
		}
	}

	// Re-acquire mutex for all state mutations from here on
	a.mu.Lock()
	defer a.mu.Unlock()
	a.connecting = false

	if err != nil {
		logger.Write(fmt.Sprintf("Launch Error: %v", err))
		return nil, err
	}

	// 3. Generate Configs for each device
	runtime.EventsEmit(a.ctx, "connect-status", "Generating Device Profiles...")

	var finalConfigs []PeerConfig
	for i, dk := range dKeys {
		clientIP := fmt.Sprintf("10.100.0.%d/32", i+2)
		conf := vpn.GenerateClientConfig(dk.Priv, sPub, serverIP, clientIP)

		qrBytes, qrErr := vpn.GenerateQR(conf, 512)
		qrBase64 := ""
		if qrErr == nil {
			qrBase64 = base64.StdEncoding.EncodeToString(qrBytes)
		}

		finalConfigs = append(finalConfigs, PeerConfig{
			Name:   dk.Name,
			Config: conf,
			QRCode: qrBase64,
		})
	}

	// 4. Save State
	priceVal := 0.0
	if len(priceStr) > 1 && strings.HasPrefix(priceStr, "$") {
		fmt.Sscanf(priceStr, "$%f", &priceVal)
	}

	var allDeviceConfigs []config.DeviceConfig
	for _, pc := range finalConfigs {
		allDeviceConfigs = append(allDeviceConfigs, config.DeviceConfig{
			Name: pc.Name, Config: pc.Config, QRCode: pc.QRCode,
		})
	}

	session := config.Session{
		InstanceID:      id,
		InstanceType:    instanceType,
		Provider:        a.activeCloud,
		Region:          region,
		Config:          finalConfigs[0].Config,
		ServerIP:        serverIP,
		SessionStart:    time.Now().Format(time.RFC3339),
		PricePerHour:    priceVal,
		DurationMinutes: durationMinutes,
		AllConfigs:      allDeviceConfigs,
	}
	if err := config.SaveSession(session); err != nil {
		logger.Write(fmt.Sprintf("Warning: Failed to save session: %v", err))
	}

	// 5. Start Auto-Destroy Timer
	if durationMinutes > 0 {
		logger.Write(fmt.Sprintf("Auto-destroy timer set for %d minutes.", durationMinutes))
		a.autoDestroyTimer = time.AfterFunc(time.Duration(durationMinutes)*time.Minute, func() {
			logger.Write("Auto-destroy timer triggered. Terminating instance...")
			runtime.EventsEmit(a.ctx, "connect-status", "Time limit reached. Auto-terminating...")
			summary, err := a.Disconnect()
			if err != nil {
				logger.Write(fmt.Sprintf("Auto-destroy failed: %v", err))
				runtime.EventsEmit(a.ctx, "connect-status", fmt.Sprintf("Auto-destroy failed: %v", err))
			} else {
				runtime.EventsEmit(a.ctx, "session-ended", summary)
			}
		})
	}

	// 6. Start spot interruption monitor
	if a.cancelMonitor != nil {
		a.cancelMonitor()
	}
	monCtx, cancelFn := context.WithCancel(a.ctx)
	a.cancelMonitor = cancelFn
	capturedProvider := a.activeProvider
	go a.monitorInstance(monCtx, region, id, capturedProvider)

	return &ConnectionResult{Configs: finalConfigs}, nil
}

// SavePreferences saves user defaults
func (a *App) SavePreferences(region string, duration int, devices []string) error {
	prefs, err := config.LoadPreferences()
	if err != nil {
		prefs = config.Preferences{}
	}
	prefs.DefaultRegion = region
	prefs.DefaultDuration = duration
	prefs.Devices = devices
	return config.SavePreferences(prefs)
}

// GetPreferences loads user defaults
func (a *App) GetPreferences() config.Preferences {
	prefs, err := config.LoadPreferences()
	if err != nil {
		return config.Preferences{}
	}
	return prefs
}

// Disconnect terminates the instance
func (a *App) Disconnect() (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Cancel spot interruption monitor before terminating to avoid false-positive events
	if a.cancelMonitor != nil {
		a.cancelMonitor()
		a.cancelMonitor = nil
	}

	// Stop timer if active (manual disconnect)
	if a.autoDestroyTimer != nil {
		a.autoDestroyTimer.Stop()
		a.autoDestroyTimer = nil
	}

	// Load session to get ID if memory is lost
	sess, err := config.LoadSession()
	if err != nil || sess.InstanceID == "" {
		return "", fmt.Errorf("no active session found")
	}

	// Terminate using active provider
	// TODO: Store provider in generic way. Assuming active provider is correct for now.
	err = a.activeProvider.Terminate(a.ctx, sess.Region, sess.InstanceID)
	if err != nil {
		logger.Write(fmt.Sprintf("Termination Error: %v", err))
		return "", err
	}

	// RECORD HISTORY
	endTime := time.Now()
	startTime, _ := time.Parse(time.RFC3339, sess.SessionStart)
	dur := endTime.Sub(startTime).Round(time.Second)

	// Estimate Cost
	hours := dur.Hours()
	if hours < (1.0 / 60.0) {
		hours = 1.0 / 60.0
	} // Minimum 1 min charge effectively
	cost := sess.PricePerHour * hours

	instType := sess.InstanceType
	if instType == "" {
		instType = "t3.micro"
	}

	hist := config.HistoryEntry{
		ID:           sess.InstanceID,
		Provider:     a.activeCloud,
		Region:       sess.Region,
		InstanceType: instType,
		PublicIP:     sess.ServerIP,
		StartTime:    startTime.Format("2006-01-02 15:04:05"),
		EndTime:      endTime.Format("15:04:05"),
		Duration:     dur.String(),
		Cost:         cost,
		Status:       "Terminated",
	}
	_ = config.AddHistoryEntry(hist)

	// Clear session
	config.ClearSession()
	logger.Write("Session Disconnected and Cleared.")
	logger.Close()

	return fmt.Sprintf("Session Duration: %s", dur), nil
}

// GetSession returns current active session if any
func (a *App) GetSession() *config.Session {
	s, err := config.LoadSession()
	if err != nil || s.InstanceID == "" {
		return nil
	}
	return &s
}

// CheckAuth verifies if credentials are valid for the active provider
func (a *App) CheckAuth() (bool, error) {
	return a.activeProvider.VerifyAuth(a.ctx)
}

// AuthStatus holds detailed authentication result
type AuthStatus struct {
	Valid              bool     `json:"valid"`
	Error              string   `json:"error,omitempty"`
	Identity           string   `json:"identity,omitempty"`
	MissingPermissions []string `json:"missing_permissions,omitempty"`
}

// userFriendlyErr returns a provider-appropriate user-facing error message.
func (a *App) userFriendlyErr(err error) error {
	if a.activeCloud == "AWS" {
		return aws.ToUserFriendlyError(err)
	}
	return err
}

// GetCredentialStatus checks auth and permissions for the active provider
func (a *App) GetCredentialStatus(region string) AuthStatus {
	// 1. Basic Auth Check
	valid, err := a.activeProvider.VerifyAuth(a.ctx)
	if !valid || err != nil {
		errMsg := ""
		if err != nil {
			errMsg = a.userFriendlyErr(err).Error()
		}
		return AuthStatus{Valid: false, Error: errMsg}
	}

	// 2. Permission Check
	missing, identity, err := a.activeProvider.VerifyPermissions(a.ctx, region)
	if err != nil {
		return AuthStatus{Valid: false, Error: a.userFriendlyErr(err).Error()}
	}

	return AuthStatus{
		Valid:              true,
		Identity:           identity,
		MissingPermissions: missing,
	}
}

// SaveAuth writes new credentials and re-verifies them.
// Deprecated: Use SaveProfile instead.
func (a *App) SaveAuth(accessKey, secretKey string) error {
	return a.SaveProfile("default", accessKey, secretKey, "")
}

// SaveProfile saves credentials to a specific profile and verifies them.
func (a *App) SaveProfile(profileName, accessKey, secretKey, sessionToken string) error {
	if profileName == "" {
		profileName = "default"
	}
	if accessKey == "" || secretKey == "" {
		return fmt.Errorf("keys cannot be empty")
	}

	if a.activeCloud == "AWS" {
		if err := config.SaveProfile(profileName, accessKey, secretKey, sessionToken); err != nil {
			return err
		}
		// Verify using the new helper
		valid, err := aws.VerifyProfile(a.ctx, profileName)
		if err != nil {
			return aws.ToUserFriendlyError(err)
		}
		if !valid {
			return fmt.Errorf("credentials saved but verification failed")
		}
		return nil
	}
	// TODO: GCP Profile Support
	return fmt.Errorf("SaveProfile not implemented for %s", a.activeCloud)
}

// ListProfiles returns available AWS profiles
func (a *App) ListProfiles() ([]string, error) {
	if a.activeCloud == "AWS" {
		return config.ListProfiles()
	}
	return []string{}, nil
}

// SetActiveProfile sets the active IAM profile for the app
func (a *App) SetActiveProfile(profileName string) error {
	prefs, err := config.LoadPreferences()
	if err != nil {
		prefs = config.Preferences{}
	}
	prefs.ActiveProfile = profileName

	a.mu.Lock()
	isAWS := a.activeCloud == "AWS"
	provider := a.activeProvider
	a.mu.Unlock()

	if isAWS {
		os.Setenv("AWS_PROFILE", profileName)
	}

	if err := config.SavePreferences(prefs); err != nil {
		return err
	}

	if provider != nil {
		_ = provider.Reload(a.ctx)
	}
	return nil
}

// DeleteProfile removes a profile
func (a *App) DeleteProfile(profileName string) error {
	if a.activeCloud == "AWS" {
		return config.DeleteProfile(profileName)
	}
	return nil
}

// GetActiveProfile returns the currently active profile
func (a *App) GetActiveProfile() string {
	prefs, err := config.LoadPreferences()
	if err != nil {
		return "default"
	}
	return prefs.ActiveProfile
}

// SaveAuthGCP saves the JSON key for Google Cloud
func (a *App) SaveAuthGCP(jsonContent string) error {
	if err := gcp.SaveCredentials(jsonContent); err != nil {
		return err
	}
	// Verify
	valid, err := gcp.VerifyAuth(a.ctx)
	if err != nil {
		return err
	}
	if !valid {
		return fmt.Errorf("credentials saved but verification failed (check project permissions)")
	}
	return nil
}

// SaveTemplate prompts user to save the CloudFormation YAML
func (a *App) SaveTemplate(content string) (string, error) {
	file, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		DefaultFilename: "klosedloop-setup.yaml",
		Title:           "Save CloudFormation Template",
		Filters: []runtime.FileFilter{
			{DisplayName: "YAML Files", Pattern: "*.yaml"},
		},
	})
	if err != nil {
		return "", err
	}
	if file == "" {
		return "Cancelled", nil
	}

	if err := os.WriteFile(file, []byte(content), 0644); err != nil {
		return "", err
	}
	return "Saved to " + file, nil
}

// GetInstanceDetails returns operational data for the active instance
func (a *App) GetInstanceDetails() (*cloud.InstanceDetails, error) {
	sess, err := config.LoadSession()
	if err != nil || sess.InstanceID == "" {
		return nil, fmt.Errorf("no active session")
	}

	return a.activeProvider.GetInstanceDetails(a.ctx, sess.Region, sess.InstanceID)
}

// GetLatestMetrics fetches telemetry for the active instance
func (a *App) GetLatestMetrics(region, instanceID string) (*cloud.InstanceMetrics, error) {
	return a.activeProvider.GetLatestMetrics(a.ctx, region, instanceID)
}

// monitorInstance polls the cloud provider every 30s and emits "spot-interrupted"
// if the instance is terminated externally (i.e., not by Disconnect()).
func (a *App) monitorInstance(ctx context.Context, region, instanceID string, provider cloud.Provider) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if ctx.Err() != nil {
				return
			}
			details, err := provider.GetInstanceDetails(ctx, region, instanceID)
			if err != nil {
				continue // transient — don't alarm user
			}
			if details.State == "terminated" || details.State == "shutting-down" {
				runtime.EventsEmit(a.ctx, "spot-interrupted",
					fmt.Sprintf("Instance %s entered state: %s", instanceID, details.State))
				return
			}
		}
	}
}

// GetRegionLatencies pings each region's EC2 endpoint in parallel and returns latency in ms.
// Returns -1 for unreachable regions.
func (a *App) GetRegionLatencies(regions []string) map[string]int {
	result := make(map[string]int, len(regions))
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, region := range regions {
		wg.Add(1)
		go func(r string) {
			defer wg.Done()
			host := fmt.Sprintf("ec2.%s.amazonaws.com", r)
			ms := a.PingInstance(host)
			mu.Lock()
			result[r] = ms
			mu.Unlock()
		}(region)
	}
	wg.Wait()
	return result
}

// beforeClose is called when the application is about to close
func (a *App) beforeClose(ctx context.Context) bool {
	if a.forceQuit {
		return false // Allow close
	}

	// Check for active session
	sess, err := config.LoadSession()
	if err == nil && sess.InstanceID != "" {
		// Active Session Detected!
		// Attempt Auto-Disconnect
		logger.Write("App closing with active session. Initiating auto-disconnect...")

		// We can try to disconnect synchronously.
		// Note: activeProvider should be correct thanks to startup() logic.
		_, err := a.Disconnect()
		if err != nil {
			logger.Write("Auto-disconnect error: " + err.Error())
		} else {
			logger.Write("Auto-disconnect successful.")
		}

		return false // Allow close now
	}

	return false // Allow close
}

// TerminateAndQuit is called from frontend when user confirms exit
func (a *App) TerminateAndQuit() {
	a.forceQuit = true

	// Attempt Disconnect (ignore error, we are quitting)
	_, _ = a.Disconnect()

	runtime.Quit(a.ctx)
}

// GetHistory returns list of past sessions
func (a *App) GetHistory() []config.HistoryEntry {
	list, err := config.LoadHistory()
	if err != nil {
		return []config.HistoryEntry{}
	}
	return list
}

// RemoveHistoryItem deletes a specific history record
func (a *App) RemoveHistoryItem(id string) error {
	return config.DeleteHistoryEntry(id)
}
