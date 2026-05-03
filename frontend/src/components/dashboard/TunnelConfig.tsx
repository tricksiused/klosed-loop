import React, { useState } from 'react';

// Reusing Icons object or importing if separated. Local definition for now.
const Icons = {
    Link: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
};


interface TunnelConfigProps {
    configs: { name: string, config: string, qr_code: string }[];
}

export const TunnelConfig: React.FC<TunnelConfigProps> = ({ configs }) => {
    const [activePeerIndex, setActivePeerIndex] = useState(0);

    return (
        <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2><Icons.Link /> Secure Tunnel</h2>
                <div style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px' }}>Step 3</div>
            </div>

            {configs.length > 0 ? (
                <div style={{ width: '100%', animation: 'fadeIn 0.5s ease', display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <div className="form-group mb-4">
                        <label className="text-muted text-xs label-block">CLIENT PROFILE</label>
                        <select
                            value={activePeerIndex}
                            onChange={(e) => setActivePeerIndex(parseInt(e.target.value))}
                            style={{ width: '100%' }}
                        >
                            {configs.map((c, i) => (
                                <option key={i} value={i}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div className="qr-placeholder" style={{ margin: '0 auto 1.5rem auto', padding: '10px', background: '#fff', borderRadius: '12px' }}>
                            {configs[activePeerIndex]?.qr_code ?
                                <img src={`data:image/png;base64,${configs[activePeerIndex].qr_code}`} alt="WireGuard QR" style={{ width: '140px', height: '140px' }} />
                                : <div style={{ width: '140px', height: '140px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000' }}>No QR</div>
                            }
                        </div>

                        <div className="text-xs text-muted mb-4 text-center">
                            1. Install WireGuard App<br />
                            2. Scan QR or Import Config<br />
                            3. Activate Tunnel
                        </div>

                        <div className="flex gap-2">
                            <button className="nav-btn text-xs" style={{ border: '1px solid var(--glass-border)' }}>Download .conf</button>
                            <button className="nav-btn text-xs" style={{ border: '1px solid var(--glass-border)' }}>Copy Config</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '50%', width: '5rem', height: '5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--glass-border)' }}>
                        <Icons.Link />
                    </div>
                    <p className="text-center text-sm">Deploy a VPN node to generate<br />WireGuard configuration.</p>
                </div>
            )}
        </div>
    );
};
