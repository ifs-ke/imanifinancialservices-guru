// src/components/layout/FloatingChatButton.tsx
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MessageCircle, Phone, ScreenShare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function FloatingChatButton() {
    const { toast } = useToast();

    const handleActionClick = (action: string) => {
        toast({
            title: `${action} Initiated`,
            description: `Placeholder for ${action.toLowerCase()} functionality.`,
        });
        console.log(`${action} clicked`);
        // In a real app, you would trigger the corresponding service here.
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="default" // Use primary color
                    size="icon"
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 flex items-center justify-center"
                    aria-label="Open support options"
                >
                    <MessageCircle className="h-6 w-6" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 mb-2" side="top" align="end"> {/* Position popover above and aligned to the end */}
                <div className="grid gap-2">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 px-2"
                        onClick={() => handleActionClick('Live Chat')}
                    >
                        <MessageCircle className="h-4 w-4" />
                        <span>Live Chat</span>
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 px-2"
                        onClick={() => handleActionClick('Live Call')}
                    >
                        <Phone className="h-4 w-4" />
                        <span>Live Call</span>
                    </Button>
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-2 px-2"
                        onClick={() => handleActionClick('Share Screen')}
                    >
                        <ScreenShare className="h-4 w-4" />
                        <span>Share Screen</span>
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
