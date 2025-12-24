'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Mail, ArrowRight } from 'lucide-react';

export default function Home() {
    const [username, setUsername] = useState('');
    const [domain, setDomain] = useState('tempmail.net'); // Placeholder domain
    const router = useRouter();
    const [history, setHistory] = useState<string[]>([]);

    useEffect(() => {
        const stored = localStorage.getItem('tempmail_history');
        if (stored) {
            setHistory(JSON.parse(stored));
        }
    }, []);

    const handleCreate = () => {
        if (!username) return;
        const fullEmail = `${username}@${domain}`;

        // Save to history
        const newHistory = [fullEmail, ...history.filter(h => h !== fullEmail)].slice(0, 5); // Keep top 5
        localStorage.setItem('tempmail_history', JSON.stringify(newHistory));

        router.push(`/inbox/${fullEmail}`);
    };

    const handleRandom = () => {
        const randomName = Math.random().toString(36).substring(7);
        setUsername(randomName);
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-950">
            <div className="absolute top-4 right-4 text-sm text-slate-500">
                Backend: Running on :8080 | SMTP: :25
            </div>

            <div className="z-10 w-full max-w-md items-center justify-center font-mono text-sm">
                <Card className="w-full shadow-lg border-2 border-slate-200 dark:border-slate-800">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-primary/10 p-4 rounded-full w-fit mb-4">
                            <Mail className="h-10 w-10 text-primary" />
                        </div>
                        <CardTitle className="text-3xl font-bold tracking-tight text-primary">TempMail</CardTitle>
                        <CardDescription>
                            Create a disposable email address instantly. Valid for 1 hour.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex space-x-2">
                            <Input
                                type="text"
                                placeholder="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                                className="text-lg py-6"
                            />
                            <div className="flex items-center justify-center px-4 bg-slate-100 dark:bg-slate-800 rounded-md border border-input text-slate-500">
                                @{domain}
                            </div>
                        </div>
                        <div className="flex justify-between items-center text-xs text-slate-500 px-1">
                            <button onClick={handleRandom} className="hover:text-primary underline">
                                Generate Random
                            </button>
                        </div>
                    </CardContent>
                    <CardFooter>
                        <Button className="w-full text-lg py-6" onClick={handleCreate} disabled={!username}>
                            Create Temporary Email <ArrowRight className="ml-2 h-5 w-5" />
                        </Button>
                    </CardFooter>
                </Card>

                {history.length > 0 && (
                    <div className="mt-8">
                        <h3 className="text-slate-500 mb-2 text-center text-xs uppercase tracking-wider">Recent Emails</h3>
                        <div className="space-y-2">
                            {history.map(email => (
                                <div
                                    key={email}
                                    onClick={() => router.push(`/inbox/${email}`)}
                                    className="bg-white dark:bg-slate-900 p-3 rounded-md shadow-sm border border-slate-100 dark:border-slate-800 flex justify-between items-center cursor-pointer hover:border-primary/50 transition-colors"
                                >
                                    <span className="text-slate-700 dark:text-slate-300">{email}</span>
                                    <ArrowRight className="h-4 w-4 text-slate-400" />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
