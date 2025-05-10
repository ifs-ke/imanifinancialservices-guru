
"use client"

import { Button, type ButtonProps } from "@/components/ui/button" // Import ButtonProps
import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Copy } from "lucide-react" 

export function Toaster() {
  const { toasts, toast: displayToast } = useToast() 

  const handleCopy = async (description: React.ReactNode) => {
    if (typeof description !== 'string' || !navigator.clipboard) {
      console.error("Cannot copy description or clipboard API unavailable.");
      displayToast({
        title: "Copy Failed",
        description: "Could not copy the error message.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(description);
      displayToast({
        title: "Copied!",
        description: "Error message copied to clipboard.",
      });
    } catch (err) {
      console.error("Failed to copy description:", err);
       displayToast({
        title: "Copy Failed",
        description: "Could not copy the error message.",
        variant: "destructive",
      });
    }
  };

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
             <div className="grid gap-1 flex-grow mr-2"> 
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
             {variant === "destructive" && typeof description === 'string' && (
               <Button
                 variant="ghost"
                 size="icon"
                 className="h-8 w-8 text-destructive-foreground hover:bg-destructive/80" 
                 onClick={() => handleCopy(description)}
               >
                 <Copy className="h-4 w-4" />
                 <span className="sr-only">Copy Error</span>
               </Button>
             )}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}

