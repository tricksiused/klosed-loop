
import React from 'react';

interface ModernProgressBarProps {
    status: 'connecting' | 'connected' | 'disconnected';
    message: string;
}

export const ModernProgressBar: React.FC<ModernProgressBarProps> = ({ status, message }) => {
    if (status !== 'connecting') return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(5px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'fadeIn 0.3s ease-out'
        }}>
            <div style={{
                background: 'rgba(30, 41, 59, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '2rem',
                borderRadius: '16px',
                width: '400px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                textAlign: 'center'
            }}>
                <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        margin: '0 auto',
                        borderRadius: '50%',
                        border: '3px solid rgba(59, 130, 246, 0.3)',
                        borderTopColor: '#3b82f6',
                        animation: 'spin 1s linear infinite'
                    }}></div>
                </div>

                <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 600,
                    color: '#f8fafc',
                    marginBottom: '0.5rem'
                }}>Configuring Secure Tunnel</h3>

                <p style={{
                    color: '#94a3b8',
                    fontSize: '0.9rem',
                    marginBottom: '1.5rem',
                    height: '1.2rem' // Prevent layout shift
                }}>{message || "Initializing..."}</p>

                {/* Simulated Progress Bar for Visual Feedback */}
                <div style={{
                    width: '100%',
                    height: '4px',
                    background: 'rgba(255,255,255,0.1)',
                    borderRadius: '2px',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: '30%',
                        background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        borderRadius: '2px',
                        animation: 'indeterminate 1.5s infinite linear'
                    }}></div>
                </div>

                <style>{`
                    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    @keyframes indeterminate { 
                        0% { left: -30%; width: 30%; } 
                        50% { left: 40%; width: 30%; } 
                        100% { left: 100%; width: 30%; } 
                    }
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                `}</style>
            </div>
        </div>
    );
};
