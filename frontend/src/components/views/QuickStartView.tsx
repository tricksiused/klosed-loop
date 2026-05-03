import React, { useState } from 'react';
import { SaveProfile, SetActiveProfile, SaveTemplate, GetCredentialStatus } from '../../../wailsjs/go/main/App';
import { BrowserOpenURL } from '../../../wailsjs/runtime/runtime';
// @ts-ignore
import cfTemplate from '../../assets/cloudformation.yaml?raw';

// Shared Icons
const Icons = {
    ShieldCheck: () => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>,
    Download: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
    Copy: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>,
    External: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
};

interface QuickStartViewProps {
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    onComplete: () => void;
}

export const QuickStartView: React.FC<QuickStartViewProps> = ({ addToast, onComplete }) => {
    // Form State
    const [formName, setFormName] = useState("quickstart");
    const [formKey, setFormKey] = useState("");
    const [formSecret, setFormSecret] = useState("");

    // UI State
    const [loading, setLoading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [copied, setCopied] = useState(false);
    const [makeActive, setMakeActive] = useState(true);

    // Verification State
    const [verificationStatus, setVerificationStatus] = useState<any>(null);

    const handleCopyTemplate = () => {
        navigator.clipboard.writeText(cfTemplate);
        setCopied(true);
        addToast("Template copied to clipboard!", "success");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadTemplate = async () => {
        try {
            const res = await SaveTemplate(cfTemplate);
            if (res !== "Cancelled") {
                addToast(res, "success");
            }
        } catch (e: any) {
            addToast("Save failed: " + e.message, "error");
        }
    };

    const handleOpenConsole = () => {
        BrowserOpenURL("https://console.aws.amazon.com/cloudformation/home#/stacks/create/template");
    };

    const handleSaveAndVerify = async () => {
        if (!formName || !formKey || !formSecret) {
            return addToast("Please fill in all fields", "error");
        }

        setLoading(true);
        setVerificationStatus(null);

        try {
            // 1. Save Profile
            await SaveProfile(formName, formKey, formSecret, "");

            if (makeActive) {
                // 2. Set Active
                await SetActiveProfile(formName);
                // 3. Verify
                const status = await GetCredentialStatus("us-east-1");
                if (!status.valid) throw new Error(status.error || "Auth failed during verification.");

                setVerificationStatus(status);
                addToast(`Profile '${formName}' verified and active.`, "success");
            } else {
                setVerificationStatus({ valid: true, identity: "Saved (Not Active)" });
                addToast(`Profile '${formName}' saved.`, "success");
            }

            setTimeout(() => onComplete(), 1500);

        } catch (e: any) {
            addToast("Error: " + e.message, "error");
            setVerificationStatus({ valid: false, error: e.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            height: '100%',
            overflowY: 'auto',
            paddingRight: '1rem', // Space for scrollbar
            paddingBottom: '3rem'
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <header style={{ marginBottom: '1rem' }}>
                    <h1 style={{ fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(to right, #fff, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.5rem' }}>Quick Start Guide</h1>
                    <p className="text-muted" style={{ fontSize: '1rem' }}>Deploy a secure, isolated environment in minutes.</p>
                </header>

                {/* Step 1: Template */}
                <div className="modern-card" style={{ position: 'relative', overflow: 'visible' }}>
                    <div style={{ position: 'absolute', top: -20, left: -20, width: 40, height: 40, background: '#a855f7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', boxShadow: '0 0 15px rgba(168, 85, 247, 0.4)', zIndex: 10 }}>1</div>
                    <div style={{ paddingLeft: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>Get the Security Matrix</h2>
                        <p className="text-muted" style={{ marginBottom: '1rem', lineHeight: '1.5' }}>
                            We use a <strong>CloudFormation Template</strong> to create a confined IAM User. This ensures KlosedLoop only has permission to manage its own isolated resources.
                        </p>

                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button onClick={handleDownloadTemplate} className="btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icons.Download /> Download YAML
                            </button>
                            <button onClick={handleCopyTemplate} className="btn-secondary" style={{ background: 'rgba(255,255,255,0.1)', padding: '0.6rem 1rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Icons.Copy /> {copied ? 'Copied!' : 'Copy to Clipboard'}
                            </button>
                            <button onClick={() => setShowPreview(!showPreview)} style={{ color: '#a855f7', fontSize: '0.9rem', textDecoration: 'underline' }}>
                                {showPreview ? 'Hide Source' : 'View Source'}
                            </button>
                        </div>

                        {showPreview && (
                            <pre style={{ marginTop: '1rem', padding: '1rem', background: '#0f172a', borderRadius: '8px', overflowX: 'auto', fontSize: '0.8rem', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)' }}>
                                {cfTemplate}
                            </pre>
                        )}
                    </div>
                </div>

                {/* Step 2: Deploy */}
                <div className="modern-card" style={{ position: 'relative', overflow: 'visible' }}>
                    <div style={{ position: 'absolute', top: -20, left: -20, width: 40, height: 40, background: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)', zIndex: 10 }}>2</div>
                    <div style={{ paddingLeft: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>Deploy Infrastructure</h2>
                        <p className="text-muted" style={{ marginBottom: '1rem' }}>
                            Upload the template to AWS to create the stack. Wait for the status to reach <span style={{ color: '#4ade80', fontFamily: 'monospace' }}>CREATE_COMPLETE</span>.
                        </p>
                        <button
                            onClick={handleOpenConsole}
                            style={{
                                background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                                padding: '0.8rem 1.5rem', borderRadius: '8px', color: 'white', fontWeight: 600,
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                            }}
                        >
                            Launch Console <Icons.External />
                        </button>
                    </div>
                </div>

                {/* Step 3: Connect */}
                <div className="modern-card" style={{ position: 'relative', border: '1px solid rgba(168, 85, 247, 0.3)', overflow: 'visible' }}>
                    <div style={{ position: 'absolute', top: -20, left: -20, width: 40, height: 40, background: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem', boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)', zIndex: 10 }}>3</div>
                    <div style={{ paddingLeft: '1.5rem' }}>
                        <h2 style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>Establish Uplink</h2>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Find the <strong>Outputs</strong> tab in the AWS Stack details. Copy the keys below to authorize the client.
                        </p>

                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>Profile Name</label>
                                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '6px', color: 'white', marginTop: '4px' }}
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>Access Key ID</label>
                                    <input type="text" value={formKey} onChange={e => setFormKey(e.target.value)} placeholder="AKIA..."
                                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '6px', color: 'white', marginTop: '4px', fontFamily: 'monospace' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.05em' }}>Secret Access Key</label>
                                    <input type="password" value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="Secret..."
                                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.75rem', borderRadius: '6px', color: 'white', marginTop: '4px', fontFamily: 'monospace' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <input type="checkbox" checked={makeActive} onChange={e => setMakeActive(e.target.checked)} id="qs-active" style={{ width: 'auto' }} />
                                <label htmlFor="qs-active" style={{ color: '#cbd5e1', fontSize: '0.9rem', cursor: 'pointer' }}>Set as Active Profile</label>
                            </div>

                            <button
                                onClick={handleSaveAndVerify} disabled={loading}
                                className="btn-launch"
                                style={{ marginTop: '1rem', borderRadius: '8px' }}
                            >
                                {loading ? 'Verifying...' : 'Initialize System'}
                            </button>

                            {verificationStatus && (
                                <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '8px', background: verificationStatus.valid ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${verificationStatus.valid ? '#10b981' : '#ef4444'}`, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    {verificationStatus.valid ? <Icons.ShieldCheck /> : <span style={{ fontSize: '1.2rem' }}>⚠️</span>}
                                    <div>
                                        <div style={{ fontWeight: 600, color: verificationStatus.valid ? '#34d399' : '#fca5a5' }}>
                                            {verificationStatus.valid ? "System Verified" : "Verification Failed"}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                                            {verificationStatus.valid ? "Identity confirmed. Redirecting..." : verificationStatus.error}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
