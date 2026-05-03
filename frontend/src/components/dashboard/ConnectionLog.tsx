import React from 'react';

interface ConnectionLogProps {
    logs: string[];
}

export const ConnectionLog: React.FC<ConnectionLogProps> = ({ logs }) => {
    return (
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Deployment & Runtime Logs
                </h2>
                <div style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '12px' }}>Step 2</div>
            </div>

            <div className="log-box" style={{
                height: '240px', // Fixed height as requested ("make it small")
                minHeight: '240px', // Prevent collapse
                overflowY: 'auto', // Scrollable
                background: 'rgba(0,0,0,0.3)',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #333',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                color: '#ddd'
            }}>
                {logs.length === 0 ? (
                    <div style={{ color: '#64748b', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ marginBottom: '0.5rem' }}>No active deployments yet.</div>
                        <div style={{ fontSize: '0.8rem' }}>Launch a VPN node to view logs and system events.</div>
                    </div>
                ) : (
                    logs.map((l, i) => (
                        <div key={i} style={{ marginBottom: '2px', wordBreak: 'break-word' }}>
                            {l}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
