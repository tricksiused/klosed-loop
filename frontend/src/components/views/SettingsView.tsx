import React, { useState, useEffect } from 'react';
import { GetPreferences, SavePreferences, GetRegions } from '../../../wailsjs/go/main/App';

interface SettingsViewProps {
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ addToast }) => {
    const [regions, setRegions] = useState<string[]>([]);
    const [defaultRegion, setDefaultRegion] = useState("");
    const [defaultDuration, setDefaultDuration] = useState(0);
    const [devices, setDevices] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                // Load available regions
                const r = await GetRegions();
                setRegions(r || []);

                // Load saved prefs
                const prefs = await GetPreferences();
                if (prefs) {
                    setDefaultRegion(prefs.default_region);
                    setDefaultDuration(prefs.default_duration);
                    setDevices(prefs.devices || ["Primary Device"]);
                }
            } catch (e) {
                console.error("Failed to load settings", e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async () => {
        try {
            await SavePreferences(defaultRegion, parseInt(defaultDuration.toString()), devices);
            addToast("Preferences saved successfully", "success");
        } catch (e: any) {
            addToast("Failed to save: " + e, "error");
        }
    };

    if (isLoading) return <div className="text-muted" style={{ padding: '2rem' }}>Loading settings...</div>;

    return (
        <div style={{ maxWidth: '700px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Defaults Section */}
            <div className="modern-card">
                <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                    <h2 style={{ marginBottom: '0.25rem', fontSize: '1.2rem' }}>Launch Defaults</h2>
                    <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                        Configure your preferred startup parameters.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>
                            Default Region
                        </label>
                        <div style={{ position: 'relative' }}>
                            <select
                                value={defaultRegion}
                                onChange={e => setDefaultRegion(e.target.value)}
                                style={{
                                    width: '100%', padding: '0.75rem', borderRadius: '8px',
                                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff'
                                }}
                            >
                                <option value="">Select a region...</option>
                                {regions.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>
                            Default Duration
                        </label>
                        <select
                            value={defaultDuration}
                            onChange={e => setDefaultDuration(parseInt(e.target.value))}
                            style={{
                                width: '100%', padding: '0.75rem', borderRadius: '8px',
                                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff'
                            }}
                        >
                            <option value="0">Manual Stop Only (Unlimited)</option>
                            <option value="60">1 Hour</option>
                            <option value="240">4 Hours</option>
                            <option value="480">8 Hours</option>
                            <option value="720">12 Hours</option>
                        </select>
                    </div>
                </div>

                <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                    * These settings will be auto-selected when you open the Mission Control.
                </div>

                <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn-launch"
                        style={{ width: 'auto', padding: '0.75rem 2rem', fontSize: '0.9rem' }}
                        onClick={handleSave}
                    >
                        Save Changes
                    </button>
                </div>
            </div>

            {/* Application Info */}
            <div className="modern-card" style={{ opacity: 0.8 }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: '#cbd5e1' }}>System Information</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                        <div className="text-muted text-xs" style={{ marginBottom: '4px' }}>VERSION</div>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>2.1.0</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                        <div className="text-muted text-xs" style={{ marginBottom: '4px' }}>BUILD</div>
                        <div style={{ fontWeight: 600 }}>Production</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                        <div className="text-muted text-xs" style={{ marginBottom: '4px' }}>Environment</div>
                        <div style={{ fontWeight: 600 }}>Multi-Cloud</div>
                    </div>
                </div>
            </div>

        </div>
    );
};
