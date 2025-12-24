"use client"

import * as React from "react"

import { X } from "lucide-react"

import { cn } from "@/lib/utils"

// Since I cannot install @radix-ui/react-dialog easily if npm is broken,
// I will create a simple custom Dialog implementation using standard React Portals or just absolute positioning for now.
// Wait, if I assume npm install works for dependencies in package.json, I can use it.
// I added "radix-ui" to package.json? No I didn't.
// I added "lucide-react", "clsx", etc. but NOT @radix-ui/react-dialog.
// So I must implement a pure React Dialog.

const Dialog = ({ children, open, onOpenChange }: { children: React.ReactNode, open?: boolean, onOpenChange?: (open: boolean) => void }) => {
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange?.(false)}>
            <div onClick={e => e.stopPropagation()}>
                {children}
            </div>
        </div>
    );
};

const DialogContent = ({ children, className }: { children: React.ReactNode, className?: string }) => {
    return (
        <div className={cn("relative w-full max-w-lg overflow-hidden rounded-md border bg-background p-6 shadow-lg sm:rounded-lg", className)}>
            {children}
        </div>
    )
}

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)}
        {...props}
    />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div
        className={cn(
            "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
            className
        )}
        {...props}
    />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
    <h2
        ref={ref}
        className={cn(
            "text-lg font-semibold leading-none tracking-tight",
            className
        )}
        {...props}
    />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
    HTMLParagraphElement,
    React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
    <p
        ref={ref}
        className={cn("text-sm text-muted-foreground", className)}
        {...props}
    />
))
DialogDescription.displayName = "DialogDescription"

export {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
}
