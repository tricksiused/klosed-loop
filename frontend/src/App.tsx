import { useState, useEffect } from 'react';
import { Connect, Disconnect, GetPrice, GetSession, GetCredentialStatus, GetRegions, GetRegionLatencies, GetInstanceDetails, GetLatestMetrics, SetProvider, SaveAuth, SaveAuthGCP, GetPreferences, TerminateAndQuit, TerminateInstance } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';
import { ToastProvider, useToast } from './components/Toaster';
import { main } from '../wailsjs/go/models'; // Import models
import './index.css';
import { ModernProgressBar } from './components/ModernProgressBar';
import { CredentialsView } from './components/views/CredentialsView';
import { SettingsView } from './components/views/SettingsView';
import { MissionControl } from './components/views/MissionControl';
import { DevicesView } from './components/views/DevicesView';
import { MetricsView } from './components/views/MetricsView';
import { HistoryView } from './components/views/HistoryView';

import { QuickStartView } from './components/views/QuickStartView';

import logo from './assets/images/logo-universal.png';

// Custom Icons
const Icons = {
    Dashboard: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>,
    Link: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>,
    Power: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>,
    Key: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
    Lock: () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>,
};

function Dashboard() {
    const { addToast } = useToast();
    const [status, setStatus] = useState("disconnected");
    const [activeCloud, setActiveCloud] = useState("AWS");
    const [regions, setRegions] = useState<string[]>([]);
    const [region, setRegion] = useState("us-east-1");
    const [duration, setDuration] = useState("0");
    const [price, setPrice] = useState("-");
    const [log, setLog] = useState<string[]>([]);
    const [configs, setConfigs] = useState<{ name: string, config: string, qr_code: string }[]>([]);
    const [activePeerIndex, setActivePeerIndex] = useState(0);
    const [progressMsg, setProgressMsg] = useState("");

    // Auth State
    const [authStatus, setAuthStatus] = useState<main.AuthStatus | null>(null);
    const isAuthVerified = authStatus?.valid || false;

    // View State
    const [view, setView] = useState<'dashboard' | 'settings' | 'metrics' | 'credentials' | 'devices' | 'quickstart' | 'history'>('dashboard');
    const [metrics, setMetrics] = useState<any>(null);

    // Region latencies (ms per region, -1 = unreachable)
    const [regionLatencies, setRegionLatencies] = useState<Record<string, number>>({});

    // Orphans & Exit State
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [orphans, setOrphans] = useState<any[]>([]);

    const addLog = (msg: string) => setLog(prev => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg} `]);

    // Session Data for Timer
    const [sessionData, setSessionData] = useState<{ start: string, durationLimit: number } | null>(null);

    // Listen for Status & Events
    useEffect(() => {
        // Status updates
        EventsOn("connect-status", (msg: string) => {
            setProgressMsg(msg);
            addLog(msg);
        });

        // Close Request
        EventsOn("close-requested", () => {
            setShowExitConfirm(true);
        });

        // Orphans
        EventsOn("orphans-detected", (list: any[]) => {
            if (list && list.length > 0) {
                setOrphans(list);
            }
        });

        // Spot interruption (AWS reclaimed instance)
        EventsOn("spot-interrupted", (msg: string) => {
            setStatus("disconnected");
            setConfigs([]);
            setSessionData(null);
            addLog(`VPN node lost: ${msg}`);
            addToast(`VPN node terminated by cloud provider. Please reconnect.`, 'error');
        });

        // Auto-Destroy / Remote End
        EventsOn("session-ended", (summary: string) => {
            setStatus("disconnected");
            setConfigs([]);
            setSessionData(null); // Clear timer
            setAuthStatus({ valid: true } as any); // Keep auth valid
            // Add final log
            addLog("Session ended (Auto-Limit or Remote).");
            // Show toast
            addToast(`Session Ended: ${summary}`, 'info');
        });
    }, []);

    // Initial Auth Check
    useEffect(() => {
        checkStatus();
    }, [activeCloud, region]);

    const checkStatus = async () => {
        try {
            const stat = await GetCredentialStatus(region);
            setAuthStatus(stat);
        } catch (e) {
            console.error("Auth check failed", e);
            setAuthStatus({ valid: false, error: "System Error: " + e } as any);
        }
    };

    const handleSetProvider = async (provider: string) => {
        await SetProvider(provider);
        setActiveCloud(provider);
        setRegion(""); // Reset region
        setPrice("-");
        // Re-check auth for new provider
        checkStatus();
    };

    // Load Preferences on Mount
    useEffect(() => {
        GetPreferences().then(prefs => {
            if (prefs) {
                if (prefs.default_region) setRegion(prefs.default_region);
                if (prefs.default_duration) setDuration(prefs.default_duration.toString());
            }
        });
    }, []);

    // Fetch Regions after Auth
    useEffect(() => {
        if (!isAuthVerified) {
            setRegions([]);
            return;
        }

        const fetchRegions = async () => {
            try {
                const list = await GetRegions();
                if (list && list.length > 0) {
                    setRegions(list);
                    if (isAuthVerified) {
                        GetPrice(region).then(p => setPrice(p));
                    }
                    // Default to first if current not in list
                    if (!list.includes(region)) {
                        setRegion(list[0]);
                    }
                    // Fetch latencies in background — non-blocking
                    GetRegionLatencies(list).then((latencies: Record<string, number>) => {
                        if (latencies) setRegionLatencies(latencies);
                    }).catch(() => {});
                }
            } catch (err) {
                console.error("Failed to fetch regions:", err);
                setRegions([]);
            }
        };
        fetchRegions();
    }, [isAuthVerified, activeCloud]);

    // Check Price on Region Change
    useEffect(() => {
        if (!isAuthVerified || !region) return;
        setPrice("Checking...");
        GetPrice(region).then(setPrice);
    }, [region, isAuthVerified]);

    // Load Session
    useEffect(() => {
        GetSession().then((sess: any) => {
            if (sess && sess.InstanceID) {
                setStatus("connected");
                // Only if session matches current cloud? 
                // Currently app backend tracks active cloud for session launch, but frontend might need update.
                // Ideally session returns which cloud it is. For now assume AWS if restored or whatever backend defaults.
                setRegion(sess.Region);

                if (sess.AllConfigs && sess.AllConfigs.length > 0) {
                    setConfigs(sess.AllConfigs);
                } else if (sess.Config) {
                    setConfigs([{
                        name: 'Primary',
                        config: atob(sess.Config),
                        qr_code: ''
                    }]);
                }

                setSessionData({
                    start: sess.SessionStart,
                    durationLimit: sess.DurationMinutes || 0
                });

                addLog(`Session restored: ${sess.InstanceID} `);
                addToast(`Session restored: ${sess.InstanceID} `, 'info');
                // Assume valid if session active
                setAuthStatus({
                    valid: true,
                    identity: "Restored Session",
                    missing_permissions: []
                } as any);
            }
        });
    }, []);

    const handleConnect = async () => {
        if (!isAuthVerified) {
            setView('credentials');
            addToast("Please configure credentials first", "error");
            return;
        }

        // Clear previous logs for new session
        setLog([]);

        setStatus("connecting");
        setProgressMsg("Initializing...");
        addLog(`Initializing launch in ${region} (${activeCloud})...`);
        try {
            const currentDuration = parseInt(duration);
            const res = await Connect(region, currentDuration);
            setConfigs(res.configs);
            setActivePeerIndex(0);
            setStatus("connected");
            setProgressMsg("");

            setSessionData({
                start: new Date().toISOString(),
                durationLimit: currentDuration
            });

            addLog("Instance ready. Tunnel is active.");
            addToast("Instance ready. Tunnel is active.", 'success');
        } catch (err) {
            setStatus("disconnected");
            setProgressMsg("");
            addLog(`Error: ${err} `);
            addToast(`Connection failed: ${err} `, 'error');
        }
    };

    const handleDisconnect = async () => {
        setStatus("connecting");
        addLog("Terminating instance...");
        try {
            const summary = await Disconnect();
            setStatus("disconnected");
            setConfigs([]);
            setSessionData(null);
            addToast(summary, 'success');
            addLog("Session ended.");
        } catch (err) {
            setStatus("connected"); // Revert
            addLog(`Error terminating: ${err} `);
            addToast(`Error terminating: ${err} `, 'error');
        }
    };

    // Fetch Metrics when Metrics View is active
    const [realMetrics, setRealMetrics] = useState<any>(null);

    useEffect(() => {
        if (view === 'metrics' && status === 'connected') {
            // Initial Fetch
            GetInstanceDetails().then(setMetrics).catch(err => console.error("Details fetch failed", err));

            // Poll Instance Details (Status check) - every 30s
            const detailsInterval = setInterval(() => {
                GetInstanceDetails().then(setMetrics).catch(err => console.error("Details polling failed", err));
            }, 30000);

            // Poll Real Metrics - DISABLED (Using local Ping in MetricsView instead)
            // const pollMetrics = async () => {
            //     if (metrics && metrics.instance_id) {
            //         try {
            //             const m = await GetLatestMetrics(region, metrics.instance_id);
            //             setRealMetrics(m);
            //         } catch (e) {
            //             console.error("Metrics polling failed", e);
            //         }
            //     }
            // };

            // useEffect(() => {
            //     if (status !== 'connected') return;
            //     const t = setInterval(pollMetrics, 60000); // 60s
            //     pollMetrics();
            //     return () => clearInterval(t);
            // }, [status, metrics]);
            // pollMetrics(); // Immediate
            // const metricsInterval = setInterval(pollMetrics, 60000);

            return () => {
                clearInterval(detailsInterval);
                // clearInterval(metricsInterval); // Metrics polling disabled
            };
        } else {
            setMetrics(null);
            setRealMetrics(null);
        }
    }, [view, status, metrics?.instance_id]); // Depend on ID availability

    // Exit & Orphan Handlers
    const confirmExit = async () => {
        setShowExitConfirm(false);
        await TerminateAndQuit();
    };

    const cancelExit = () => {
        setShowExitConfirm(false);
    };

    const handleTerminateOrphan = async (idx: number) => {
        const o = orphans[idx];
        const newOrphans = [...orphans];
        newOrphans.splice(idx, 1);
        setOrphans(newOrphans);

        try {
            let regionTarget = o.availability_zone || 'us-east-1';
            // Simple logic: if ends with 'a', 'b', 'c', strip it.
            if (/[a-z]$/.test(regionTarget)) regionTarget = regionTarget.slice(0, -1);

            await TerminateInstance(o.provider || 'AWS', regionTarget, o.instance_id);
            addToast(`Terminated ${o.instance_id}`, 'success');
        } catch (e) {
            addToast(`Failed to terminate: ${e}`, 'error');
            setOrphans(prev => [...prev, o]);
        }
    };

    const handleTerminateAllOrphans = async () => {
        const list = [...orphans];
        setOrphans([]);

        for (const o of list) {
            try {
                let regionTarget = o.availability_zone || 'us-east-1';
                if (/[a-z]$/.test(regionTarget)) regionTarget = regionTarget.slice(0, -1);

                await TerminateInstance(o.provider || 'AWS', regionTarget, o.instance_id);
            } catch (e) {
                addToast(`Error terminating ${o.instance_id}`, 'error');
            }
        }
        addToast("Cleanup initiated.", 'info');
    };


    return (
        <div className="app-container">
            <ModernProgressBar status={status === 'connecting' ? 'connecting' : 'disconnected'} message={progressMsg} />

            {/* Sidebar */}
            <div className="modern-sidebar">
                <div className="sidebar-brand">
                    <img src={logo} alt="KlosedLoop Logo" className="w-8 h-8 rounded-full" />
                    <span className="ml-2 font-bold tracking-wider">KLOSEDLOOP</span>
                </div>

                <div className="sidebar-nav">
                    <button className={`sidebar-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
                        <Icons.Dashboard />
                        <span>Mission Control</span>
                    </button>
                    <button className={`sidebar-item ${view === 'quickstart' ? 'active' : ''}`} onClick={() => setView('quickstart')}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        <span>Quick Start</span>
                    </button>
                    <button className={`sidebar-item ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span>History</span>
                    </button>
                    <button className={`sidebar-item ${view === 'credentials' ? 'active' : ''}`} onClick={() => setView('credentials')}>
                        <Icons.Lock />
                        <span>Credentials</span>
                    </button>
                    <button className={`sidebar-item ${view === 'devices' ? 'active' : ''}`} onClick={() => setView('devices')}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        <span>Devices</span>
                    </button>
                    <button className={`sidebar-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        <span>Settings</span>
                    </button>
                    <button className={`sidebar-item ${view === 'metrics' ? 'active' : ''}`} onClick={() => setView('metrics')}>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        <span>Metrics</span>
                    </button>
                </div>

                <div className="sidebar-footer">
                    <div className="provider-badge">
                        <div className="text-muted text-xs">Cloud Provider</div>
                        <div style={{ color: '#fff', fontWeight: 'bold' }}>{activeCloud}</div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
                {view === 'dashboard' && (
                    <MissionControl
                        status={status}
                        progressMsg={progressMsg}
                        activeCloud={activeCloud}
                        isAuthVerified={isAuthVerified}
                        region={region}
                        regions={regions}
                        price={price}
                        duration={duration}
                        log={log}
                        configs={configs}
                        sessionData={sessionData}
                        regionLatencies={regionLatencies}
                        onSetProvider={handleSetProvider}
                        onRegionChange={setRegion}
                        onDurationChange={setDuration}
                        onConnect={handleConnect}
                        onDisconnect={handleDisconnect}
                    />
                )}

                {view === 'credentials' && (
                    <>
                        <header className="header" style={{ marginBottom: '2rem' }}>
                            <div>
                                <h1>Credentials</h1>
                                <p className="text-muted">Manage cloud provider access</p>
                            </div>
                        </header>
                        <CredentialsView
                            activeCloud={activeCloud}
                            authStatus={authStatus}
                            isAuthVerified={isAuthVerified}
                            onAuthUpdate={checkStatus}
                            addToast={addToast}
                        />
                    </>
                )}

                {view === 'settings' && (
                    <>
                        <header className="header" style={{ marginBottom: '2rem' }}>
                            <div><h1>Settings</h1><p className="text-muted">Configure preferences</p></div>
                        </header>

                        <SettingsView addToast={addToast} />
                    </>
                )}

                {view === 'metrics' && (
                    <>
                        <header className="header" style={{ marginBottom: '2rem' }}>
                            <div><h1>Instance Metrics</h1><p className="text-muted">Live operational telemetry</p></div>
                        </header>
                        {view === 'metrics' && <MetricsView metrics={metrics} region={region} status={status} />}
                    </>
                )}

                {view === 'devices' && (
                    <DevicesView status={status} addToast={addToast} configs={configs} />
                )}

                {view === 'quickstart' && (
                    <QuickStartView addToast={addToast} onComplete={() => setView('dashboard')} />
                )}

                {view === 'history' && (
                    <HistoryView addToast={addToast} />
                )}
            </div>

            {/* Orphan Alert Modal */}
            {orphans.length > 0 && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(50,0,0,0.8)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                }}>
                    <div className="modern-card" style={{ maxWidth: '600px', width: '100%', border: '1px solid var(--accent-danger)' }}>
                        <h2 style={{ color: 'var(--accent-danger)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Orphaned Instances Detected
                        </h2>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            The following instances are running but not managed by your active session. They will incur costs if not stopped.
                            <br /><small>(Detected via Project tag: klosedloop)</small>
                        </p>

                        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                            {orphans.map((o, i) => (
                                <div key={i} style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{o.instance_id}</div>
                                        <div className="text-xs text-muted">{o.provider} • {o.availability_zone} • {o.launch_time}</div>
                                    </div>
                                    <button onClick={() => handleTerminateOrphan(i)} style={{ fontSize: '0.8rem', color: 'var(--accent-danger)', border: '1px solid var(--accent-danger)', padding: '2px 8px', borderRadius: '4px' }}>
                                        Terminate
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={() => setOrphans([])} style={{ padding: '0.5rem 1rem', color: '#fff', opacity: 0.8 }}>Ignore</button>
                            <button onClick={handleTerminateAllOrphans} style={{
                                background: 'var(--accent-danger)', color: 'white',
                                padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold'
                            }}>
                                Terminate All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Exit Confirmation Modal */}
            {showExitConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                }}>
                    <div className="modern-card" style={{ maxWidth: '400px', width: '100%', border: '1px solid var(--accent-danger)' }}>
                        <h2 style={{ color: 'var(--accent-danger)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                            Active Session Detected
                        </h2>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            An EC2 instance is currently running. Exiting now will terminate the instance to prevent unwanted costs.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button onClick={cancelExit} style={{ padding: '0.5rem 1rem', color: '#fff', opacity: 0.8 }}>Cancel</button>
                            <button onClick={confirmExit} style={{
                                background: 'var(--accent-danger)', color: 'white',
                                padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: 'bold'
                            }}>
                                Terminate & Quit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function App() {
    return (
        <ToastProvider>
            <Dashboard />
        </ToastProvider>
    )
}
