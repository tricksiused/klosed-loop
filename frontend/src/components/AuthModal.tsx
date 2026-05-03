import { useState } from 'react';
import { SaveAuth } from '../../wailsjs/go/main/App';
import { useToast } from './Toaster';

interface AuthModalProps {
    isOpen: boolean;
    onSuccess: () => void;
}

export function AuthModal({ isOpen, onSuccess }: AuthModalProps) {
    const { addToast } = useToast();
    const [accessKey, setAccessKey] = useState("");
    const [secretKey, setSecretKey] = useState("");
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!accessKey || !secretKey) {
            addToast("Please enter both keys", 'error');
            return;
        }

        setLoading(true);
        try {
            await SaveAuth(accessKey, secretKey);
            addToast("Credentials verified & saved!", 'success');
            onSuccess();
        } catch (err) {
            addToast(`Verification failed: ${err}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }}>
            <div className="modal-content" style={{
                background: '#1e293b', border: '1px solid #334155', borderRadius: '12px',
                padding: '2rem', maxWidth: '450px', width: '100%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#fff' }}>AWS Setup Required</h2>
                    <p className="text-muted">
                        Active AWS credentials were not found or valid.
                        Please provide an Access Key pair to continue.
                    </p>
                </div>

                <div className="form-group">
                    <label>Access Key ID</label>
                    <input
                        type="text"
                        value={accessKey}
                        onChange={e => setAccessKey(e.target.value)}
                        placeholder="AKIA..."
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '0.75rem', borderRadius: '6px', color: '#fff' }}
                    />
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>Secret Access Key</label>
                    <input
                        type="password"
                        value={secretKey}
                        onChange={e => setSecretKey(e.target.value)}
                        placeholder="wJalr..."
                        style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', padding: '0.75rem', borderRadius: '6px', color: '#fff' }}
                    />
                </div>

                <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem', borderRadius: '6px', marginTop: '1.5rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                    <strong>Note:</strong> Keys are saved locally to <code style={{ color: '#60a5fa' }}>~/.aws/credentials</code>.
                </div>

                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="btn-launch"
                    style={{ width: '100%', marginTop: '1.5rem', justifyContent: 'center' }}
                >
                    {loading ? 'Verifying...' : 'Save & Continue'}
                </button>
            </div>
        </div>
    );
}
