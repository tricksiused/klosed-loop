import React, { useState, useEffect } from 'react';
import { ModernProgressBar } from '../ModernProgressBar';
import { ListProfiles, GetActiveProfile, SetActiveProfile, SaveProfile, DeleteProfile, GetCredentialStatus } from '../../../wailsjs/go/main/App';

// --- ICONS ---
const Icons = {
    ShieldCheck: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>,
    User: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
    Key: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6" /><path d="m15.5 7.5 3 3L22 7l-3-3" /></svg>,
    Plus: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>,
    Trash: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>,
    Edit: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>,
    CheckCircle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
    XCircle: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>,
    Copy: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
    container: { display: 'flex', width: '100%', height: 'calc(100vh - 40px)', background: '#0f172a', color: '#e2e8f0', fontFamily: 'sans-serif', overflow: 'hidden', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' },
    sidebar: { width: '300px', display: 'flex', flexDirection: 'column', borderRight: '1px solid rgba(255,255,255,0.05)', background: 'rgba(30, 41, 59, 0.5)', backdropFilter: 'blur(10px)' },
    sidebarHeader: { padding: '24px', borderBottom: '1px solid rgba(255,255,255,0.05)' },
    main: { flex: 1, display: 'flex', flexDirection: 'column', background: 'linear-gradient(to bottom right, #0f172a, #1e1b4b)', position: 'relative', overflow: 'hidden' },
    scrollArea: { flex: 1, overflowY: 'auto', padding: '16px' },
    card: { padding: '24px', borderRadius: '16px', background: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)', marginBottom: '24px' },
    identityCard: { padding: '24px', borderRadius: '16px', background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', marginBottom: '24px', position: 'relative', overflow: 'hidden' },
    title: { fontSize: '24px', fontWeight: 'bold', color: 'white', marginBottom: '8px' },
    subtitle: { fontSize: '14px', color: '#94a3b8' },
    input: { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px', color: 'white', marginTop: '8px', outline: 'none' },
    btnPrimary: { width: '100%', padding: '12px', borderRadius: '8px', background: '#db2777', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: 'transform 0.1s' },
    btnSecondary: { width: '100%', padding: '12px', borderRadius: '8px', background: 'transparent', color: '#94a3b8', fontWeight: 'bold', border: '1px solid #334155', cursor: 'pointer' },
    profileItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '8px', cursor: 'pointer', marginBottom: '8px', transition: 'background 0.2s', border: '1px solid transparent' },
    profileActive: { background: 'rgba(219, 39, 119, 0.1)', borderColor: 'rgba(219, 39, 119, 0.3)' },
};

// --- TYPES ---
interface CredentialsViewProps {
    activeCloud: string;
    authStatus: any;
    isAuthVerified: boolean;
    onAuthUpdate: () => Promise<void>;
    addToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
}

export const CredentialsView: React.FC<CredentialsViewProps> = (props) => {
    const [profiles, setProfiles] = useState<string[]>([]);
    const [activeProfile, setActiveProfile] = useState<string>('');
    const [localAuthStatus, setLocalAuthStatus] = useState<any>(null);
    const [viewMode, setViewMode] = useState<'DETAILS' | 'EDIT' | 'ADD'>('DETAILS');
    const [loading, setLoading] = useState(false);

    // Progress State
    const [progressStatus, setProgressStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
    const [progressMessage, setProgressMessage] = useState('');

    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form
    const [formName, setFormName] = useState('');
    const [formKey, setFormKey] = useState('');
    const [formSecret, setFormSecret] = useState('');

    const effectiveAuthStatus = localAuthStatus || props.authStatus;

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const list = await ListProfiles();
            const active = await GetActiveProfile();
            setProfiles(list || []);
            setActiveProfile(active || 'default');
        } catch (e) { console.error(e); }
    };

    const handleSwitch = async (name: string) => {
        if (name === activeProfile) return;
        try {
            await SetActiveProfile(name);
            setActiveProfile(name);
            setLocalAuthStatus(null);
            setViewMode('DETAILS');
            await props.onAuthUpdate();
            props.addToast(`Switched to ${name}`, 'success');
        } catch (e) { props.addToast("Switch failed", 'error'); }
    };

    const handleSave = async () => {
        if (!formName || !formKey || !formSecret) return props.addToast("Fill all fields", 'error');

        setLoading(true);
        setProgressStatus('connecting');
        setProgressMessage("Saving Credentials securely...");

        try {
            // 1. Save
            await SaveProfile(formName, formKey, formSecret, "");

            // 2. Verify Auth
            setProgressMessage("Verifying Identity with AWS STS...");
            await new Promise(r => setTimeout(r, 800)); // Visual delay

            // 3. Set Active & Reload
            await SetActiveProfile(formName);
            await loadData();

            // 4. Verify Permissions
            setProgressMessage("Checking IAM Permissions...");
            await props.onAuthUpdate();

            setProgressMessage("Success! Profile Configured.");
            await new Promise(r => setTimeout(r, 600));

            props.addToast("Profile Saved & Verified", 'success');
            setViewMode('DETAILS');
            setFormKey(''); setFormSecret('');
        } catch (e: any) {
            props.addToast(e.toString(), 'error');
        } finally {
            setLoading(false);
            setProgressStatus('disconnected');
        }
    };

    const handleDelete = async (name: string) => {
        if (deleteConfirm === name) {
            // Second click: actually delete
            if (name === activeProfile) await SetActiveProfile('default');
            await DeleteProfile(name);
            loadData();
            setDeleteConfirm(null);
            props.addToast("Deleted", 'success');
        } else {
            // First click: ask for confirmation
            setDeleteConfirm(name);
            // Auto-reset after 3 seconds
            setTimeout(() => setDeleteConfirm(current => current === name ? null : current), 3000);
        }
    };

    return (
        <div style={styles.container}>
            <ModernProgressBar status={progressStatus} message={progressMessage} />
            {/* SIDEBAR */}
            <aside style={styles.sidebar}>
                <div style={styles.sidebarHeader}>
                    <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: 'white' }}>Profiles</h2>
                    <p style={{ fontSize: '12px', color: '#94a3b8' }}>AWS Access Keys</p>
                </div>
                <div style={styles.scrollArea}>
                    <button
                        onClick={() => { setFormName(''); setFormKey(''); setFormSecret(''); setViewMode('ADD'); }}
                        style={{ ...styles.profileItem, justifyContent: 'center', border: '1px dashed #475569', color: '#cbd5e1', width: '100%' }}
                    >
                        <span style={{ marginRight: '8px', display: 'flex' }}><Icons.Plus /></span> Add Profile
                    </button>

                    {profiles.map(p => {
                        const isActive = p === activeProfile;
                        const isConfirming = deleteConfirm === p;
                        return (
                            <div key={p}
                                onClick={() => handleSwitch(p)}
                                style={{ ...styles.profileItem, ...(isActive ? styles.profileActive : {}) }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                                    <div style={{ padding: '8px', borderRadius: '6px', background: isActive ? '#db2777' : '#334155', color: isActive ? 'white' : '#94a3b8' }}>
                                        <Icons.User />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 600, color: isActive ? 'white' : '#cbd5e1' }}>{p}</span>
                                        {p === 'default' && <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase' }}>Default</span>}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setFormName(p); setFormKey(''); setFormSecret(''); setViewMode('EDIT'); }}
                                        style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                                    >
                                        <Icons.Edit />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(p); }}
                                        style={{ background: isConfirming ? '#db2777' : 'transparent', borderRadius: '4px', border: 'none', color: isConfirming ? 'white' : '#f87171', cursor: 'pointer', padding: '4px', transition: 'all 0.2s', width: isConfirming ? 'auto' : '24px' }}
                                        title={isConfirming ? "Click again to delete" : "Delete Profile"}
                                    >
                                        {isConfirming ? <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '0 4px' }}>CONFIRM?</span> : <Icons.Trash />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main style={styles.main}>
                {(viewMode === 'ADD' || viewMode === 'EDIT') ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
                        <div style={{ width: '100%', maxWidth: '480px', background: 'rgba(30,41,59,0.9)', padding: '32px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                <div style={{ display: 'inline-flex', padding: '16px', borderRadius: '50%', background: 'rgba(219,39,119,0.1)', color: '#db2777', marginBottom: '16px' }}>
                                    <Icons.Key />
                                </div>
                                <h2 style={styles.title}>{viewMode === 'ADD' ? 'Add Profile' : 'Edit Profile'}</h2>
                                <p style={styles.subtitle}>Enter your AWS IAM credentials safely.</p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Profile Name</label>
                                    <input value={formName} onChange={e => setFormName(e.target.value)} disabled={viewMode === 'EDIT'} placeholder="e.g. production" style={styles.input} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Access Key ID</label>
                                    <input value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="AKIA..." style={{ ...styles.input, fontFamily: 'monospace' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Secret Access Key</label>
                                    <input type="password" value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="wJalr..." style={{ ...styles.input, fontFamily: 'monospace' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
                                    <button onClick={() => setViewMode('DETAILS')} style={styles.btnSecondary}>Cancel</button>
                                    <button onClick={handleSave} disabled={loading} style={styles.btnPrimary}>{loading ? 'Verifying...' : 'Save Profile'}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ padding: '32px', overflowY: 'auto', flex: 1 }}>
                        <header style={{ marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: 'white', marginBottom: '8px' }}>Dashboard</h1>
                            <p style={styles.subtitle}>
                                Current Session: <span style={{ color: '#f472b6', fontFamily: 'monospace', background: 'rgba(219,39,119,0.1)', padding: '2px 6px', borderRadius: '4px' }}>{activeProfile}</span>
                            </p>
                        </header>

                        {/* STATUS VISUALS */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px', marginBottom: '32px' }}>
                            <div style={styles.identityCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontWeight: 'bold', color: 'white', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Icons.User /> Identity
                                        </h3>
                                        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                                            Active IAM Principal
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '20px', background: effectiveAuthStatus?.valid ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)', border: `1px solid ${effectiveAuthStatus?.valid ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`, boxShadow: effectiveAuthStatus?.valid ? '0 0 10px rgba(74,222,128,0.1)' : 'none' }}>
                                        <div style={{ color: effectiveAuthStatus?.valid ? '#4ade80' : '#f87171', display: 'flex' }}><Icons.ShieldCheck /></div>
                                        <span style={{ fontSize: '12px', fontWeight: 'ebold', color: effectiveAuthStatus?.valid ? '#4ade80' : '#f87171', letterSpacing: '0.5px' }}>
                                            {effectiveAuthStatus?.valid ? 'CONNECTED' : 'DISCONNECTED'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                    <code style={{ fontSize: '13px', color: '#e2e8f0', fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>
                                        {effectiveAuthStatus?.identity || 'No active identity found.'}
                                    </code>
                                    {effectiveAuthStatus?.identity && (
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(effectiveAuthStatus.identity); props.addToast("Copied ARN", "success"); }}
                                            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '6px', padding: '8px', color: '#94a3b8', cursor: 'pointer', transition: 'all 0.2s', display: 'flex' }}
                                            title="Copy ARN"
                                        >
                                            <Icons.Copy />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* CAPABILITIES */}
                        <div style={styles.card}>
                            <h3 style={{ fontSize: '14px', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icons.Key /> Active Permissions
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                {['ec2:RunInstances', 'ec2:DescribeRegions', 'ec2:DescribeVpcs', 'ec2:CreateTags', 'ec2:DescribeImages', 'ec2:DescribeSecurityGroups'].map(perm => {
                                    const missing = effectiveAuthStatus?.missing_permissions || [];
                                    const hasPerm = !missing.includes(perm) && effectiveAuthStatus?.valid;
                                    const labelMap: any = {
                                        'ec2:RunInstances': 'Launch Instances', 'ec2:DescribeRegions': 'List Regions', 'ec2:DescribeVpcs': 'Discover Network',
                                        'ec2:CreateTags': 'Resource Tagging', 'ec2:DescribeImages': 'List OS Images', 'ec2:DescribeSecurityGroups': 'Read Firewalls'
                                    };
                                    return (
                                        <div key={perm} style={{ padding: '16px', borderRadius: '12px', border: '1px solid', borderColor: hasPerm ? 'rgba(255,255,255,0.05)' : 'rgba(248,113,113,0.2)', background: hasPerm ? 'rgba(255,255,255,0.02)' : 'rgba(248,113,113,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 'bold', color: 'white', fontSize: '14px' }}>{labelMap[perm]}</div>
                                                <div style={{ fontSize: '10px', color: '#64748b', fontFamily: 'monospace' }}>{perm}</div>
                                            </div>
                                            <div>{hasPerm ? <Icons.CheckCircle /> : <Icons.XCircle />}</div>
                                        </div>
                                    )
                                })}
                            </div>
                            {!effectiveAuthStatus?.valid && (
                                <div style={{ marginTop: '24px', padding: '16px', borderRadius: '12px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)', color: '#fca5a5', fontSize: '14px' }}>
                                    <strong>Auth Error:</strong> {effectiveAuthStatus?.error || "Check credentials."}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};
