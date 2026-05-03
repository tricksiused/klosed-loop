import React, { useEffect, useState, useMemo } from 'react';
import { GetHistory, RemoveHistoryItem } from '../../../wailsjs/go/main/App';
import { config } from '../../../wailsjs/go/models';

const styles: { [key: string]: React.CSSProperties } = {
    container: { padding: '2rem', height: '100%', overflowY: 'auto' },
    summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '2rem' },
    summaryCard: {
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '12px',
        padding: '1.5rem',
        backdropFilter: 'blur(10px)',
        display: 'flex', flexDirection: 'column', gap: '5px'
    },
    cardLabel: { fontSize: '0.85rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' },
    cardValue: { fontSize: '1.8rem', fontWeight: 'bold', color: '#f8fafc', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },

    controlsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' },
    searchInput: {
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '10px 16px',
        color: 'white',
        width: '300px',
        fontSize: '0.9rem',
        outline: 'none'
    },
    filterSelect: {
        background: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        padding: '10px 16px',
        color: 'white',
        fontSize: '0.9rem',
        outline: 'none',
        cursor: 'pointer'
    },

    tableContainer: {
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        borderRadius: '16px',
        overflowX: 'auto', // Allow horizontal scroll
        backdropFilter: 'blur(5px)'
    },
    table: { width: '100%', minWidth: '800px', borderCollapse: 'collapse' }, // minWith ensures it doesn't squish too much
    th: { textAlign: 'left', padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#64748b', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' },
    td: { padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.02)', color: '#e2e8f0', fontSize: '0.9rem', verticalAlign: 'middle' },

    // Chips & Badges
    badge: { padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '6px' },

    // Actions
    actionBtn: {
        background: 'rgba(255,255,255,0.05)',
        border: 'none',
        color: '#94a3b8',
        padding: '8px',
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'all 0.2s'
    },

    empty: { textAlign: 'center', padding: '5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: '#64748b' }
};

interface HistoryViewProps {
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ addToast }) => {
    const [history, setHistory] = useState<config.HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [providerFilter, setProviderFilter] = useState("all");

    const load = async () => {
        try {
            const list = await GetHistory();
            setHistory(list || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await RemoveHistoryItem(id);
            addToast("Record deleted", 'success');
            load();
        } catch (e: any) {
            addToast("Delete failed: " + e.message, 'error');
        }
    };

    const handleCopy = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        addToast(`${label} copied to clipboard`, 'success');
    };

    // --- Computed Data ---
    const filteredHistory = useMemo(() => {
        return history.filter(h => {
            const matchesSearch =
                h.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                h.public_ip.includes(searchTerm) ||
                h.region.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesProvider = providerFilter === 'all' || h.provider.toLowerCase() === providerFilter.toLowerCase();
            return matchesSearch && matchesProvider;
        });
    }, [history, searchTerm, providerFilter]);

    const metrics = useMemo(() => {
        const total = history.length;
        const cost = history.reduce((acc, curr) => acc + curr.cost, 0);
        // Calculate approx average duration
        // Simple heuristic: converting "45m0s" strings is complex without parsing logic, 
        // but backend sends pre-formatted string. 
        // For avg duration, ideally we'd need seconds. 
        // We will just show Total/Cost for now to ensure accuracy.
        return { total, cost };
    }, [history]);

    // --- Helpers ---
    const getProviderIcon = (p: string) => {
        if (p.toLowerCase().includes('aws')) return (
            <svg className="w-5 h-5 text-orange-400" fill="currentColor" viewBox="0 0 24 24"><path d="M12.5 7.2h-1.3V16h1.3V7.2zm-2.4 3.7H8.8v5.1h1.3v-5.1zm4.8 0h-1.3v5.1h1.3v-5.1zm2.5-1.9h-1.3v7h1.3v-7z" /></svg> // Simplified
        );
        return <span style={{ fontWeight: 'bold' }}>{p.slice(0, 3).toUpperCase()}</span>;
    };

    const statusColor = (status: string) => {
        if (status === 'Terminated') return { bg: 'rgba(239, 68, 68, 0.1)', col: '#f87171' }; // Red
        if (status === 'Active') return { bg: 'rgba(16, 185, 129, 0.1)', col: '#34d399' };     // Green
        return { bg: 'rgba(148, 163, 184, 0.1)', col: '#94a3b8' }; // Gray
    };

    // --- Render ---
    if (loading) return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading history...</div>;

    return (
        <div style={styles.container}>
            <header className="header" style={{ marginBottom: '2rem' }}>
                <div><h1>History</h1><p className="text-muted">Managed infrastructure logs</p></div>
            </header>

            {/* Summary Cards */}
            <div style={styles.summaryRow}>
                <div style={styles.summaryCard}>
                    <span style={styles.cardLabel}>Total Sessions</span>
                    <span style={styles.cardValue}>{metrics.total}</span>
                </div>
                <div style={styles.summaryCard}>
                    <span style={styles.cardLabel}>Total Spend (Est)</span>
                    <span style={styles.cardValue}>${metrics.cost.toFixed(4)}</span>
                </div>
                <div style={styles.summaryCard}>
                    <span style={styles.cardLabel}>Last Active</span>
                    <span style={{ ...styles.cardValue, fontSize: '1.2rem' }}>
                        {history.length > 0 ? history[0].start_time.split(' ')[0] : 'N/A'}
                    </span>
                </div>
            </div>

            {/* Controls */}
            <div style={styles.controlsRow}>
                <div style={{ position: 'relative' }}>
                    {/* Explicitly set width/height to prevent huge default SVG size if tailwind fails */}
                    <svg style={{ position: 'absolute', left: '12px', top: '13px', color: '#64748b', width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                        style={{ ...styles.searchInput, paddingLeft: '36px' }}
                        placeholder="Search IP, ID, or Region..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <select
                    style={styles.filterSelect}
                    value={providerFilter}
                    onChange={e => setProviderFilter(e.target.value)}
                >
                    <option value="all">All Providers</option>
                    <option value="aws">AWS</option>
                    <option value="gcp">GCP</option>
                </select>
            </div>

            {/* Table */}
            {filteredHistory.length === 0 ? (
                <div style={styles.empty}>
                    <svg style={{ width: '64px', height: '64px', marginBottom: '1rem', opacity: 0.2 }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p>No history records found.</p>
                </div>
            ) : (
                <div style={styles.tableContainer}>
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                <th style={styles.th}>Provider</th>
                                <th style={styles.th}>Instance Details</th>
                                <th style={styles.th}>Public IP</th>
                                <th style={styles.th}>Duration</th>
                                <th style={styles.th}>Cost</th>
                                <th style={styles.th}>Status</th>
                                <th style={styles.th}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredHistory.map((h, i) => {
                                const st = statusColor(h.status);
                                return (
                                    <tr key={i} style={{ borderBottom: i === filteredHistory.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.02)', transition: 'background 0.2s' }} className="hover:bg-white/5">
                                        <td style={styles.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {getProviderIcon(h.provider)}
                                                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{h.region}</span>
                                            </div>
                                        </td>
                                        <td style={styles.td}>
                                            <div style={{ fontWeight: 500, color: '#f1f5f9', cursor: 'pointer' }} onClick={() => handleCopy(h.id, "Instance ID")} title="Click to copy ID">
                                                {h.id}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{h.instance_type} • {h.start_time}</div>
                                        </td>
                                        <td style={styles.td}>
                                            <span
                                                style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                                onClick={() => handleCopy(h.public_ip, "IP Address")}
                                                title="Click to copy IP"
                                            >
                                                {h.public_ip || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={styles.td}>{h.duration}</td>
                                        <td style={styles.td}>${h.cost.toFixed(4)}</td>
                                        <td style={styles.td}>
                                            <span style={{ ...styles.badge, background: st.bg, color: st.col }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.col }}></span>
                                                {h.status}
                                            </span>
                                        </td>
                                        <td style={styles.td}>
                                            <button
                                                onClick={(e) => handleDelete(h.id, e)}
                                                style={{ ...styles.actionBtn, color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)' }}
                                                title="Delete Log"
                                            >
                                                <svg style={{ width: '16px', height: '16px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
