import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';

export const alt = 'TempMail — 1회용 이메일';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
    const logoData = await readFile(join(process.cwd(), 'public/icon-512.png'));
    const logo = `data:image/png;base64,${logoData.toString('base64')}`;

    return new ImageResponse(
        (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #3b82f6 100%)',
                }}
            >
                <img src={logo} width={180} height={180} style={{ borderRadius: 42 }} />
                <div
                    style={{
                        marginTop: 36,
                        fontSize: 100,
                        fontWeight: 800,
                        color: '#ffffff',
                        letterSpacing: -3,
                    }}
                >
                    TempMail
                </div>
                <div style={{ marginTop: 14, fontSize: 38, color: '#e0e7ff' }}>
                    Disposable email · No sign-up · Gone in 1 hour
                </div>
            </div>
        ),
        { ...size }
    );
}
