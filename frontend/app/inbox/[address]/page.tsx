'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io } from 'socket.io-client';
import DOMPurify from 'dompurify';
import { formatDistanceToNow } from 'date-fns';
import { Trash2, RefreshCcw, Copy, Clock, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Email {
    from: string;
    subject: string;
    text: string;
    html: string;
    date: string;
    // to: string;
}

export default function Inbox() {
    const params = useParams();
    const address = decodeURIComponent(params.address as string);
    const router = useRouter();

    const [emails, setEmails] = useState<Email[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
    const [timeLeft, setTimeLeft] = useState(3600); // 1 hour in seconds
    const [copySuccess, setCopySuccess] = useState(false);

    // API URL - Assume backend is on port 8080.
    // In dev, we might need to proxy or use localhost:8080.
    // For now, hardcode or use env.
    const API_URL = 'http://localhost:8080';

    const fetchEmails = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/inbox/${address}`);
            if (res.ok) {
                const data = await res.json();
                // Redis LPRUSH adds to left (head), so index 0 is newest.
                // Depending on if Haraka did RPUSH or LPUSH. Haraka plugin did RPUSH (tail).
                // So index 0 is oldest. We might want to reverse.
                setEmails(data.reverse());
            }
        } catch (error) {
            console.error('Failed to fetch emails', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmails();

        const socket = io(API_URL);

        socket.on('connect', () => {
            console.log('Connected to socket');
            socket.emit('subscribe', address);
        });

        socket.on('NEW_MAIL_RECEIVED', () => {
            console.log('New mail received!');
            fetchEmails(); // Reload
            // Optional: Show toast
        });

        return () => {
            socket.disconnect();
        };
    }, [address]);

    // Timer Logic
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 0) return 0;
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(address);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    const handleDelete = () => {
        alert("Deletion not fully implemented on backend yet");
        // Implement DELETE API call
    };

    return (
        <main className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-8">
            <div className="max-w-5xl mx-auto space-y-6">

                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-primary/10 rounded-full">
                            <Mail className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                {address}
                                <Button variant="ghost" size="icon" onClick={handleCopy} className="h-6 w-6">
                                    <Copy className="h-4 w-4 text-slate-400 hover:text-primary" />
                                </Button>
                            </h1>
                            {copySuccess && <span className="text-xs text-green-500">Copied!</span>}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={cn("text-2xl font-mono font-bold flex items-center gap-2", timeLeft < 300 ? "text-red-500" : "text-primary")}>
                            <Clock className="h-5 w-5" />
                            {formatTime(timeLeft)}
                        </div>
                        <Button variant="outline" size="sm" onClick={fetchEmails}>
                            <RefreshCcw className="h-4 w-4 mr-2" /> Refresh
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => router.push('/')}>
                            Stop
                        </Button>
                    </div>
                </div>

                {/* Mail List */}
                <Card>
                    <CardHeader>
                        <CardTitle>Inbox ({emails.length})</CardTitle>
                        <CardDescription>Emails will automatically appear here.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="text-center py-10 text-slate-500">Loading messages...</div>
                        ) : emails.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-lg border border-dashed">
                                <Mail className="h-12 w-12 mx-auto text-slate-300 mb-2" />
                                <p className="text-slate-500">Waiting for incoming emails...</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[200px]">Sender</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead className="w-[150px] text-right">Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {emails.map((email, i) => (
                                        <TableRow
                                            key={i}
                                            className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                                            onClick={() => setSelectedEmail(email)}
                                        >
                                            <TableCell className="font-medium">{email.from}</TableCell>
                                            <TableCell>{email.subject || '(No Subject)'}</TableCell>
                                            <TableCell className="text-right text-slate-500">
                                                {formatDistanceToNow(new Date(email.date), { addSuffix: true })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Detail Modal */}
            <Dialog open={!!selectedEmail} onOpenChange={(open) => !open && setSelectedEmail(null)}>
                {selectedEmail && (
                    <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
                        <DialogHeader>
                            <DialogTitle className="text-xl">{selectedEmail.subject}</DialogTitle>
                            <DialogDescription className="text-slate-500">
                                From: {selectedEmail.from} <br />
                                Date: {new Date(selectedEmail.date).toLocaleString()}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-auto mt-4 border rounded-md p-4 bg-white">
                            {/* Security: Use DOMPurify */}
                            <div
                                dangerouslySetInnerHTML={{
                                    __html: DOMPurify.sanitize(selectedEmail.html || selectedEmail.text || '')
                                }}
                                className="prose max-w-none dark:prose-invert"
                            />
                        </div>
                        <div className="flex justify-end mt-4">
                            <Button variant="secondary" onClick={() => setSelectedEmail(null)}>Close</Button>
                        </div>
                    </DialogContent>
                )}
            </Dialog>
        </main>
    );
}
