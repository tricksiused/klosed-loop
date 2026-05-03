import React from 'react';

interface StatusOrbProps {
    status: string;
    message: string;
}

export const StatusOrb: React.FC<StatusOrbProps> = ({ status, message }) => {
    return (
        <div className="status-badge">
            {status === 'connecting' && <span className="text-xs text-muted blink">{message}</span>}
            {status === 'connected' && <span className="text-xs text-muted" style={{ color: 'var(--accent-success)' }}>Secure Link Active</span>}

            <div className={`status-indicator status-${status}`}>
                <div className="status-ring"></div>
                <div className="status-dot"></div>
            </div>
        </div>
    );
};
