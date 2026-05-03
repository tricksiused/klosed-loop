package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	currentLogFile *os.File
	logMu          sync.Mutex
)

// StartSession creates a new log file for the session
func StartSession() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	logDir := filepath.Join(home, ".klosedloop", "logs")
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return err
	}

	filename := fmt.Sprintf("session_%s.log", time.Now().Format("2006-01-02_15-04-05"))
	path := filepath.Join(logDir, filename)

	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return err
	}

	logMu.Lock()
	defer logMu.Unlock()
	if currentLogFile != nil {
		currentLogFile.Close()
	}
	currentLogFile = f
	writeUnlocked("Session Log Started.")

	go cleanupOldLogs(logDir)

	return nil
}

// Write appends a message to the current log file
func Write(msg string) {
	logMu.Lock()
	defer logMu.Unlock()
	writeUnlocked(msg)
}

// Close closes the current log file
func Close() {
	logMu.Lock()
	defer logMu.Unlock()
	if currentLogFile != nil {
		writeUnlocked("Session End.")
		currentLogFile.Close()
		currentLogFile = nil
	}
}

func writeUnlocked(msg string) {
	if currentLogFile == nil {
		return
	}
	timestamp := time.Now().Format("15:04:05")
	entry := fmt.Sprintf("[%s] %s\n", timestamp, msg)
	currentLogFile.WriteString(entry)
}

// cleanupOldLogs keeps only the last 5 log files
func cleanupOldLogs(logDir string) {
	entries, err := os.ReadDir(logDir)
	if err != nil {
		return
	}

	var logFiles []os.DirEntry
	for _, e := range entries {
		if !e.IsDir() && strings.HasPrefix(e.Name(), "session_") && strings.HasSuffix(e.Name(), ".log") {
			logFiles = append(logFiles, e)
		}
	}

	sort.Slice(logFiles, func(i, j int) bool {
		return logFiles[i].Name() > logFiles[j].Name()
	})

	if len(logFiles) > 5 {
		for _, f := range logFiles[5:] {
			os.Remove(filepath.Join(logDir, f.Name()))
		}
	}
}
