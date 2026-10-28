import { MessageCircle, X } from "lucide-react";

/**
 * Shown right after a booking becomes confirmed (Confirm button, Confirm all, or
 * an advance payment that confirms it). The owner taps the green button to send the
 * guest their confirmation and tracking link on WhatsApp.
 *
 * Why a button and not an automatic WhatsApp window: browsers (Safari and in-app
 * browsers especially) block a window that opens after a save has finished waiting on
 * the network. A real tap always works, and it keeps the owner in control of what is sent.
 */
export interface ConfirmationPromptData {
  guestName: string;
  /** A ready-to-open wa.me link with the confirmation text and tracking link. */
  href: string;
}

export function SendConfirmationPrompt({ data, onDismiss }: { data: ConfirmationPromptData; onDismiss: () => void }) {
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-[60] space-y-3 rounded-2xl border border-[#25D366]/40 bg-card p-4 shadow-xl md:left-auto md:right-6 md:w-96">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm">
          <div className="font-semibold">Booking confirmed ✅</div>
          <div className="mt-0.5 text-muted-foreground">Send {data.guestName} the confirmation and tracking link on WhatsApp.</div>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="-mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <a href={data.href} target="_blank" rel="noreferrer" onClick={onDismiss} className="flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90">
        <MessageCircle className="h-4 w-4" />
        Send confirmation on WhatsApp
      </a>
      <button type="button" onClick={onDismiss} className="w-full text-center text-xs text-muted-foreground underline hover:text-foreground">
        Not now — I'll send it later
      </button>
    </div>
  );
}
