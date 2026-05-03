package config

import (
	"fmt"
	"path/filepath"
	"sync"
	"testing"

	"gopkg.in/ini.v1"
)

func setupTest(t *testing.T) {
	tmpDir := t.TempDir()
	tmpFile := filepath.Join(tmpDir, "test_config.ini")
	OverriddenConfigPath = tmpFile

	// Ensure file exists
	cfg := ini.Empty()
	_ = cfg.SaveTo(tmpFile)
}

func TestHistoryLimit(t *testing.T) {
	setupTest(t)

	// Add 60 entries
	for i := 0; i < 60; i++ {
		err := AddHistoryEntry(HistoryEntry{
			ID:     fmt.Sprintf("id-%d", i),
			Status: "Terminated",
		})
		if err != nil {
			t.Fatalf("Failed to add entry %d: %v", i, err)
		}
	}

	hist, err := LoadHistory()
	if err != nil {
		t.Fatalf("Failed to load history: %v", err)
	}

	if len(hist) != 50 {
		t.Errorf("Expected 50 items, got %d", len(hist))
	}

	// Validate "Newest First" (id-59 should be at index 0)
	if hist[0].ID != "id-59" {
		t.Errorf("Expected newest item 'id-59', got '%s'", hist[0].ID)
	}
}

func TestConcurrentDelete(t *testing.T) {
	setupTest(t)

	// Add 10 items
	for i := 0; i < 10; i++ {
		_ = AddHistoryEntry(HistoryEntry{ID: fmt.Sprintf("id-%d", i)})
	}

	// Concurrently delete id-0 to id-4
	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			_ = DeleteHistoryEntry(id)
		}(fmt.Sprintf("id-%d", i))
	}
	wg.Wait()

	hist, _ := LoadHistory()

	if len(hist) != 5 {
		t.Errorf("Expected 5 items after 5 concurrent deletes, got %d", len(hist))
	}
}

func TestMalformedHistory(t *testing.T) {
	setupTest(t)

	path, _ := GetConfigPath()
	cfg := ini.Empty()
	sec := cfg.Section("history")
	// Broken JSON
	sec.Key("data").SetValue(`[{"id": "broken"`)
	_ = cfg.SaveTo(path)

	hist, err := LoadHistory()
	if err == nil {
		t.Error("Expected error for malformed JSON, got nil")
	}
	if len(hist) != 0 {
		t.Error("Expected empty history on error")
	}
}
