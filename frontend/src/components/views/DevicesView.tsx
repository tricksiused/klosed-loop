import React, { useState, useEffect } from 'react';
import { GetPreferences, SavePreferences } from '../../../wailsjs/go/main/App';

interface DevicesViewProps {
    status: string; // 'connected' | 'disconnected' | 'connecting'
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    configs?: { name: string, config: string, qr_code: string }[];
}

export const DevicesView: React.FC<DevicesViewProps> = ({ status, addToast, configs = [] }) => {
    const [devices, setDevices] = useState<string[]>([]);
    const [newDevice, setNewDevice] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [currentRegion, setCurrentRegion] = useState("");
    const [currentDuration, setCurrentDuration] = useState(0);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const prefs = await GetPreferences();
            if (prefs) {
                setDevices(prefs.devices || ["Primary Device"]);
                setCurrentRegion(prefs.default_region);
                setCurrentDuration(prefs.default_duration);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAdd = async () => {
        if (!newDevice.trim()) return;
        if (devices.includes(newDevice)) {
            addToast("Device name already exists", "error");
            return;
        }
        const updated = [...devices, newDevice.trim()];
        setDevices(updated);
        setNewDevice("");
        await save(updated);
    };

    const handleRemove = async (name: string) => {
        const updated = devices.filter(d => d !== name);
        if (updated.length === 0) {
            addToast("You must have at least one device", "error");
            return;
        }
        setDevices(updated);
        await save(updated);
    };

    const save = async (list: string[]) => {
        try {
            await SavePreferences(currentRegion, currentDuration, list);
            addToast("Device list updated", "success");
        } catch (e: any) {
            addToast("Failed to save: " + e, "error");
            loadSettings(); // Revert on error
        }
    };

    // --- Actions for Active Configs ---

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        addToast("Config copied to clipboard", "success");
    };

    const downloadConfig = (name: string, content: string) => {
        const element = document.createElement("a");
        const file = new Blob([content], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `${name.replace(/\s+/g, '_')}.conf`;
        document.body.appendChild(element);
        element.click();
        document.body.removeChild(element);
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h2>Manage Devices</h2>
                        <p className="text-muted">Configure VPN peers for your mesh network.</p>
                    </div>
                    {status !== 'disconnected' && (
                        <div className="status-badge" style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#eab308' }}>
                            <span className="text-xs">Read-only while connected</span>
                        </div>
                    )}
                </header>

                <div style={{ overflowY: 'auto', flex: 1, paddingRight: '5px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                        {devices.map((dev, i) => {
                            // Find active config for this device if connected
                            // Configs are generated in order, so index mapping is usually safe, 
                            // but checking name is consistently better if available.
                            // App.tsx generates configs with 'name' property matching device name.
                            const activeConfig = status === 'connected'
                                ? configs.find(c => c.name === dev) || configs[i]
                                : undefined;

                            return (
                                <div key={i} style={{
                                    padding: '1.25rem',
                                    background: activeConfig ? 'rgba(59, 130, 246, 0.05)' : 'rgba(255,255,255,0.03)',
                                    borderRadius: '12px',
                                    border: activeConfig ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid var(--glass-border)',
                                    display: 'flex', flexDirection: 'column', gap: '1rem',
                                    transition: 'all 0.2s ease'
                                }}>
                                    {/* Header */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <div style={{
                                                width: '2.5rem', height: '2.5rem', borderRadius: '10px',
                                                background: activeConfig ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.1)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: activeConfig ? '#60a5fa' : '#94a3b8'
                                            }}>
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{dev}</div>
                                                <div className="text-muted text-xs">
                                                    {activeConfig ? <span style={{ color: '#4ade80' }}>● Active Peer</span> : 'WireGuard Client'}
                                                </div>
                                            </div>
                                        </div>

                                        {status === 'disconnected' && (
                                            <button
                                                onClick={() => handleRemove(dev)}
                                                className="icon-btn-danger"
                                                title="Remove Device"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        )}
                                    </div>

                                    {/* Action Footer (Only when Connected) */}
                                    {activeConfig && (
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                            <button
                                                style={{
                                                    flex: 1, fontSize: '0.8rem', padding: '0.6rem',
                                                    background: 'rgba(255,255,255,0.08)',
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    color: '#fff',
                                                    borderRadius: '6px',
                                                    fontWeight: 500
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                onClick={() => copyToClipboard(activeConfig.config)}
                                            >
                                                <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                                                Copy
                                            </button>
                                            <button
                                                style={{
                                                    flex: 1, fontSize: '0.8rem', padding: '0.6rem',
                                                    background: 'rgba(16, 185, 129, 0.1)', // Green tint
                                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                                    color: '#4ade80',
                                                    borderRadius: '6px',
                                                    fontWeight: 500
                                                }}
                                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)'}
                                                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                                                onClick={() => downloadConfig(dev, activeConfig.config)}
                                            >
                                                <svg className="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                                Save
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {status === 'disconnected' && (
                    <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input
                                type="text"
                                placeholder="Device Name (e.g. iPad)"
                                value={newDevice}
                                onChange={e => setNewDevice(e.target.value)}
                                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--glass-border)', color: '#fff' }}
                                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                            />
                            <button className="btn-launch" style={{ width: 'auto' }} onClick={handleAdd}>Add</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
