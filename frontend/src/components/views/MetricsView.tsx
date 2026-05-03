import React, { useState, useEffect, useRef } from 'react';
import { cloud } from '../../../wailsjs/go/models';
import { PingInstance } from '../../../wailsjs/go/main/App';

interface MetricsViewProps {
    metrics: cloud.InstanceDetails | null;
    region: string;
    status: string;
}

// --- STYLES ---
const COLORS = {
    primary: '#00f3ff', // Cyan
    secondary: '#bc13fe', // Magenta
    success: '#4ade80', // Green
    warning: '#facc15', // Yellow
    danger: '#ef4444', // Red
    darkBg: '#0f172a',
    grid: 'rgba(255,255,255,0.05)',
};

// --- COMPONENTS ---

// 1. Latency Graph (Sparkline)
const LatencyGraph = ({ data }: { data: number[] }) => {
    const width = 100;
    const height = 40;
    const maxVal = Math.max(300, ...data); // Fixed scale up to 300ms, or auto-scale if higher

    // Check availability
    if (data.length === 0) return <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '0.8rem' }}>NO DATA</div>;

    // Create SVG path
    const points = data.map((val, i) => {
        const x = (i / (data.length - 1)) * width;
        const y = height - (val / maxVal) * height;
        return `${x},${y}`;
    }).join(' ');

    const lastVal = data[data.length - 1];
    let strokeColor = COLORS.success;
    if (lastVal > 100) strokeColor = COLORS.warning;
    if (lastVal > 200) strokeColor = COLORS.danger;

    return (
        <div style={{ width: '100%', height: '100px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '10px', position: 'relative', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ position: 'absolute', top: 5, left: 10, fontSize: '0.7rem', color: '#aaa', fontWeight: 600 }}>LATENCY HISTORY (60s)</div>
            <div style={{ position: 'absolute', top: 5, right: 10, fontSize: '0.7rem', color: strokeColor, fontWeight: 600 }}>{lastVal} ms</div>

            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', marginTop: '10px' }}>
                {/* Gradient Definition */}
                <defs>
                    <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
                        <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d={`M0,${height} ${points} L${width},${height}`} fill="url(#grad)" stroke="none" />
                <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>

            {/* Grid Lines Overlay */}
            <div style={{ position: 'absolute', bottom: '10px', left: 0, right: 0, borderTop: '1px dashed rgba(255,255,255,0.1)' }}></div>
        </div>
    );
};

// 2. Stat Card
const StatCard = ({ label, value, subtext, color = COLORS.primary }: { label: string, value: string, subtext?: string, color?: string }) => (
    <div style={{
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '12px', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '5px'
    }}>
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9', fontFamily: 'JetBrains Mono' }}>{value}</div>
        {subtext && <div style={{ fontSize: '0.75rem', color: color }}>{subtext}</div>}
    </div>
);


// --- MAIN VIEW ---

export const MetricsView: React.FC<MetricsViewProps> = ({ metrics, region, status }) => {
    const [elapsed, setElapsed] = useState(0);
    const [cost, setCost] = useState(0.0000);
    const [latencyHistory, setLatencyHistory] = useState<number[]>([]);

    // AWS T3.Micro Spot Price Assumption (approx average across regions)
    // In future, pass real price from backend
    const PRICE_PER_HOUR = 0.0045;

    // 1. Session Timer & Cost (High Precision)
    useEffect(() => {
        if (status === 'connected' && metrics?.launch_time) {
            const start = new Date(metrics.launch_time).getTime();
            const update = () => {
                const diffMs = Date.now() - start;
                setElapsed(diffMs);
                setCost((diffMs / 3600000) * PRICE_PER_HOUR);
            };
            const t = setInterval(update, 1000); // 1s tick
            update(); // Initial call
            return () => clearInterval(t);
        }
    }, [status, metrics]);

    // 2. Real Ping Polling (No Fake Data)
    useEffect(() => {
        if (status === 'connected' && metrics?.public_ip) {
            let mounted = true;
            const poll = async () => {
                if (!mounted) return;
                const ms = await PingInstance(metrics.public_ip);
                if (!mounted) return;

                setLatencyHistory(prev => {
                    const next = [...prev, ms];
                    if (next.length > 60) next.shift(); // Keep last 60 points
                    return next;
                });
            };

            // Poll every 1s
            const t = setInterval(poll, 1000);
            poll(); // Initial
            return () => { mounted = false; clearInterval(t); };
        }
    }, [status, metrics]);

    // Format Helpers
    const formatTime = (ms: number) => new Date(ms).toISOString().substr(11, 8);
    const fmtCost = (val: number) => `$${val.toFixed(5)}`;

    if (status !== 'connected' || !metrics) {
        return (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#666' }}>
                <div style={{ fontSize: '3rem', opacity: 0.2, marginBottom: '1rem' }}>📡</div>
                <h2 style={{ fontFamily: 'JetBrains Mono', fontSize: '1.2rem', marginBottom: '0.5rem' }}>AWAITING TELEMETRY</h2>
                <p style={{ fontSize: '0.8rem', opacity: 0.6 }}>Connect to an instance to view real-time stats.</p>
            </div>
        );
    }

    return (
        <div style={{
            height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem',
            fontFamily: '"Inter", sans-serif', color: '#eee', padding: '1rem'
        }}>
            {/* Header */}
            <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.2rem' }}>Instance Telemetry</h2>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.8rem', color: '#94a3b8' }}>
                    <span style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{metrics.instance_id}</span>
                    <span>•</span>
                    <span>{metrics.availability_zone || region}</span>
                    <span>•</span>
                    <span style={{ color: COLORS.success, fontWeight: 500 }}>RUNNING</span>
                </div>
            </div>

            {/* Key Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <StatCard
                    label="Session Duration"
                    value={formatTime(elapsed)}
                    subtext="Since Launch"
                    color="#e2e8f0"
                />
                <StatCard
                    label="Current Estimate"
                    value={fmtCost(cost)}
                    subtext={`Rate: $${PRICE_PER_HOUR}/hr`}
                    color={COLORS.primary}
                />
                <StatCard
                    label="Data Transfer"
                    value="--" // Requires local agent
                    subtext="Unavailable (No Agent)"
                    color="#64748b"
                />
            </div>

            {/* Latency Graph (Hero Feature) */}
            <div style={{ flex: 1, minHeight: '150px', display: 'flex', flexDirection: 'column' }}>
                <LatencyGraph data={latencyHistory} />
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Ping Interval: 1000ms</span>
                    <span>Target: {metrics.public_ip}</span>
                </div>
            </div>

            {/* Static Specs (Honest Representation) */}
            <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: '#64748b', marginBottom: '10px' }}>PROVISIONED CAPACITY (T3.MICRO)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>vCPU</span>
                        <span style={{ fontWeight: 500 }}>2 vCPUs</span>
                    </div>
                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#94a3b8' }}>Memory</span>
                        <span style={{ fontWeight: 500 }}>1.0 GiB</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
