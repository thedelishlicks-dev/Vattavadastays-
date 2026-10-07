// Shows the owner's cancellation policy and house rules on the guest
// booking form and confirmation. Renders nothing when the owner hasn't
// written any, so it never shows an empty box.

import { extractPolicies, hasPolicies } from "@/lib/policies";

type Props = {
  sharedAmenities: string[] | null | undefined;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  /** Open by default on the confirmation screen, collapsed on the form. */
  defaultOpen?: boolean;
};

export function GuestPolicies({ sharedAmenities, checkInTime, checkOutTime, defaultOpen = false }: Props) {
  const policies = extractPolicies(sharedAmenities);
  if (!hasPolicies(policies)) return null;

  return (
    <details
      open={defaultOpen}
      className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm"
    >
      <summary className="cursor-pointer select-none font-medium">
        Cancellation policy &amp; house rules
      </summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        {(checkInTime || checkOutTime) && (
          <p className="text-xs">
            {checkInTime ? `Check-in ${checkInTime}` : ""}
            {checkInTime && checkOutTime ? " · " : ""}
            {checkOutTime ? `Check-out ${checkOutTime}` : ""}
          </p>
        )}
        {policies.cancellation && (
          <div>
            <p className="text-xs uppercase tracking-wider font-medium text-foreground">Cancellation</p>
            <p className="mt-1 whitespace-pre-line">{policies.cancellation}</p>
          </div>
        )}
        {policies.rules && (
          <div>
            <p className="text-xs uppercase tracking-wider font-medium text-foreground">House rules</p>
            <p className="mt-1 whitespace-pre-line">{policies.rules}</p>
          </div>
        )}
      </div>
    </details>
  );
}
