import React from 'react';

const Icons = {
    Power: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    Zap: ({ size = 20, color = "currentColor" }: { size?: number, color?: string }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
        </svg>
    ),
};

import { getRegionLabel } from '../../utils/regions';

interface LaunchConfigProps {
    activeCloud: string;
    status: string;
    isAuthVerified: boolean;
    region: string;
    regions: string[];
    price: string;
    duration: string;
    regionLatencies?: Record<string, number>;
    onSetProvider: (provider: string) => void;
    onRegionChange: (region: string) => void;
    onDurationChange: (duration: string) => void;
    onConnect: () => void;
    onDisconnect: () => void;
}

export const LaunchConfig: React.FC<LaunchConfigProps> = ({
    activeCloud,
    status,
    isAuthVerified,
    region,
    regions,
    price,
    duration,
    regionLatencies,
    onSetProvider,
    onRegionChange,
    onDurationChange,
    onConnect,
    onDisconnect
}) => {
    const [showAdvanced, setShowAdvanced] = React.useState(false);
    const [instanceSize, setInstanceSize] = React.useState("micro"); // micro, small, medium

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.1rem', margin: 0 }}>
                    <Icons.Zap size={18} color="#d946ef" /> Launch Configuration
                </h2>
                <span className="status-badge" style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>Step 1</span>
            </div>

            {/* Cloud Provider */}
            <div style={{ marginBottom: '1rem' }}>
                <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '0.4rem' }}>CLOUD PROVIDER</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`nav-btn ${activeCloud === 'AWS' ? 'active' : ''}`}
                        onClick={() => onSetProvider('AWS')}
                        style={{ flex: 1, justifyContent: 'center' }}
                    >AWS <span className="text-xs opacity-50 ml-1">(Powered by SWS)</span></button>
                    <button
                        className={`nav-btn ${activeCloud === 'GCP' ? 'active' : ''}`}
                        onClick={() => onSetProvider('GCP')}
                        disabled={true}
                        title="Coming Soon"
                        style={{ flex: 1, justifyContent: 'center', opacity: 0.5, cursor: 'not-allowed' }}
                    >GCP <span className="text-xs opacity-50 ml-1">(Coming Soon)</span></button>
                </div>
            </div>

            {/* Region */}
            <div style={{ marginBottom: '1rem' }}>
                <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '0.4rem' }}>DEPLOYMENT REGION</label>
                <select
                    disabled={status !== 'disconnected' || !isAuthVerified}
                    value={region}
                    onChange={e => onRegionChange(e.target.value)}
                >
                    <option value="" disabled>Select a region...</option>
                    {regions.map(r => {
                        const ms = regionLatencies?.[r];
                        const latencyTag = ms !== undefined && ms > 0 ? ` (${ms}ms)` : '';
                        return (
                            <option key={r} value={r}>
                                {r} &mdash; {getRegionLabel(r)}{latencyTag}
                            </option>
                        );
                    })}
                </select>
                <div className="text-xs text-muted mt-1">Suggested · Closest to you</div>
            </div>

            {/* Size & Price */}
            <div className="grid-cols-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                    <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '0.4rem' }}>INSTANCE SIZE</label>
                    <select
                        disabled={status !== 'disconnected'}
                        value={instanceSize}
                        onChange={e => setInstanceSize(e.target.value)}
                    >
                        <option value="micro">Micro – Low Cost · 1-3 Devices</option>
                        <option value="small">Small – Moderate Traffic</option>
                        <option value="medium">Medium – Heavy Usage</option>
                    </select>
                </div>
                <div>
                    <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '0.4rem' }}>EST. SPOT PRICE</label>
                    <div className="input-display mono text-accent">
                        {price} <span className="text-xs text-muted">/ hr</span>
                    </div>
                </div>
            </div>

            {/* Auto Termination */}
            <div style={{ marginBottom: '1rem' }}>
                <label className="text-muted text-xs" style={{ display: 'block', marginBottom: '0.4rem' }}>AUTO-TERMINATION</label>
                <select
                    disabled={status !== 'disconnected'}
                    value={duration}
                    onChange={e => onDurationChange(e.target.value)}
                >
                    <option value="60">After 1 Hour</option>
                    <option value="240">After 4 Hours</option>
                    <option value="480">After 8 Hours (Workday)</option>
                    <option value="1440">After 24 Hours (Recommended)</option>
                    <option value="0">Disabled (Manual Stop Only)</option>
                </select>
                <div className="text-xs text-muted mt-1">Automatically stops node to control costs.</div>
            </div>

            {/* Advanced Section */}
            <div style={{ marginBottom: '1.5rem' }}>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-muted hover:text-white flex items-center gap-1"
                    style={{ background: 'none', border: 'none', padding: 0 }}
                >
                    {showAdvanced ? '▼' : '▶'} Advanced Settings
                </button>

                {showAdvanced && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                        <div className="form-group mb-4">
                            <label className="text-muted text-xs label-block">WIREGUARD PORT</label>
                            <input type="text" value="51820 (UDP)" disabled className="input-display opacity-50" />
                        </div>
                        <div className="form-group mb-4">
                            <label className="text-muted text-xs label-block">ACCESS CONTROL (CIDR)</label>
                            <select disabled className="opacity-50"><option>Only My IP (Recommended)</option></select>
                        </div>
                        <div className="form-group">
                            <label className="text-muted text-xs label-block">DNS SERVER</label>
                            <select disabled className="opacity-50"><option>Cloudflare (1.1.1.1)</option></select>
                        </div>
                    </div>
                )}
            </div>

            {status === 'disconnected' ? (
                <button
                    className="btn-launch"
                    onClick={onConnect}
                    disabled={!isAuthVerified}
                    style={{ opacity: isAuthVerified ? 1 : 0.5 }}
                >
                    <span>LAUNCH VPN NODE</span>
                </button>
            ) : (
                <button className="btn-stop" onClick={onDisconnect}>
                    <span>TERMINATE NODE</span>
                </button>
            )}
        </div>
    );
};
