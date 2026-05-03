import React from 'react';
import { StatusOrb } from '../dashboard/StatusOrb';
import { LaunchConfig } from '../dashboard/LaunchConfig';
import { ConnectionLog } from '../dashboard/ConnectionLog';
import { TunnelConfig } from '../dashboard/TunnelConfig';

interface MissionControlProps {
    status: string;
    progressMsg: string;
    activeCloud: string;
    isAuthVerified: boolean;
    region: string;
    regions: string[];
    price: string;
    duration: string;
    log: string[];
    configs: { name: string, config: string, qr_code: string }[];
    sessionData: { start: string, durationLimit: number } | null;
    regionLatencies?: Record<string, number>;

    // Handlers
    onSetProvider: (provider: string) => void;
    onRegionChange: (region: string) => void;
    onDurationChange: (duration: string) => void;
    onConnect: () => void;
    onDisconnect: () => void;
}

const TimerDisplay = ({ start, limit }: { start: string, limit: number }) => {
    const [timeLeft, setTimeLeft] = React.useState<string>("");
    const [isExpired, setIsExpired] = React.useState(false);

    React.useEffect(() => {
        if (!limit || limit <= 0) {
            setTimeLeft("∞");
            return;
        }
        const interval = setInterval(() => {
            const startTime = new Date(start).getTime();
            const endTime = startTime + (limit * 60 * 1000);
            const now = Date.now();
            const diff = endTime - now;

            if (diff <= 0) {
                setTimeLeft("00:00:00");
                setIsExpired(true);
                clearInterval(interval);
            } else {
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                const s = Math.floor((diff % 60000) / 1000);
                setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [start, limit]);

    if (!limit) return null;

    return (
        <div style={{
            position: 'absolute', top: '1rem', right: '50%', transform: 'translateX(50%)',
            background: 'rgba(0,0,0,0.6)', padding: '0.25rem 0.75rem', borderRadius: '16px',
            border: `1px solid ${isExpired ? 'red' : 'var(--accent-primary)'}`,
            color: isExpired ? 'red' : 'var(--accent-primary)',
            fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem', fontWeight: 'bold',
            display: 'flex', alignItems: 'center', gap: '8px'
        }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            AUTO-DESTROY: {timeLeft}
        </div>
    );
};

export const MissionControl: React.FC<MissionControlProps> = (props) => {
    return (
        <div className="mission-wrapper" style={{ position: 'relative' }}>
            {/* Header Section */}
            <header className="mission-header">
                <div>
                    <h1 className="text-gradient">Mission Control</h1>
                    <p className="text-muted">Orchestrate your secure private network</p>
                </div>

                {/* Timer (Centered in Header via absolute positioning in TimerDisplay) */}
                {props.status === 'connected' && props.sessionData && props.sessionData.durationLimit > 0 && (
                    <TimerDisplay start={props.sessionData.start} limit={props.sessionData.durationLimit} />
                )}

                <div className="status-container">
                    <StatusOrb status={props.status} message={props.progressMsg} />
                </div>
            </header>

            {/* Main Grid Layout */}
            <div className="mission-grid">

                {/* Primary Column (Launch & Logs) */}
                <div className="mission-col-primary">
                    {/* Launch Card */}
                    <div className="mission-card-wrapper">
                        <LaunchConfig
                            activeCloud={props.activeCloud}
                            status={props.status}
                            isAuthVerified={props.isAuthVerified}
                            region={props.region}
                            regions={props.regions}
                            price={props.price}
                            duration={props.duration}
                            regionLatencies={props.regionLatencies}
                            onSetProvider={props.onSetProvider}
                            onRegionChange={props.onRegionChange}
                            onDurationChange={props.onDurationChange}
                            onConnect={props.onConnect}
                            onDisconnect={props.onDisconnect}
                        />
                    </div>

                    {/* Logs Card */}
                    <div className="mission-card-wrapper">
                        <ConnectionLog logs={props.log} />
                    </div>
                </div>

                {/* Secondary Column (Tunnel Config) */}
                <div className="mission-col-secondary">
                    <TunnelConfig configs={props.configs} />
                </div>
            </div>
        </div>
    );
};
